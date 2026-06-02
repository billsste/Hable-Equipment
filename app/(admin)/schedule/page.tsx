import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import ScheduleClient, { type ScheduledItem } from "./ScheduleClient";

export const dynamic = "force-dynamic";

function todayIso(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function parseDate(raw: unknown): string {
  if (typeof raw !== "string") return todayIso();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : todayIso();
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) redirect("/login");
  const session = getSession(sessionId);
  if (!session) redirect("/login");

  const me = await db.user.findUnique({ where: { id: session.userId } });
  if (!me) redirect("/login");
  if (me.role !== "supplier" && me.role !== "driver" && me.role !== "dispatcher") redirect("/tracker");

  const sp = await searchParams;
  const date = parseDate(sp.date);
  // Date math: pull every order item whose completedAt OR whose parent
  // order's requestedDeliveryDate lands on the selected UTC day. We treat
  // the date input as midnight UTC; the [start, end) window covers exactly
  // that calendar day.
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const itemRows = await db.orderItem.findMany({
    where: {
      OR: [
        { completedAt: { gte: dayStart, lt: dayEnd } },
        {
          AND: [
            { completedAt: null },
            { order: { requestedDeliveryDate: { gte: dayStart, lt: dayEnd } } },
          ],
        },
      ],
    },
    include: {
      equipment: { select: { name: true, category: true, abbreviation: true } },
      driver: { select: { id: true, name: true } },
      order: {
        select: {
          id: true,
          orderNumber: true,
          patientFirst: true,
          patientLast: true,
          stage: true,
          dischargeDate: true,
          requestedDeliveryDate: true,
          facility: { select: { name: true } },
        },
      },
    },
    orderBy: [{ driverId: "asc" }, { id: "asc" }],
  });

  const items: ScheduledItem[] = itemRows.map((r) => ({
    id: r.id,
    orderId: r.order.id,
    orderNumber: r.order.orderNumber,
    patientName: [r.order.patientLast, r.order.patientFirst].filter(Boolean).join(", "),
    facilityName: r.order.facility?.name ?? null,
    equipmentName: r.equipment.name,
    equipmentAbbr: r.equipment.abbreviation,
    quantity: r.quantity,
    driverId: r.driverId ?? null,
    driverName: r.driver?.name ?? null,
    completedAt: r.completedAt?.toISOString() ?? null,
    requestedDeliveryDate: r.order.requestedDeliveryDate?.toISOString() ?? null,
    stage: r.order.stage,
    dischargeDate: r.order.dischargeDate?.toISOString() ?? null,
  }));

  return <ScheduleClient items={items} date={date} />;
}
