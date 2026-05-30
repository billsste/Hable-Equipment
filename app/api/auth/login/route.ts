import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSession,
  getLockoutRemaining,
  recordFailedAttempt,
  clearAttempts,
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
    // session cookie. Issue a short-lived signed challenge cookie that only
    // /api/auth/mfa/verify accepts, then let the client prompt for the code.
    if (user.mfaEnabled) {
      await clearAttempts(email);
      const challenge = createChallengeToken(user.id);
      const response = NextResponse.json({ mfaRequired: true });
      response.cookies.set(MFA_CHALLENGE_COOKIE, challenge, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: MFA_CHALLENGE_MAX_AGE,
        path: "/",
      });
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

    response.cookies.set(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: SESSION_TTL_MS / 1000,
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
