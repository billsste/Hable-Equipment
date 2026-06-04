import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SESSION_COOKIE, getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ORDER_INCLUDE, toOrderShape } from "@/lib/order-helpers";
import ReportingClient from "./ReportingClient";

export const dynamic = "force-dynamic";

export default async function ReportingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) redirect("/login");
  const session = getSession(sessionId);
  if (!session) redirect("/login");

  const me = await db.user.findUnique({ where: { id: session.userId } });
  if (!me) redirect("/login");
  // Role gate dropped per Brent 2026-06 — every authenticated user can
  // view Reporting.

  const [orders, insurance, companies, equipment, sp] = await Promise.all([
    db.order.findMany({
      include: ORDER_INCLUDE,
      orderBy: [{ createdAt: "desc" }],
    }),
    db.insuranceOption.findMany({
      where: { active: true },
      select: { key: true, label: true },
      orderBy: { label: "asc" },
    }),
    db.fulfillmentCompany.findMany({
      where: { active: true },
      select: { key: true, label: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.equipment.findMany({
      where: { active: true },
      select: { id: true, name: true, abbreviation: true, category: true },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    searchParams,
  ]);

  return (
    <ReportingClient
      orders={orders.map(toOrderShape)}
      insurance={insurance}
      companies={companies}
      equipment={equipment}
      initialSearch={sp}
    />
  );
}
