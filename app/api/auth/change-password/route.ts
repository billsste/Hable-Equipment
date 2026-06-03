import { NextResponse } from "next/server";
import { getSessionUser, validatePassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

// User-initiated password change. Requires a valid session + the user's
// current password (so a stolen session alone can't rotate the credential).
// Clears mustChangePassword on success — the admin layout will stop
// redirecting here once that flag is false.
export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    currentPassword?: string; newPassword?: string;
  } | null;
  const currentPassword = (body?.currentPassword ?? "").trim();
  const newPassword = (body?.newPassword ?? "").trim();
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "Provide both current and new password." }, { status: 400 });
  }

  const row = await db.user.findUnique({
    where: { id: user.id },
    select: { id: true, password: true, mustChangePassword: true },
  });
  if (!row) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }
  if (row.password !== currentPassword) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });
  }
  if (newPassword === currentPassword) {
    return NextResponse.json({ error: "New password must be different from the current one." }, { status: 400 });
  }

  const errors = validatePassword(newPassword);
  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join(" ") }, { status: 400 });
  }

  await db.user.update({
    where: { id: user.id },
    data: { password: newPassword, mustChangePassword: false },
  });

  await logAudit(request, user, {
    action: "Password changed",
    detail: row.mustChangePassword
      ? "Forced first-login password change completed"
      : "User-initiated password change",
  });

  return NextResponse.json({ ok: true });
}
