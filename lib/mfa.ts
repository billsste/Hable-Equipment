import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// ─── TOTP (RFC 6238) ──────────────────────────────────────────────────────────
// Pure-stdlib implementation. SHA-1, 30-second step, 6 digits — the defaults
// every authenticator app (Google Authenticator, 1Password, Authy, Bitwarden,
// iCloud Keychain, etc.) expects.

const STEP_SECONDS = 30;
const DIGITS = 6;

// Base32 (RFC 4648, no padding) — the alphabet authenticator apps consume.
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += B32[(value << (5 - bits)) & 31];
  }
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, "").toUpperCase().replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const c of clean) {
    const idx = B32.indexOf(c);
    if (idx < 0) throw new Error("Invalid base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// 20 random bytes → 32 base32 chars; the size every TOTP authenticator
// recommends.
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

function counterToBuffer(counter: number): Buffer {
  const b = Buffer.alloc(8);
  // JS bitwise ops are 32-bit; split into hi/lo so we keep all 64 bits.
  b.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  b.writeUInt32BE(counter >>> 0, 4);
  return b;
}

function hotp(secret: Buffer, counter: number): string {
  const hmac = createHmac("sha1", secret).update(counterToBuffer(counter)).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (code % 10 ** DIGITS).toString().padStart(DIGITS, "0");
}

export function generateTotp(secret: string, now: number = Date.now()): string {
  const counter = Math.floor(now / 1000 / STEP_SECONDS);
  return hotp(base32Decode(secret), counter);
}

// Verify a TOTP token. `window` is the number of ±steps tolerated for clock
// skew (1 = ±30s, which is the industry standard). Constant-time compares to
// avoid timing oracles.
export function verifyTotp(
  secret: string,
  token: string,
  options: { window?: number; now?: number } = {},
): boolean {
  const clean = (token ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const window = options.window ?? 1;
  const now = options.now ?? Date.now();
  const counter = Math.floor(now / 1000 / STEP_SECONDS);
  const key = base32Decode(secret);
  for (let i = -window; i <= window; i++) {
    const expected = hotp(key, counter + i);
    const a = Buffer.from(expected);
    const b = Buffer.from(clean);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

// otpauth:// URL — what QR codes encode and what authenticator apps scan to
// pre-fill issuer/label/secret in one step.
export function otpauthUrl(opts: {
  secret: string;
  account: string;
  issuer: string;
}): string {
  const issuer = encodeURIComponent(opts.issuer);
  const account = encodeURIComponent(opts.account);
  return `otpauth://totp/${issuer}:${account}?secret=${opts.secret}&issuer=${issuer}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

// ─── Backup codes ─────────────────────────────────────────────────────────────
// Single-use recovery codes. Stored as SHA-256 hex hashes so a DB read can't
// expose them; the cleartext is shown to the user once at enrollment and never
// recovered.

export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    // 8 hex chars chunked to "XXXX-XXXX" for readability when copy-pasting.
    const raw = randomBytes(4).toString("hex").toUpperCase();
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}`);
  }
  return codes;
}

export function hashBackupCode(code: string): string {
  // Normalize before hashing: case-insensitive, dash-optional, no whitespace.
  const norm = code.replace(/[-\s]/g, "").toUpperCase();
  return createHash("sha256").update(norm).digest("hex");
}

// Returns the matching hash if found, so the caller can atomically remove it
// from the user's stored list (single-use enforcement).
export function findBackupCodeHash(
  code: string,
  storedHashes: string[],
): string | null {
  const candidate = hashBackupCode(code);
  if (!/^[a-f0-9]{64}$/.test(candidate)) return null;
  for (const stored of storedHashes) {
    if (stored.length !== candidate.length) continue;
    if (timingSafeEqual(Buffer.from(stored, "hex"), Buffer.from(candidate, "hex"))) {
      return stored;
    }
  }
  return null;
}

// ─── MFA challenge token ──────────────────────────────────────────────────────
// Between the password step and the TOTP step we issue a short-lived signed
// token (not a full session cookie). It only encodes the user ID and an
// expiry; it cannot be used to call any authenticated API. The login route
// swaps it for a real session once the TOTP/backup code verifies.

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes — enough time to fish out a phone.

function getChallengeSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be set (>=16 chars) in production");
  }
  return "ed-dev-secret-do-not-use-in-prod";
}

export function createChallengeToken(userId: number): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, expiresAt: Date.now() + CHALLENGE_TTL_MS, k: "mfa" }),
    "utf8",
  ).toString("base64url");
  const sig = createHmac("sha256", getChallengeSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function readChallengeToken(token: string): { userId: number } | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", getChallengeSecret()).update(payload).digest("base64url");
  const a = Buffer.from(sig, "base64url");
  const b = Buffer.from(expected, "base64url");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      userId?: number; expiresAt?: number; k?: string;
    };
    if (parsed.k !== "mfa") return null;
    if (typeof parsed.userId !== "number" || typeof parsed.expiresAt !== "number") return null;
    if (Date.now() > parsed.expiresAt) return null;
    return { userId: parsed.userId };
  } catch {
    return null;
  }
}

export const MFA_CHALLENGE_COOKIE = "ed_mfa_challenge";
export const MFA_CHALLENGE_MAX_AGE = CHALLENGE_TTL_MS / 1000;
