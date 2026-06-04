import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import InventoryClient, { type EquipmentRow, type SerialRow } from "./InventoryClient";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) redirect("/login");
  const session = getSession(sessionId);
  if (!session) redirect("/login");

  const me = await db.user.findUnique({ where: { id: session.userId } });
  if (!me) redirect("/login");
  // Role gate dropped per Brent 2026-06 — every authenticated user can
  // view Inventory.

  // One query, two views: pull active item-kind equipment with their serials
  // included, then derive both the stock-by-equipment summary and the flat
  // serials list from the same result. The earlier two-query version
  // double-scanned the serials table; we now do the join once.
  const equipmentRows = await db.equipment.findMany({
    where: { active: true, kind: "item" },
    include: {
      serials: {
        select: {
          id: true, sn: true, status: true, location: true, notes: true,
          orderId: true, deployedAt: true, retiredAt: true, updatedAt: true,
        },
        orderBy: { sn: "asc" },
      },
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  const equipment: EquipmentRow[] = equipmentRows.map((e) => {
    const available = e.serials.filter((s) => s.status === "available").length;
    const deployed = e.serials.filter((s) => s.status === "deployed").length;
    const out = e.serials.filter((s) => s.status === "out_of_service" || s.status === "in_service").length;
    const retired = e.serials.filter((s) => s.status === "retired").length;
    return {
      id: e.id,
      name: e.name,
      category: e.category,
      abbreviation: e.abbreviation,
      parLevel: e.parLevel,
      total: e.serials.length,
      available, deployed, out, retired,
      belowPar: e.parLevel != null && available < e.parLevel,
    };
  });

  // Flatten + most-recently-touched first, matching the previous explicit
  // serialItem.findMany({ orderBy: { updatedAt: 'desc' } }).
  const serials: SerialRow[] = equipmentRows
    .flatMap((e) => e.serials.map((s) => ({
      id: s.id,
      sn: s.sn,
      equipmentId: e.id,
      equipmentName: e.name,
      equipmentCategory: e.category,
      equipmentAbbreviation: e.abbreviation,
      status: s.status,
      location: s.location,
      notes: s.notes,
      orderId: s.orderId,
      deployedAt: s.deployedAt?.toISOString() ?? null,
      retiredAt: s.retiredAt?.toISOString() ?? null,
      updatedAt: s.updatedAt.toISOString(),
    })))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));

  return (
    <InventoryClient
      currentUser={{ id: me.id, role: me.role }}
      equipment={equipment}
      initialSerials={serials}
    />
  );
}
