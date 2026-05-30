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
  if (me.role !== "supplier" && me.role !== "dispatcher") redirect("/tracker");

  const equipmentRows = await db.equipment.findMany({
    where: { active: true, kind: "item" },
    include: {
      serials: {
        select: { id: true, sn: true, status: true, location: true, notes: true, orderId: true, deployedAt: true, updatedAt: true },
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

  const serialRows = await db.serialItem.findMany({
    include: { equipment: { select: { id: true, name: true, category: true, abbreviation: true } } },
    orderBy: [{ updatedAt: "desc" }],
  });
  const serials: SerialRow[] = serialRows.map((s) => ({
    id: s.id,
    sn: s.sn,
    equipmentId: s.equipmentId,
    equipmentName: s.equipment.name,
    equipmentCategory: s.equipment.category,
    equipmentAbbreviation: s.equipment.abbreviation,
    status: s.status,
    location: s.location,
    notes: s.notes,
    orderId: s.orderId,
    deployedAt: s.deployedAt?.toISOString() ?? null,
    retiredAt: s.retiredAt?.toISOString() ?? null,
    updatedAt: s.updatedAt.toISOString(),
  }));

  return (
    <InventoryClient
      currentUser={{ id: me.id, role: me.role }}
      equipment={equipment}
      initialSerials={serials}
    />
  );
}
