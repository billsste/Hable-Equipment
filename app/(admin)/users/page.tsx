import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import UsersClient, { type SafeUser } from "./UsersClient";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) redirect("/login");
  const session = getSession(sessionId);
  if (!session) redirect("/login");

  const me = await db.user.findUnique({ where: { id: session.userId } });
  if (!me) redirect("/login");

  const rows = await db.user.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] });
  const users: SafeUser[] = rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as SafeUser["role"],
    roles: u.roles,
    active: u.active,
  }));

  return <UsersClient initialUsers={users} me={{ id: me.id, role: me.role }} />;
}
