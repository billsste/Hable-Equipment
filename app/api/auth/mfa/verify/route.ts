import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSession,
  recordFailedAttempt,
  clearAttempts,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { equipStore } from "@/lib/equip-store";
import {
  MFA_CHALLENGE_COOKIE,
  findBackupCodeHash,
  readChallengeToken,
  verifyTotp,
} from "@/lib/mfa";

// Step 2 of login. Reads the short-lived MFA challenge cookie set by the
// password step, verifies a TOTP code or a backup code, and on success swaps
// the challenge cookie for a real session cookie. Failed attempts also count
// against the standard lockout (so MFA brute-force triggers the same cooldown
// as password brute-force).
export async function POST(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k.trim(), decodeURIComponent(v.join("="))];
    }),
  );
  const challengeToken = cookies[MFA_CHALLENGE_COOKIE];
  if (!challengeToken) {
    return NextResponse.json({ error: "MFA challenge expired. Sign in again." }, { status: 401 });
  }
  const challenge = readChallengeToken(challengeToken);
  if (!challenge) {
    return NextResponse.json({ error: "MFA challenge expired. Sign in again." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    token?: string; backupCode?: string;
  } | null;
  const totpToken = (body?.token ?? "").trim();
  const backupCode = (body?.backupCode ?? "").trim();

  const row = await db.user.findUnique({
    where: { id: challenge.userId },
    select: {
      id: true, name: true, email: true, role: true, active: true,
      mfaEnabled: true, mfaSecret: true, mfaBackupCodes: true,
    },
  });
  if (!row || !row.active || !row.mfaEnabled || !row.mfaSecret) {
    return NextResponse.json({ error: "MFA not configured." }, { status: 400 });
  }

  let usedBackup = false;
  let ok = false;

  if (totpToken) {
    ok = verifyTotp(row.mfaSecret, totpToken);
  } else if (backupCode) {
    const matched = findBackupCodeHash(backupCode, row.mfaBackupCodes);
    if (matched) {
      usedBackup = true;
      // Atomically consume the used backup code so it can't be replayed.
      await db.user.update({
        where: { id: row.id },
        data: { mfaBackupCodes: row.mfaBackupCodes.filter((h) => h !== matched) },
      });
      ok = true;
    }
  } else {
    return NextResponse.json({ error: "Provide a code." }, { status: 400 });
  }

  if (!ok) {
    await recordFailedAttempt(row.email);
    return NextResponse.json({ error: "That code didn't verify." }, { status: 401 });
  }

  await clearAttempts(row.email);
  const sessionId = createSession(row.id);

  await equipStore.addAuditEntry({
    ts: new Date().toISOString(),
    who: row.name,
    role: row.role,
    action: usedBackup ? "Login (MFA backup code)" : "Login (MFA)",
    detail: `User completed ${usedBackup ? "MFA backup-code" : "MFA"} from ${request.headers.get("x-forwarded-for") ?? "unknown"}`,
    ref: `USR-${row.id}`,
  });

  const response = NextResponse.json({
    user: { id: row.id, name: row.name, email: row.email, role: row.role },
  });
  // Swap: clear the short-lived challenge, set the real session.
  response.cookies.set(MFA_CHALLENGE_COOKIE, "", {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "strict", maxAge: 0, path: "/",
  });
  response.cookies.set(SESSION_COOKIE, sessionId, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "strict", maxAge: SESSION_TTL_MS / 1000, path: "/",
  });
  return response;
}
