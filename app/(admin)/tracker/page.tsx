import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SESSION_COOKIE, getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ORDER_INCLUDE, toOrderShape } from "@/lib/order-helpers";
import TrackerClient from "./TrackerClient";

export const dynamic = "force-dynamic";

type SearchParamsPromise = Promise<Record<string, string | string[] | undefined>>;

export default async function TrackerPage({
  searchParams,
}: {
  searchParams: SearchParamsPromise;
}) {
  const sp = await searchParams;
  const rawNew = Array.isArray(sp.new) ? sp.new[0] : sp.new;
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) redirect("/login");
  const session = getSession(sessionId);
  if (!session) redirect("/login");

  const me = await db.user.findUnique({ where: { id: session.userId } });
  if (!me) redirect("/login");

  const [orders, lookups] = await Promise.all([
    db.order.findMany({
      include: ORDER_INCLUDE,
      orderBy: [{ dischargeDate: "asc" }, { createdAt: "desc" }],
    }),
    Promise.all([
      db.user.findMany({
        where: { roles: { has: "csr" }, active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      // Driver list. "dispatcher" stays in some legacy roles[] arrays.
      db.user.findMany({
        where: {
          active: true,
          OR: [{ role: "driver" }, { roles: { has: "driver" } }, { roles: { has: "dispatcher" } }],
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      db.facility.findMany({
        where: { active: true },
        select: {
          id: true,
          name: true,
          initials: true,
          address: true,
          city: true,
          state: true,
          zip: true,
          phone: true,
          contact: true,
        },
        orderBy: { name: "asc" },
      }),
      db.insuranceOption.findMany({ where: { active: true }, orderBy: { label: "asc" } }),
      db.fulfillmentCompany.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
      db.cancellationReason.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
      db.equipment.findMany({
        where: { active: true },
        orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      }),
    ]),
  ]);

  const [
    csrs,
    dispatchers,
    facilities,
    insurance,
    companies,
    cancellationReasons,
    equipment,
  ] = lookups;

  return (
    <TrackerClient
      currentUser={{ id: me.id, name: me.name, roles: me.roles }}
      initialOrders={orders.map(toOrderShape)}
      initialNew={rawNew === "1"}
      lookups={{
        csrs,
        dispatchers,
        facilities,
        insurance,
        companies,
        cancellationReasons,
        equipment,
      }}
    />
  );
}
