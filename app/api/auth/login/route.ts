import { NextResponse } from "next/server";
import {
  createSession,
  getLockoutRemaining,
  recordFailedAttempt,
  clearAttempts,
  setSessionCookie,
  setChallengeCookie,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { equipStore } from "@/lib/equip-store";
import {
  MFA_CHALLENGE_COOKIE,
  MFA_CHALLENGE_MAX_AGE,
  createChallengeToken,
} from "@/lib/mfa";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const lockoutRemainingMs = await getLockoutRemaining(email);
    if (lockoutRemainingMs > 0) {
      const minutes = Math.ceil(lockoutRemainingMs / 60000);
      return NextResponse.json(
        { error: `Account locked. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` },
        { status: 429 }
      );
    }

    const userRow = await db.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, name: true, email: true, password: true, role: true, active: true, mfaEnabled: true },
    });

    if (!userRow || userRow.password !== password) {
      await recordFailedAttempt(email);
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }
    if (!userRow.active) {
      return NextResponse.json({ error: "This account has been deactivated." }, { status: 403 });
    }
    const user = userRow;

    // ─── MFA step ────────────────────────────────────────────────────────────
    // Password is correct; if the user has MFA enabled, do NOT issue the
    // session cookie and do NOT clear the lockout counter — the login is not
    // complete until /api/auth/mfa/verify succeeds. Wiping the counter here
    // would let an attacker reset it before brute-forcing TOTP. Instead, issue
    // a short-lived signed challenge cookie that only /mfa/verify accepts.
    if (user.mfaEnabled) {
      const challenge = createChallengeToken(user.id);
      const response = NextResponse.json({ mfaRequired: true });
      setChallengeCookie(response, MFA_CHALLENGE_COOKIE, challenge, MFA_CHALLENGE_MAX_AGE);
      return response;
    }

    await clearAttempts(email);
    const sessionId = createSession(user.id);

    // Add audit entry
    await equipStore.addAuditEntry({
      ts: new Date().toISOString(),
      who: user.name,
      role: user.role,
      action: "Login",
      detail: `User logged in from ${request.headers.get("x-forwarded-for") ?? "unknown"}`,
      ref: `USR-${user.id}`,
    });

    const response = NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });

    setSessionCookie(response, sessionId);

    return response;
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
