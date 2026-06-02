import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { LIMITS, clip, getSessionUser } from "@/lib/auth";
import {
  ORDER_INCLUDE,
  asStringArray,
  buildAuditMirrorOp,
  deriveStage,
  normalizeName,
  nullableString,
  pickDate,
  pickDecimal,
  pickInt,
  toOrderShape,
  type OrderEventInput,
  type OrderWithIncludes,
} from "@/lib/order-helpers";
import {
  ORDER_ACTIONS,
  ORDER_FIELD_LABELS,
  WORK_ORDER_TYPE_LABELS,
  isValidAuthTransition,
  requiresReason,
  STATUS_LABELS,
} from "@/lib/order-types";

const VALID_WORK_ORDER_TYPES = Object.keys(WORK_ORDER_TYPE_LABELS) as WorkOrderType[];
import type { AuthStatus, BillingStatus, DataEntryStatus, DeductibleStatus, HandlerType, OutcomeStatus, PlanType, Prisma, WorkOrderType } from "@prisma/client";

const VALID_OUTCOME_STATUSES: ReadonlyArray<OutcomeStatus> = [
  "ACTIVE", "ON_HOLD", "LOOSE_ENDS", "TRANSFERRED", "REJECTED", "CANCELLED", "DELIVERED", "WRITE_OFF",
];

const ALLOWED_PATCH_ROLES: ReadonlyArray<string> = ["supplier", "csr", "driver", "dispatcher"];

type Event = OrderEventInput;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const order = await db.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ order: toOrderShape(order) });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ALLOWED_PATCH_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const existing = await db.order.findUnique({
    where: { id },
    include: ORDER_INCLUDE,
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Prisma.OrderUpdateInput = {};
  const events: Event[] = [];
  const now = new Date();
  const who = user.name;

  // Track post-update values alongside the Prisma payload so deriveStage gets
  // plain values instead of having to reverse-engineer the OrderUpdateInput.
  let nextStatus: OutcomeStatus = existing.status;
  let nextWhatsNeeded: string[] = existing.whatsNeeded;
  let nextPrimary: string | null = existing.primaryInsuranceKey;
  let nextAuth: AuthStatus = existing.authStatus;
  let nextDispatcherId: number | null = existing.dispatcherId;
  let nextPrintedAt: Date | null = existing.printedAt;
  let nextAckAt: Date | null = existing.acknowledgedAt;
  let nextOutAt: Date | null = existing.outForDeliveryAt;
  let nextDoorTaggedAt: Date | null = existing.doorTaggedAt;
  let nextDeliveredAt: Date | null = existing.deliveredAt;
  let nextCancelledAt: Date | null = existing.cancelledAt;
  let nextWorkOrderType: WorkOrderType = existing.workOrderType;

  if ("patientFirst" in body) {
    const newVal = normalizeName(clip(body.patientFirst, LIMITS.name));
    if (newVal !== existing.patientFirst) {
      data.patientFirst = newVal;
      pushDiff(events, who, ORDER_FIELD_LABELS.patientFirst, existing.patientFirst, newVal);
    }
  }
  if ("patientLast" in body) {
    const newVal = normalizeName(clip(body.patientLast, LIMITS.name));
    if (newVal !== existing.patientLast) {
      data.patientLast = newVal;
      pushDiff(events, who, ORDER_FIELD_LABELS.patientLast, existing.patientLast, newVal);
    }
  }

  // Resolve user/facility names in one parallel batch so each independent ID
  // change doesn't add its own DB round-trip.
  const newCsrId = "csrId" in body ? pickInt(body.csrId) : undefined;
  const newFacilityId = "facilityId" in body ? pickInt(body.facilityId) : undefined;
  const newDispatcherId = "dispatcherId" in body ? pickInt(body.dispatcherId) : undefined;
  const userIdsToResolve = new Set<number>();
  if (newCsrId && newCsrId !== existing.csrId) userIdsToResolve.add(newCsrId);
  if (newDispatcherId && newDispatcherId !== existing.dispatcherId) userIdsToResolve.add(newDispatcherId);
  const facilityIdToResolve =
    newFacilityId && newFacilityId !== existing.facilityId ? newFacilityId : null;
  const [resolvedUsers, resolvedFacility] = await Promise.all([
    userIdsToResolve.size
      ? db.user.findMany({
          where: { id: { in: [...userIdsToResolve] } },
          select: { id: true, name: true },
        })
      : Promise.resolve([] as Array<{ id: number; name: string }>),
    facilityIdToResolve
      ? db.facility.findUnique({ where: { id: facilityIdToResolve }, select: { name: true } })
      : Promise.resolve(null),
  ]);
  const userNameById = new Map(resolvedUsers.map((u) => [u.id, u.name]));

  if (newCsrId !== undefined && newCsrId !== existing.csrId) {
    data.csr = newCsrId ? { connect: { id: newCsrId } } : { disconnect: true };
    const newName = newCsrId ? userNameById.get(newCsrId) ?? `User #${newCsrId}` : null;
    pushDiff(events, who, ORDER_FIELD_LABELS.csr, existing.csr?.name ?? null, newName);
  }
  if (newFacilityId !== undefined && newFacilityId !== existing.facilityId) {
    data.facility = newFacilityId ? { connect: { id: newFacilityId } } : { disconnect: true };
    const newName = newFacilityId
      ? resolvedFacility?.name ?? `Facility #${newFacilityId}`
      : null;
    pushDiff(events, who, ORDER_FIELD_LABELS.facility, existing.facility?.name ?? null, newName);
  }
  if (newDispatcherId !== undefined && newDispatcherId !== existing.dispatcherId) {
    data.dispatcher = newDispatcherId ? { connect: { id: newDispatcherId } } : { disconnect: true };
    nextDispatcherId = newDispatcherId;
    const newName = newDispatcherId
      ? userNameById.get(newDispatcherId) ?? `User #${newDispatcherId}`
      : null;
    pushDiff(events, who, ORDER_FIELD_LABELS.dispatcher, existing.dispatcher?.name ?? null, newName);
  }

  if ("whatsNeeded" in body) {
    const newVal = asStringArray(body.whatsNeeded);
    if (!eqArr(newVal, existing.whatsNeeded)) {
      data.whatsNeeded = newVal;
      nextWhatsNeeded = newVal;
      pushDiff(events, who, ORDER_FIELD_LABELS.whatsNeeded, existing.whatsNeeded, newVal);
    }
  }
  if ("fulfillmentCompanies" in body) {
    const newVal = asStringArray(body.fulfillmentCompanies);
    if (!eqArr(newVal, existing.fulfillmentCompanies)) {
      data.fulfillmentCompanies = newVal;
      pushDiff(events, who, ORDER_FIELD_LABELS.fulfillmentCompanies, existing.fulfillmentCompanies, newVal);
    }
  }
  if ("primaryInsuranceKey" in body) {
    const newVal = nullableString(body.primaryInsuranceKey);
    if (newVal !== existing.primaryInsuranceKey) {
      data.primaryInsuranceKey = newVal;
      nextPrimary = newVal;
      pushDiff(events, who, ORDER_FIELD_LABELS.primaryInsurance, existing.primaryInsuranceKey, newVal);
    }
  }
  if ("secondaryInsuranceKey" in body) {
    const newVal = nullableString(body.secondaryInsuranceKey);
    if (newVal !== existing.secondaryInsuranceKey) {
      data.secondaryInsuranceKey = newVal;
      pushDiff(events, who, ORDER_FIELD_LABELS.secondaryInsurance, existing.secondaryInsuranceKey, newVal);
    }
  }
  if ("deductibleStatus" in body) {
    const newVal = (body.deductibleStatus as DeductibleStatus | null) ?? null;
    if (newVal !== existing.deductibleStatus) {
      data.deductibleStatus = newVal;
      pushDiff(events, who, ORDER_FIELD_LABELS.deductibleStatus, existing.deductibleStatus, newVal);
    }
  }
  if ("coinsurancePct" in body) {
    const raw = pickInt(body.coinsurancePct);
    const newVal = raw == null ? null : Math.min(100, Math.max(0, Math.round(raw)));
    if (newVal !== existing.coinsurancePct) {
      data.coinsurancePct = newVal;
      pushDiff(events, who, ORDER_FIELD_LABELS.coinsurancePct, existing.coinsurancePct, newVal);
    }
  }
  if ("deductibleAmount" in body) {
    const newVal = pickDecimal(body.deductibleAmount);
    const existingNum = existing.deductibleAmount != null ? Number(existing.deductibleAmount) : null;
    if (newVal !== existingNum) {
      data.deductibleAmount = newVal;
      pushDiff(events, who, ORDER_FIELD_LABELS.deductibleAmount, existingNum, newVal);
    }
  }
  if ("planMemberId" in body) {
    const newVal = nullableString(body.planMemberId);
    if (newVal !== existing.planMemberId) {
      data.planMemberId = newVal;
      pushDiff(events, who, ORDER_FIELD_LABELS.planMemberId, existing.planMemberId, newVal);
    }
  }
  if ("planName" in body) {
    const newVal = nullableString(body.planName);
    if (newVal !== existing.planName) {
      data.planName = newVal;
      pushDiff(events, who, ORDER_FIELD_LABELS.planName, existing.planName, newVal);
    }
  }
  if ("planType" in body) {
    const newVal = (body.planType as PlanType | null) ?? null;
    if (newVal !== existing.planType) {
      data.planType = newVal;
      pushDiff(events, who, ORDER_FIELD_LABELS.planType, existing.planType, newVal);
    }
  }
  if ("handler" in body) {
    const newVal = (body.handler as HandlerType | null) ?? null;
    if (newVal !== existing.handler) {
      data.handler = newVal;
      pushDiff(events, who, ORDER_FIELD_LABELS.handler, existing.handler, newVal);
    }
  }
  if ("workOrderType" in body && VALID_WORK_ORDER_TYPES.includes(body.workOrderType as WorkOrderType)) {
    const newVal = body.workOrderType as WorkOrderType;
    if (newVal !== existing.workOrderType) {
      data.workOrderType = newVal;
      nextWorkOrderType = newVal;
      events.push({
        who,
        action: `${ORDER_FIELD_LABELS.workOrderType} changed`,
        detail: `${WORK_ORDER_TYPE_LABELS[existing.workOrderType]} → ${WORK_ORDER_TYPE_LABELS[newVal]}`,
      });
    }
  }

  if ("status" in body) {
    const raw = body.status;
    if (!VALID_OUTCOME_STATUSES.includes(raw as OutcomeStatus)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    const newStatus = raw as OutcomeStatus;
    if (newStatus !== existing.status) {
      let reasonText = "";
      if (requiresReason(newStatus)) {
        const reason = clip(body.cancellationReason, LIMITS.reason);
        if (!reason) {
          return NextResponse.json(
            { error: `A reason is required when setting status to ${STATUS_LABELS[newStatus]}.` },
            { status: 400 },
          );
        }
        data.cancellationReason = reason;
        reasonText = reason;
      } else if (newStatus === "ACTIVE" || newStatus === "DELIVERED") {
        data.cancellationReason = null;
      }
      data.status = newStatus;
      nextStatus = newStatus;

      if (newStatus === "DELIVERED") {
        const requested = pickDate(body.deliveredAt);
        const resolvedDelivered = requested ?? existing.deliveredAt ?? now;
        data.deliveredAt = resolvedDelivered;
        data.cancelledAt = null;
        nextDeliveredAt = resolvedDelivered;
        nextCancelledAt = null;
      } else if (newStatus === "ACTIVE") {
        data.deliveredAt = null;
        data.cancelledAt = null;
        nextDeliveredAt = null;
        nextCancelledAt = null;
      } else {
        data.cancelledAt = now;
        data.deliveredAt = null;
        nextDeliveredAt = null;
        nextCancelledAt = now;
      }

      events.push({
        who,
        action: ORDER_ACTIONS.STATUS_CHANGED,
        detail: `${STATUS_LABELS[existing.status]} → ${STATUS_LABELS[newStatus]}${reasonText ? ` · Reason: ${reasonText}` : ""}`,
      });
    }
  }

  if ("cancellationReason" in body && data.status === undefined) {
    const newVal = clip(body.cancellationReason, LIMITS.reason);
    const oldVal = existing.cancellationReason ?? "";
    if (newVal !== oldVal) {
      data.cancellationReason = newVal || null;
      pushDiff(events, who, ORDER_FIELD_LABELS.cancellationReason, oldVal, newVal);
    }
  }

  if ("dischargeDate" in body) {
    const newVal = pickDate(body.dischargeDate);
    if (!eqDate(newVal, existing.dischargeDate)) {
      data.dischargeDate = newVal;
      pushDiff(events, who, ORDER_FIELD_LABELS.dischargeDate, existing.dischargeDate, newVal);
    }
  }
  if ("callReceivedDate" in body) {
    const newVal = pickDate(body.callReceivedDate);
    if (!eqDate(newVal, existing.callReceivedDate)) {
      data.callReceivedDate = newVal;
      pushDiff(events, who, ORDER_FIELD_LABELS.callReceivedDate, existing.callReceivedDate, newVal);
    }
  }
  if ("requestedDeliveryDate" in body) {
    const newVal = pickDate(body.requestedDeliveryDate);
    if (!eqDate(newVal, existing.requestedDeliveryDate)) {
      data.requestedDeliveryDate = newVal;
      pushDiff(events, who, ORDER_FIELD_LABELS.requestedDeliveryDate, existing.requestedDeliveryDate, newVal);
    }
  }
  // Delivery date can be set retroactively without flipping status. The status
  // block above already wrote deliveredAt when status changed, so skip then.
  if ("deliveredAt" in body && data.deliveredAt === undefined) {
    const newVal = pickDate(body.deliveredAt);
    if (!eqDate(newVal, existing.deliveredAt)) {
      data.deliveredAt = newVal;
      nextDeliveredAt = newVal;
      pushDiff(events, who, ORDER_FIELD_LABELS.deliveredAt, existing.deliveredAt, newVal);
    }
  }

  // Order.notes mirrors the latest note so the print ticket keeps working;
  // the canonical history lives in OrderEvent rows. Legacy `notes` key is
  // accepted for back-compat with older clients.
  const noteToAddRaw = "noteToAdd" in body ? body.noteToAdd : "notes" in body ? body.notes : undefined;
  if (typeof noteToAddRaw === "string") {
    const noteText = clip(noteToAddRaw, LIMITS.notes).trim();
    if (noteText) {
      data.notes = noteText;
      events.push({ who, action: ORDER_ACTIONS.NOTE_ADDED, detail: noteText });
    }
  }

  if ("authStatus" in body) {
    const newStatus = body.authStatus as AuthStatus;
    if (!isValidAuthTransition(existing.authStatus, newStatus)) {
      return NextResponse.json(
        { error: `Cannot move auth from ${existing.authStatus} to ${newStatus}` },
        { status: 400 },
      );
    }
    if (newStatus !== existing.authStatus) {
      data.authStatus = newStatus;
      nextAuth = newStatus;
      events.push({
        who,
        action: ORDER_ACTIONS.AUTH_STATUS_CHANGED,
        detail: `${existing.authStatus} → ${newStatus}`,
      });
      if (newStatus === "REQUIRED" && !existing.authRequiredAt) data.authRequiredAt = now;
      if (newStatus === "SUBMITTED" && !existing.authSubmittedAt) data.authSubmittedAt = now;
      if (newStatus === "APPROVED" && !existing.authApprovedAt) data.authApprovedAt = now;
      if (newStatus === "DENIED" && !existing.authDeniedAt) data.authDeniedAt = now;
    }
  }

  if ("dosSubmitted" in body) {
    const newVal = pickDate(body.dosSubmitted);
    if (!eqDate(newVal, existing.dosSubmitted)) {
      data.dosSubmitted = newVal;
      pushDiff(events, who, ORDER_FIELD_LABELS.dosSubmitted, existing.dosSubmitted, newVal);
    }
  }
  if ("dataEntryStatus" in body) {
    const newVal = (body.dataEntryStatus as DataEntryStatus | null) ?? null;
    if (newVal !== existing.dataEntryStatus) {
      data.dataEntryStatus = newVal;
      pushDiff(events, who, ORDER_FIELD_LABELS.dataEntryStatus, existing.dataEntryStatus, newVal);
    }
  }
  if ("billingStatus" in body) {
    const newVal = (body.billingStatus as BillingStatus | null) ?? null;
    if (newVal !== existing.billingStatus) {
      data.billingStatus = newVal;
      pushDiff(events, who, ORDER_FIELD_LABELS.billingStatus, existing.billingStatus, newVal);
    }
  }

  if (body.action === "print" && !existing.printedAt && existing.dispatcherId) {
    if (existing.authStatus !== "NOT_REQ" && existing.authStatus !== "APPROVED") {
      return NextResponse.json(
        { error: "Cannot print ticket until auth is Approved or Not Required." },
        { status: 400 },
      );
    }
    data.printedAt = now;
    nextPrintedAt = now;
    events.push({ who, action: ORDER_ACTIONS.TICKET_PRINTED, detail: "" });
  }
  if (body.action === "acknowledge" && !existing.acknowledgedAt) {
    data.acknowledgedAt = now;
    nextAckAt = now;
    events.push({ who, action: ORDER_ACTIONS.DISPATCHER_ACKNOWLEDGED, detail: "" });
  }
  // Out for delivery is also the door-tag retry path: re-firing it after a
  // door tag clears doorTaggedAt and stamps a fresh outForDeliveryAt so the
  // order re-enters the OUT_FOR_DELIVERY stage cleanly.
  if (body.action === "out_for_delivery") {
    if (!existing.outForDeliveryAt || existing.doorTaggedAt) {
      data.outForDeliveryAt = now;
      nextOutAt = now;
      data.doorTaggedAt = null;
      nextDoorTaggedAt = null;
      events.push({ who, action: ORDER_ACTIONS.OUT_FOR_DELIVERY, detail: "" });
    }
  }
  if (body.action === "door_tag" && existing.outForDeliveryAt && !existing.deliveredAt) {
    data.doorTaggedAt = now;
    nextDoorTaggedAt = now;
    events.push({ who, action: ORDER_ACTIONS.DOOR_TAG, detail: "" });
  }

  data.stage = deriveStage({
    current: existing.stage,
    workOrderType: nextWorkOrderType,
    status: nextStatus,
    whatsNeeded: nextWhatsNeeded,
    primaryInsuranceKey: nextPrimary,
    authStatus: nextAuth,
    dispatcherId: nextDispatcherId,
    printedAt: nextPrintedAt,
    acknowledgedAt: nextAckAt,
    outForDeliveryAt: nextOutAt,
    doorTaggedAt: nextDoorTaggedAt,
    deliveredAt: nextDeliveredAt,
    cancelledAt: nextCancelledAt,
  });

  let itemsChanged = false;
  let newItemRows: Array<{ equipmentId: string; quantity: number }> = [];
  if ("items" in body && Array.isArray(body.items)) {
    newItemRows = (body.items as Array<{ equipmentId?: unknown; quantity?: unknown }>)
      .filter((it) => typeof it.equipmentId === "string" && (it.equipmentId as string).length > 0)
      .map((it) => ({
        equipmentId: it.equipmentId as string,
        quantity: typeof it.quantity === "number" && it.quantity > 0 ? it.quantity : 1,
      }));

    const itemDetail = await diffItems(existing.items, newItemRows);
    if (itemDetail) {
      events.push({ who, action: ORDER_ACTIONS.ITEMS_CHANGED, detail: itemDetail });
      itemsChanged = true;
    }
  }

  if (events.length === 0 && Object.keys(data).length === 0 && !itemsChanged) {
    return NextResponse.json({ order: toOrderShape(existing) });
  }

  if (events.length) {
    data.history = {
      create: events.map((e) => ({ who: e.who, action: e.action, detail: e.detail })),
    };
  }

  // Bundle item replacement + order update + audit mirror into one transaction
  // so a mid-flight failure can't leave items, history, and audit out of sync.
  const updateOp = db.order.update({ where: { id }, data, include: ORDER_INCLUDE });
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  if (itemsChanged) {
    ops.push(db.orderItem.deleteMany({ where: { orderId: id } }));
    if (newItemRows.length) {
      ops.push(
        db.orderItem.createMany({
          data: newItemRows.map((it) => ({ orderId: id, equipmentId: it.equipmentId, quantity: it.quantity })),
        }),
      );
    }
  }
  ops.push(updateOp);
  if (events.length) {
    ops.push(buildAuditMirrorOp(events, user, `ORD-${existing.orderNumber}`, now));
  }
  const results = await db.$transaction(ops);
  const updated = results[ops.indexOf(updateOp)] as OrderWithIncludes;

  return NextResponse.json({ order: toOrderShape(updated) });
}

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "(empty)";
  if (Array.isArray(v)) return v.length === 0 ? "(empty)" : `[${v.join(", ")}]`;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

function pushDiff(events: Event[], who: string, label: string, oldVal: unknown, newVal: unknown) {
  events.push({ who, action: `${label} changed`, detail: `${fmt(oldVal)} → ${fmt(newVal)}` });
}

function eqArr(a: string[] | null | undefined, b: string[] | null | undefined): boolean {
  const aa = a ?? [];
  const bb = b ?? [];
  if (aa.length !== bb.length) return false;
  const sortedA = [...aa].sort();
  const sortedB = [...bb].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

function eqDate(a: Date | null | undefined, b: Date | null | undefined): boolean {
  const at = a ? a.getTime() : null;
  const bt = b ? b.getTime() : null;
  return at === bt;
}

async function diffItems(
  existingItems: ReadonlyArray<{
    equipmentId: string;
    quantity: number;
    equipment: { abbreviation: string; name: string };
  }>,
  next: ReadonlyArray<{ equipmentId: string; quantity: number }>,
): Promise<string | null> {
  const oldMap = new Map<string, { qty: number; abbr: string }>();
  for (const it of existingItems) {
    oldMap.set(it.equipmentId, { qty: it.quantity, abbr: it.equipment.abbreviation || it.equipment.name });
  }
  const newMap = new Map<string, number>();
  for (const it of next) newMap.set(it.equipmentId, it.quantity);

  const changes: string[] = [];
  for (const [eqId, info] of oldMap) {
    if (!newMap.has(eqId)) changes.push(`removed ${info.abbr}×${info.qty}`);
  }
  const newOnly = next.filter((it) => !oldMap.has(it.equipmentId));
  const newAbbrMap = newOnly.length
    ? new Map(
        (await db.equipment.findMany({
          where: { id: { in: newOnly.map((it) => it.equipmentId) } },
          select: { id: true, abbreviation: true, name: true },
        })).map((e) => [e.id, e.abbreviation || e.name]),
      )
    : new Map<string, string>();
  for (const it of newOnly) {
    const abbr = newAbbrMap.get(it.equipmentId) ?? it.equipmentId.slice(0, 8);
    changes.push(`added ${abbr}×${it.quantity}`);
  }
  for (const it of next) {
    const old = oldMap.get(it.equipmentId);
    if (old && old.qty !== it.quantity) {
      changes.push(`${old.abbr} qty ${old.qty} → ${it.quantity}`);
    }
  }
  return changes.length ? changes.join(", ") : null;
}

