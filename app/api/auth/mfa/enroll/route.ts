import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { generateBackupCodes, hashBackupCode, verifyTotp } from "@/lib/mfa";

// Confirms enrollment by verifying the first TOTP code the user types from
// their authenticator app. On success: flip mfaEnabled=true, generate one-time
// backup codes (hashed at rest), and return the cleartext backup codes ONCE so
// the user can print/save them. They cannot be recovered later.
export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { token?: string } | null;
  const token = (body?.token ?? "").trim();
  if (!/^\d{6}$/.test(token)) {
    return NextResponse.json({ error: "Enter the 6-digit code from your authenticator app." }, { status: 400 });
  }

  const row = await db.user.findUnique({
    where: { id: user.id },
    select: { mfaSecret: true, mfaEnabled: true },
  });
  if (!row?.mfaSecret) {
    return NextResponse.json({ error: "Start enrollment first." }, { status: 400 });
  }
  if (row.mfaEnabled) {
    return NextResponse.json({ error: "MFA is already enabled." }, { status: 409 });
  }
  if (!verifyTotp(row.mfaSecret, token)) {
    return NextResponse.json({ error: "That code didn't verify. Try again." }, { status: 401 });
  }

  const codes = generateBackupCodes(10);
  const hashes = codes.map(hashBackupCode);

  await db.user.update({
    where: { id: user.id },
    data: {
      mfaEnabled: true,
      mfaBackupCodes: hashes,
      mfaEnrolledAt: new Date(),
    },
  });

  await logAudit(request, user, { action: "MFA enabled", detail: "TOTP authenticator enrolled" });

  // Cleartext codes are only returned on this single response.
  return NextResponse.json({ backupCodes: codes });
}
