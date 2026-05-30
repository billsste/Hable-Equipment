import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { equipStore } from "@/lib/equip-store";
import { findBackupCodeHash, verifyTotp } from "@/lib/mfa";

// Turning MFA off REQUIRES a fresh proof — either a current TOTP code or an
// unused backup code. A stolen session alone shouldn't be able to disable
// the second factor.
export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    token?: string; backupCode?: string;
  } | null;
  const totpToken = (body?.token ?? "").trim();
  const backupCode = (body?.backupCode ?? "").trim();

  const row = await db.user.findUnique({
    where: { id: user.id },
    select: { mfaEnabled: true, mfaSecret: true, mfaBackupCodes: true },
  });
  if (!row?.mfaEnabled || !row.mfaSecret) {
    return NextResponse.json({ error: "MFA is not enabled." }, { status: 400 });
  }

  let ok = false;
  if (totpToken) ok = verifyTotp(row.mfaSecret, totpToken);
  else if (backupCode) ok = !!findBackupCodeHash(backupCode, row.mfaBackupCodes);
  else return NextResponse.json({ error: "Provide a code to confirm." }, { status: 400 });

  if (!ok) {
    return NextResponse.json({ error: "That code didn't verify." }, { status: 401 });
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      mfaEnabled: false,
      mfaSecret: null,
      mfaBackupCodes: [],
      mfaEnrolledAt: null,
    },
  });

  await equipStore.addAuditEntry({
    ts: new Date().toISOString(),
    who: user.name,
    role: user.role,
    action: "MFA disabled",
    detail: "TOTP authenticator removed",
    ref: `USR-${user.id}`,
  });

  return NextResponse.json({ ok: true });
}
