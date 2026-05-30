import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import AccountClient from "./AccountClient";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) redirect("/login");
  const session = getSession(sessionId);
  if (!session) redirect("/login");

  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true, name: true, email: true, role: true,
      mfaEnabled: true, mfaEnrolledAt: true, mfaBackupCodes: true,
    },
  });
  if (!me) redirect("/login");

  return (
    <AccountClient
      me={{
        id: me.id,
        name: me.name,
        email: me.email,
        role: me.role,
        mfaEnabled: me.mfaEnabled,
        mfaEnrolledAt: me.mfaEnrolledAt ? me.mfaEnrolledAt.toISOString() : null,
        backupCodesRemaining: me.mfaBackupCodes.length,
      }}
    />
  );
}
