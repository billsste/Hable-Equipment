import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import ChangePasswordClient from "./ChangePasswordClient";

export const dynamic = "force-dynamic";

// Forced-on-first-login password change. Lives outside (admin) so the admin
// layout's mustChangePassword redirect doesn't bounce back here in a loop.
// Reachable directly too — a user who just wants to rotate their password
// can navigate here from /account.
export default async function ChangePasswordPage() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) redirect("/login");
  const session = getSession(sessionId);
  if (!session) redirect("/login");

  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, mustChangePassword: true },
  });
  if (!me) redirect("/login");

  return (
    <ChangePasswordClient
      me={{ id: me.id, name: me.name, email: me.email, mustChangePassword: me.mustChangePassword }}
    />
  );
}
