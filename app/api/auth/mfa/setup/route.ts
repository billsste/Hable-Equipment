import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateSecret, otpauthUrl } from "@/lib/mfa";

// Starts MFA enrollment for the signed-in user. Generates a fresh TOTP secret,
// stores it (unconfirmed — mfaEnabled stays false until /enroll succeeds), and
// returns the otpauth URL + QR data URL so the client can render the setup
// modal. Calling this twice before enrolling rotates the secret — safe by
// design because no codes are valid until /enroll confirms one.
export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const row = await db.user.findUnique({
    where: { id: user.id },
    select: { mfaEnabled: true },
  });
  if (row?.mfaEnabled) {
    return NextResponse.json(
      { error: "MFA is already enabled. Disable it first to re-enroll." },
      { status: 409 },
    );
  }

  const secret = generateSecret();
  await db.user.update({
    where: { id: user.id },
    data: { mfaSecret: secret, mfaBackupCodes: [], mfaEnrolledAt: null },
  });

  const url = otpauthUrl({ secret, account: user.email, issuer: "EquipDispatch" });
  const qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 240 });

  // Returning the raw secret too so the user can manually type it into their
  // authenticator app if they can't scan the QR (offline phone, etc.).
  return NextResponse.json({ otpauthUrl: url, qrDataUrl, secret });
}
