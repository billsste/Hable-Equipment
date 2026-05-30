import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  // mfaEnabled isn't on the session-user shape (it changes mid-session via the
  // account page), so we re-read it here to keep the source of truth in DB.
  const row = await db.user.findUnique({
    where: { id: user.id },
    select: { mfaEnabled: true, mfaBackupCodes: true },
  });
  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mfaEnabled: !!row?.mfaEnabled,
      backupCodesRemaining: row?.mfaBackupCodes?.length ?? 0,
    },
  });
}
