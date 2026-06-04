import "server-only";
import { db } from "./db";
import type { Prisma } from "@prisma/client";

export * from "./order-types";
import type { OrderShape } from "./order-types";

const SEQ_PADDING = 6;

export function pickInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Parse a money/decimal value to a 2-dp non-negative number, or null.
// Used for deductibleAmount. Prisma's Decimal column accepts a JS number.
export function pickDecimal(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n * 100) / 100);
}

export function pickDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

export function nullableString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

export type OrderEventInput = { who: string; action: string; detail: string };

// "Last, First" so the audit log column sorts alphabetically by surname,
// matching the Patient column on the Tracker. Empty pieces are skipped so a
// service-call order with no patient still emits a clean empty string.
export function formatPatientName(first: string, last: string): string {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  if (l && f) return `${l}, ${f}`;
  return l || f || "";
}

// Builds the createMany op that mirrors per-order events into AuditEntry. Both
// POST and PATCH route handlers feed this into their db.$transaction so the
// system-wide audit log stays in lockstep with OrderEvent rows. The patient
// label is captured at write time so the audit log shows who an entry was
// about even if the order's patient is later renamed.
export function buildAuditMirrorOp(
  events: ReadonlyArray<OrderEventInput>,
  user: { role: string },
  ref: string,
  patient: string,
  ts?: Date,
) {
  return db.auditEntry.createMany({
    data: events.map((e) => ({
      who: e.who,
      role: user.role,
      action: e.action,
      detail: e.detail,
      ref,
      patient,
      ...(ts ? { ts } : {}),
    })),
  });
}

export async function generateOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `ED-${year}-`;
  const startOffset = prefix.length + 1;
  const likePattern = `${prefix}%`;

  // On conflict we self-heal: take GREATEST of (current sequence + 1) and
  // (MAX(existing orderNumber) + 1). This recovers automatically when seed
  // data or external imports insert orders without bumping the sequence.
  const rows = await db.$queryRaw<Array<{ lastSeq: number }>>`
    INSERT INTO "OrderSequence" ("year", "lastSeq")
    VALUES (
      ${year},
      COALESCE(
        (SELECT MAX(CAST(SUBSTRING("orderNumber" FROM ${startOffset}) AS INTEGER))
         FROM "Order"
         WHERE "orderNumber" LIKE ${likePattern}),
        0
      ) + 1
    )
    ON CONFLICT ("year") DO UPDATE SET "lastSeq" = GREATEST(
      "OrderSequence"."lastSeq" + 1,
      COALESCE(
        (SELECT MAX(CAST(SUBSTRING("orderNumber" FROM ${startOffset}) AS INTEGER))
         FROM "Order"
         WHERE "orderNumber" LIKE ${likePattern}),
        0
      ) + 1
    )
    RETURNING "lastSeq"
  `;

  const next = rows[0]?.lastSeq ?? 1;
  return `${prefix}${String(next).padStart(SEQ_PADDING, "0")}`;
}

export const ORDER_INCLUDE = {
  csr: { select: { id: true, name: true } },
  facility: {
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      state: true,
      zip: true,
      phone: true,
      contact: true,
    },
  },
  linkedOrder: { select: { id: true, orderNumber: true } },
  items: {
    include: {
      equipment: {
        select: { id: true, name: true, category: true, abbreviation: true, hcpcsCode: true },
      },
      driver: { select: { id: true, name: true } },
    },
  },
  history: {
    orderBy: { ts: "desc" },
    select: { id: true, ts: true, who: true, action: true, detail: true },
  },
} as const satisfies Prisma.OrderInclude;

export type OrderWithIncludes = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

export function toOrderShape(o: OrderWithIncludes): OrderShape {
  const first = o.patientFirst ?? "";
  const last = o.patientLast ?? "";
  const display = last && first ? `${last}, ${first}` : last || first;
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    stage: o.stage,
    workOrderType: o.workOrderType,
    linkedOrderId: o.linkedOrderId ?? null,
    linkedOrderNumber: o.linkedOrder?.orderNumber ?? null,
    csrId: o.csrId ?? null,
    csrName: o.csr?.name ?? null,
    patientFirst: first,
    patientLast: last,
    patientDisplay: display,
    facilityId: o.facilityId ?? null,
    facilityName: o.facility?.name ?? null,
    facilityAddress: o.facility?.address || null,
    facilityCity: o.facility?.city || null,
    facilityState: o.facility?.state || null,
    facilityZip: o.facility?.zip || null,
    facilityPhone: o.facility?.phone ?? null,
    facilityContact: o.facility?.contact ?? null,
    primaryInsuranceKey: o.primaryInsuranceKey,
    secondaryInsuranceKey: o.secondaryInsuranceKey,
    deductibleStatus: o.deductibleStatus,
    coinsurancePct: o.coinsurancePct ?? null,
    deductibleAmount: o.deductibleAmount != null ? Number(o.deductibleAmount) : null,
    authStatus: o.authStatus,
    authSubmittedAt: o.authSubmittedAt?.toISOString() ?? null,
    dosSubmitted: o.dosSubmitted?.toISOString() ?? null,
    fulfillmentCompanies: o.fulfillmentCompanies ?? [],
    status: o.status,
    handler: o.handler,
    verificationStatus: o.verificationStatus ?? null,
    eldercare: o.eldercare ?? false,
    pendingDocuments: o.pendingDocuments ?? [],
    callReceivedDate: o.callReceivedDate?.toISOString() ?? null,
    dischargeDate: o.dischargeDate?.toISOString() ?? null,
    requestedDeliveryDate: o.requestedDeliveryDate?.toISOString() ?? null,
    printedAt: o.printedAt?.toISOString() ?? null,
    acknowledgedAt: o.acknowledgedAt?.toISOString() ?? null,
    outForDeliveryAt: o.outForDeliveryAt?.toISOString() ?? null,
    doorTaggedAt: o.doorTaggedAt?.toISOString() ?? null,
    cancelledAt: o.cancelledAt?.toISOString() ?? null,
    cancellationReason: o.cancellationReason,
    notes: o.notes,
    items: (o.items ?? []).map((it) => ({
      id: it.id,
      equipmentId: it.equipmentId,
      quantity: it.quantity,
      name: it.equipment.name,
      category: it.equipment.category,
      abbreviation: it.equipment.abbreviation,
      hcpcsCode: it.equipment.hcpcsCode,
      driverId: it.driverId ?? null,
      driverName: it.driver?.name ?? null,
      completedAt: it.completedAt?.toISOString() ?? null,
      doorTagCount: it.doorTagCount ?? 0,
    })),
    history: buildHistory(o),
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

// Pre-OrderEvent orders only have stage timestamps; synthesize entries for
// those transitions so legacy rows still show up in History.
function buildHistory(o: OrderWithIncludes): OrderShape["history"] {
  const real = (o.history ?? []).map((h) => ({
    id: h.id,
    ts: h.ts.toISOString(),
    who: h.who,
    action: h.action,
    detail: h.detail,
  }));
  const seen = new Set(real.map((h) => h.action));
  const synth: OrderShape["history"] = [];
  const add = (id: string, ts: Date | null, action: string, detail = "") => {
    if (!ts || seen.has(action)) return;
    synth.push({ id: `synth-${id}`, ts: ts.toISOString(), who: "system", action, detail });
  };
  add(`created-${o.id}`, o.createdAt, "Order created");
  add(`printed-${o.id}`, o.printedAt, "Ticket printed");
  add(`ack-${o.id}`, o.acknowledgedAt, "Dispatcher acknowledged");
  add(`out-${o.id}`, o.outForDeliveryAt, "Out for delivery");
  // Per-item completion: synth a "Delivered" entry on the latest item
  // completedAt when every item is done (drops the order-level deliveredAt).
  const itemCompletions = (o.items ?? [])
    .map((it) => it.completedAt)
    .filter((d): d is Date => !!d);
  const allDone = (o.items ?? []).length > 0 && itemCompletions.length === (o.items ?? []).length;
  if (allDone) {
    const latest = itemCompletions.reduce((a, b) => (a > b ? a : b));
    add(`delivered-${o.id}`, latest, "Delivered");
  }
  add(`cancelled-${o.id}`, o.cancelledAt, "Cancelled", o.cancellationReason ?? "");
  return [...real, ...synth].sort(
    (a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime(),
  );
}
