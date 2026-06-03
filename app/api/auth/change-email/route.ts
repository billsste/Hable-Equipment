import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

// User-initiated email change. Requires a valid session AND the user's current
// password — same re-auth contract as /api/auth/change-password — so a stolen
// session can't quietly swap the login credential. Email is normalized to
// lowercase to match the login query (which lowercases on lookup).
export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    currentPassword?: string;
    newEmail?: string;
  } | null;
  const currentPassword = (body?.currentPassword ?? "").trim();
  const newEmail = (body?.newEmail ?? "").trim().toLowerCase();

  if (!currentPassword || !newEmail) {
    return NextResponse.json({ error: "Provide your current password and a new email." }, { status: 400 });
  }
  // Minimum email shape check — we don't need full RFC compliance, just
  // enough to catch obvious typos (no @, no domain). The login flow will
  // bounce anything that doesn't match a row anyway.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return NextResponse.json({ error: "That doesn't look like a valid email address." }, { status: 400 });
  }

  const row = await db.user.findUnique({
    where: { id: user.id },
    select: { id: true, password: true, email: true },
  });
  if (!row) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }
  if (row.password !== currentPassword) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });
  }
  if (newEmail === row.email.toLowerCase()) {
    return NextResponse.json({ error: "New email is the same as the current one." }, { status: 400 });
  }

  // Block collisions with other users — Prisma will throw a P2002 on the
  // unique index, but a clear error message reads better than a 500.
  const clash = await db.user.findUnique({ where: { email: newEmail }, select: { id: true } });
  if (clash && clash.id !== user.id) {
    return NextResponse.json({ error: "Another account already uses that email." }, { status: 409 });
  }

  const oldEmail = row.email;
  await db.user.update({ where: { id: user.id }, data: { email: newEmail } });

  await logAudit(request, user, {
    action: "Email changed",
    detail: `${oldEmail} → ${newEmail}`,
  });

  return NextResponse.json({ ok: true, email: newEmail });
}
