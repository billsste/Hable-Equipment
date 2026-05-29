import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { equipStore, User } from "./equip-store";

// ─── Session Management ───────────────────────────────────────────────────────

export const SESSION_COOKIE = "ed_session";
// HIPAA §164.312(a)(2)(iii) "automatic logoff" — addressable, no fixed time.
// NIST SP 800-66 / CMS guidance and healthcare best practice converge on
// 15 minutes of inactivity. Sliding refresh re-issues the cookie on each
// authenticated request (see /api/me, getSessionUser handlers).
export const SESSION_TTL_MS = 15 * 60 * 1000;

const DEV_SECRET = "ed-dev-secret-do-not-use-in-prod";
function getSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be set (>=16 chars) in production");
  }
  return DEV_SECRET;
}

type SessionData = {
  userId: number;
  expiresAt: number;
};

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

function encodeSession(session: SessionData): string {
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decodeSession(token: string): SessionData | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  const sigBuf = Buffer.from(sig, "base64url");
  const expBuf = Buffer.from(expected, "base64url");
  if (sigBuf.length !== expBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const raw = Buffer.from(payload, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as Partial<SessionData>;
    if (typeof parsed.userId !== "number" || typeof parsed.expiresAt !== "number") return null;
    return { userId: parsed.userId, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

export function createSession(userId: number): string {
  return encodeSession({ userId, expiresAt: Date.now() + SESSION_TTL_MS });
}

export function getSession(sessionId: string): SessionData | null {
  const session = decodeSession(sessionId);
  if (!session) return null;
  if (Date.now() > session.expiresAt) return null;
  return { userId: session.userId, expiresAt: Date.now() + SESSION_TTL_MS };
}

// ─── Login Lockout ────────────────────────────────────────────────────────────

export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

export async function getLockoutRemaining(email: string): Promise<number> {
  const data = await db.loginAttempt.findUnique({
    where: { emailKey: email.toLowerCase() },
  });
  if (!data?.lockedUntil) return 0;
  const remaining = data.lockedUntil.getTime() - Date.now();
  if (remaining <= 0) {
    await db.loginAttempt
      .delete({ where: { emailKey: email.toLowerCase() } })
      .catch(() => {});
    return 0;
  }
  return remaining;
}

export async function recordFailedAttempt(email: string): Promise<void> {
  const emailKey = email.toLowerCase();
  const lockedUntil = new Date(Date.now() + LOCKOUT_MS);
  await db.$executeRaw`
    INSERT INTO "LoginAttempt" ("emailKey", "count", "lockedUntil", "updatedAt")
    VALUES (${emailKey}, 1, NULL, NOW())
    ON CONFLICT ("emailKey") DO UPDATE SET
      "count" = "LoginAttempt"."count" + 1,
      "lockedUntil" = CASE
        WHEN "LoginAttempt"."count" + 1 >= ${MAX_ATTEMPTS} THEN ${lockedUntil}
        ELSE "LoginAttempt"."lockedUntil"
      END,
      "updatedAt" = NOW()
  `;
}

export async function clearAttempts(email: string): Promise<void> {
  await db.loginAttempt.deleteMany({ where: { emailKey: email.toLowerCase() } });
}

// ─── Password Validation ──────────────────────────────────────────────────────

export function validatePassword(pw: string): string[] {
  const errors: string[] = [];
  if (pw.length < 8) errors.push("At least 8 characters required");
  if (!/[A-Z]/.test(pw)) errors.push("At least one uppercase letter required");
  if (!/[a-z]/.test(pw)) errors.push("At least one lowercase letter required");
  if (!/[0-9]/.test(pw)) errors.push("At least one number required");
  return errors;
}

// ─── Session User Helper ──────────────────────────────────────────────────────

export async function getSessionUser(request: Request): Promise<User | null> {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k.trim(), decodeURIComponent(v.join("="))];
    })
  );
  const sessionId = cookies[SESSION_COOKIE];
  if (!sessionId) return null;

  const session = getSession(sessionId);
  if (!session) return null;

  const row = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, password: true, role: true, active: true },
  });
  if (!row || !row.active) return null;
  return { id: row.id, name: row.name, email: row.email, password: row.password, role: row.role as User["role"] };
}

// Returns user only if their role is in `allowed`. Use for role guards in routes.
export async function requireRole(
  request: Request,
  allowed: ReadonlyArray<User["role"]>,
): Promise<{ user: User } | { error: Response }> {
  const user = await getSessionUser(request);
  if (!user) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!allowed.includes(user.role)) {
    return { error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}

// ─── Input Limits ─────────────────────────────────────────────────────────────

export const LIMITS = {
  name: 80,
  email: 254,
  notes: 4000,
  reason: 500,
  ticketSubject: 200,
  ticketBody: 8000,
  insuranceKey: 60,
} as const;

export function clip(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.length > max ? v.slice(0, max) : v;
}
