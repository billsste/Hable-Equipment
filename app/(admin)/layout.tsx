import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { UserRole } from "@/lib/equip-store";
import AdminSidebar from "@/components/admin-sidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionId) redirect("/login");

  const session = getSession(sessionId);
  if (!session) redirect("/login");

  // Pull mustChangePassword alongside the basic identity so we can gate every
  // (admin) route through the forced-password-change flow in one place.
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, role: true, active: true, mustChangePassword: true },
  });
  if (!user || !user.active) redirect("/login");

  // Forced first-login password change. /change-password lives outside this
  // layout so this redirect doesn't loop.
  if (user.mustChangePassword) redirect("/change-password");

  const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role as UserRole };

  return (
    <div
      className="flex flex-col md:flex-row h-screen overflow-hidden"
      style={{
        fontFamily: "Inter, sohne-var, -apple-system, system-ui, sans-serif",
        fontFeatureSettings: '"ss01"',
        background: "#f6f9fc",
        color: "#061b31",
      }}
    >
      <AdminSidebar user={safeUser} />
      <main className="flex-1 overflow-y-auto" style={{ background: "#f6f9fc" }}>
        {children}
      </main>
    </div>
  );
}
