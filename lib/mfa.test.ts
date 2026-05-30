import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  findBackupCodeHash,
  generateBackupCodes,
  generateSecret,
  generateTotp,
  hashBackupCode,
  otpauthUrl,
  verifyTotp,
} from "./mfa";

describe("base32", () => {
  it("round-trips an arbitrary buffer", () => {
    const original = Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02, 0x03, 0x04]);
    const encoded = base32Encode(original);
    expect(base32Decode(encoded).equals(original)).toBe(true);
  });

  it("matches the RFC 4648 test vector for 'foobar'", () => {
    // RFC 4648 §10: "foobar" -> "MZXW6YTBOI" (no padding).
    expect(base32Encode(Buffer.from("foobar", "ascii"))).toBe("MZXW6YTBOI");
  });
});

describe("TOTP generation", () => {
  it("generates a 6-digit code", () => {
    const secret = generateSecret();
    const code = generateTotp(secret);
    expect(/^\d{6}$/.test(code)).toBe(true);
  });

  it("verifies the code it just generated (current window)", () => {
    const secret = generateSecret();
    const now = Date.UTC(2026, 0, 1, 12, 0, 0);
    const token = generateTotp(secret, now);
    expect(verifyTotp(secret, token, { now })).toBe(true);
  });

  it("accepts a token from the previous 30s window (±1 step skew)", () => {
    const secret = generateSecret();
    const past = Date.UTC(2026, 0, 1, 12, 0, 0);
    const future = past + 30_000; // one step later
    const tokenAtPast = generateTotp(secret, past);
    expect(verifyTotp(secret, tokenAtPast, { now: future })).toBe(true);
  });

  it("rejects a token that's two steps stale (>±1 window)", () => {
    const secret = generateSecret();
    const past = Date.UTC(2026, 0, 1, 12, 0, 0);
    const tooLate = past + 90_000; // three steps later
    const tokenAtPast = generateTotp(secret, past);
    expect(verifyTotp(secret, tokenAtPast, { now: tooLate })).toBe(false);
  });

  it("rejects non-6-digit input", () => {
    const secret = generateSecret();
    expect(verifyTotp(secret, "abcdef")).toBe(false);
    expect(verifyTotp(secret, "12345")).toBe(false);
    expect(verifyTotp(secret, "1234567")).toBe(false);
    expect(verifyTotp(secret, "")).toBe(false);
  });
});

describe("otpauth URL", () => {
  it("encodes issuer + label + secret correctly", () => {
    const url = otpauthUrl({
      secret: "JBSWY3DPEHPK3PXP",
      account: "stee@equipdispatch.com",
      issuer: "EquipDispatch",
    });
    expect(url).toContain("otpauth://totp/EquipDispatch:");
    expect(url).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(url).toContain("issuer=EquipDispatch");
    expect(url).toContain("algorithm=SHA1");
    expect(url).toContain("digits=6");
    expect(url).toContain("period=30");
  });
});

describe("backup codes", () => {
  it("generates the requested count and unique values in XXXX-XXXX format", () => {
    const codes = generateBackupCodes(10);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(/^[0-9A-F]{4}-[0-9A-F]{4}$/.test(c)).toBe(true);
  });

  it("hashes and matches a backup code case-insensitively, dash-optional", () => {
    const codes = generateBackupCodes(3);
    const hashes = codes.map(hashBackupCode);
    expect(findBackupCodeHash(codes[0].toLowerCase().replace("-", ""), hashes)).toBe(hashes[0]);
    expect(findBackupCodeHash("nope-nope", hashes)).toBeNull();
  });
});
