import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { LIMITS, clip, getSessionUser } from "@/lib/auth";
import {
  ORDER_INCLUDE,
  asStringArray,
  buildAuditMirrorOp,
  deriveStage,
  formatPatientName,
  generateOrderNumber,
  normalizeName,
  nullableString,
  pickDate,
  pickDecimal,
  pickInt,
  toOrderShape,
  type OrderEventInput,
} from "@/lib/order-helpers";
import {
  AUTH_LABELS,
  ORDER_ACTIONS,
  ORDER_FIELD_LABELS,
  STATUS_LABELS,
  WORK_ORDER_TYPE_LABELS,
  isServiceCallType,
  requiresReason,
} from "@/lib/order-types";
import type {
  AuthStatus,
  DeductibleStatus,
  HandlerType,
  OutcomeStatus,
  VerificationStatus,
  WorkOrderType,
} from "@prisma/client";

const VALID_WORK_ORDER_TYPES = Object.keys(WORK_ORDER_TYPE_LABELS) as WorkOrderType[];
const VALID_AUTH_STATUSES = Object.keys(AUTH_LABELS) as AuthStatus[];
const VALID_VERIFICATION_STATUSES: ReadonlyArray<VerificationStatus> = [
  "READY_FOR_DELIVERY", "ON_HOLD", "TRANSFERRED",
];
const VALID_OUTCOME_STATUSES: ReadonlyArray<OutcomeStatus> = [
  "ACTIVE", "ON_HOLD", "LOOSE_ENDS", "TRANSFERRED", "REJECTED", "CANCELLED", "DELIVERED", "WRITE_OFF",
];

// `dispatcher` is legacy (renamed to `driver` per Brent 2026-06); both are
// accepted until the backfill + commit B retire the old role.
// Role gate dropped per Brent 2026-06 — any authenticated user can create
// an order. Kept the constant declaration removed to avoid dead code.

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Tracker view tabs were removed in 2026-06 — clients no longer pass
  // `?view=open|today|auth-followups`. The endpoint just returns every
  // order; filtering happens client-side in TrackerClient.
  const rows = await db.order.findMany({
    include: ORDER_INCLUDE,
    orderBy: [{ dischargeDate: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ orders: rows.map(toOrderShape) });
}

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const csrId = pickInt(body.csrId) ?? user.id;
  const patientFirst = normalizeName(clip(body.patientFirst, LIMITS.name));
  const patientLast = normalizeName(clip(body.patientLast, LIMITS.name));
  const facilityId = pickInt(body.facilityId);
  const workOrderType: WorkOrderType = VALID_WORK_ORDER_TYPES.includes(body.workOrderType as WorkOrderType)
    ? (body.workOrderType as WorkOrderType)
    : "DELIVERY";
  const linkedOrderId = typeof body.linkedOrderId === "string" && body.linkedOrderId ? body.linkedOrderId : null;

  if (!facilityId) {
    return NextResponse.json({ error: "Facility is required" }, { status: 400 });
  }
  if (!isServiceCallType(workOrderType) && !patientFirst && !patientLast) {
    return NextResponse.json({ error: "Patient name is required" }, { status: 400 });
  }

  const orderNumber = await generateOrderNumber();
  const initialItems = Array.isArray(body.items)
    ? (body.items as Array<{
        equipmentId?: unknown;
        quantity?: unknown;
        driverId?: unknown;
        completedAt?: unknown;
        doorTagCount?: unknown;
      }>)
        .filter((it) => typeof it.equipmentId === "string" && (it.equipmentId as string).length > 0)
        .map((it) => ({
          equipmentId: it.equipmentId as string,
          quantity: typeof it.quantity === "number" && it.quantity > 0 ? it.quantity : 1,
          driverId: typeof it.driverId === "number" ? it.driverId : null,
          completedAt: typeof it.completedAt === "string" && it.completedAt
            ? new Date(it.completedAt + "T00:00:00.000Z")
            : null,
          doorTagCount: typeof it.doorTagCount === "number" && it.doorTagCount >= 0
            ? Math.floor(it.doorTagCount)
            : 0,
        }))
    : [];

  // Back-compat: legacy clients send `notes`; new ones send `noteToAdd`.
  const rawNote = typeof body.noteToAdd === "string" ? body.noteToAdd : body.notes;
  const cleanNotes = clip(rawNote, LIMITS.notes).trim();
  const dischargeDate = pickDate(body.dischargeDate);
  const requestedDeliveryDate = pickDate(body.requestedDeliveryDate);
  const callReceivedDate = pickDate(body.callReceivedDate);
  const now = new Date();

  // --- Optional Stage 2 (verification) + Stage 3 (dispatch) fields. The create
  // form can now submit the whole order at once, so the CSR can verify and
  // dispatch in a single pass. Each of these is null/empty when only the intake
  // step was filled, in which case the order simply lands at INTAKE_OFF_RIP. ---
  const primaryInsuranceKey = nullableString(body.primaryInsuranceKey);
  const secondaryInsuranceKey = nullableString(body.secondaryInsuranceKey);
  const deductibleStatus = (body.deductibleStatus as DeductibleStatus | null) ?? null;
  const coinsuranceRaw = pickInt(body.coinsurancePct);
  const coinsurancePct =
    coinsuranceRaw == null ? null : Math.min(100, Math.max(0, Math.round(coinsuranceRaw)));
  const deductibleAmount = pickDecimal(body.deductibleAmount);
  // Brent 2026-06: planMemberId / planName / planType / dataEntryStatus /
  // billingStatus are no longer captured. Existing DB values are left intact
  // (commit B drops the columns). dispatcherId / deliveredAt similarly no
  // longer flow through here — see the per-item driverId / completedAt
  // fields on `initialItems` above.
  const dosSubmitted = pickDate(body.dosSubmitted);
  const authStatus: AuthStatus = VALID_AUTH_STATUSES.includes(body.authStatus as AuthStatus)
    ? (body.authStatus as AuthStatus)
    : "NOT_REQ";
  const pendingDocuments = authStatus === "PENDING_DOCUMENTS"
    ? asStringArray(body.pendingDocuments).slice(0, 10)
    : [];
  const verificationStatus = VALID_VERIFICATION_STATUSES.includes(body.verificationStatus as VerificationStatus)
    ? (body.verificationStatus as VerificationStatus)
    : null;
  const eldercare = body.eldercare === true;
  const fulfillmentCompanies = asStringArray(body.fulfillmentCompanies).slice(0, 20);
  const handler = (body.handler as HandlerType | null) ?? null;

  // Outcome status governs whether the order is parked (cancelledAt) or
  // delivered. Mirror the PATCH route's resolution so create + edit agree.
  const status: OutcomeStatus = VALID_OUTCOME_STATUSES.includes(body.status as OutcomeStatus)
    ? (body.status as OutcomeStatus)
    : "ACTIVE";
  let cancellationReason: string | null = null;
  let cancelledAt: Date | null = null;
  if (status !== "ACTIVE") {
    if (requiresReason(status)) {
      const reason = clip(body.cancellationReason, LIMITS.reason);
      if (!reason) {
        return NextResponse.json(
          { error: `A reason is required when setting status to ${STATUS_LABELS[status]}.` },
          { status: 400 },
        );
      }
      cancellationReason = reason;
    }
    if (status !== "DELIVERED") {
      cancelledAt = now;
    }
  }

  // Stamp the auth milestone matching the chosen status, same as the PATCH
  // transitions would have on the way in.
  const authRequiredAt = authStatus === "REQUIRED" ? now : null;
  const authSubmittedAt = authStatus === "SUBMITTED" ? now : null;
  const authApprovedAt = authStatus === "APPROVED" ? now : null;
  const authDeniedAt = authStatus === "DENIED" ? now : null;

  const stage = deriveStage({
    current: "INTAKE_OFF_RIP",
    workOrderType,
    status,
    primaryInsuranceKey,
    authStatus,
    // Per-item drivers/completion per Brent 2026-06.
    anyItemAssigned: initialItems.some((it) => it.driverId != null),
    allItemsCompleted: initialItems.length > 0
      && initialItems.every((it) => it.completedAt != null),
    printedAt: null,
    acknowledgedAt: null,
    outForDeliveryAt: null,
    doorTaggedAt: null,
    cancelledAt,
  });

  // Resolve display names in parallel so the audit trail can show "Acme SNF"
  // instead of "Facility #42" without serializing the round-trips.
  const [csr, facility, equipmentRows] = await Promise.all([
    csrId
      ? db.user.findUnique({ where: { id: csrId }, select: { name: true } })
      : Promise.resolve(null),
    db.facility.findUnique({ where: { id: facilityId }, select: { name: true } }),
    initialItems.length
      ? db.equipment.findMany({
          where: { id: { in: initialItems.map((it) => it.equipmentId) } },
          select: { id: true, abbreviation: true, name: true },
        })
      : Promise.resolve([] as Array<{ id: string; abbreviation: string; name: string }>),
  ]);
  const equipmentNames = new Map(equipmentRows.map((e) => [e.id, e.abbreviation || e.name]));

  const initialEvents: OrderEventInput[] = [
    { who: user.name, action: ORDER_ACTIONS.ORDER_CREATED, detail: `Order # ${orderNumber}` },
  ];
  const pushSet = (label: string, detail: string) => {
    if (!detail) return;
    initialEvents.push({ who: user.name, action: `${label} set`, detail });
  };
  if (workOrderType !== "DELIVERY") pushSet(ORDER_FIELD_LABELS.workOrderType, WORK_ORDER_TYPE_LABELS[workOrderType]);
  if (csr?.name) pushSet(ORDER_FIELD_LABELS.csr, csr.name);
  if (patientFirst) pushSet(ORDER_FIELD_LABELS.patientFirst, patientFirst);
  if (patientLast) pushSet(ORDER_FIELD_LABELS.patientLast, patientLast);
  if (facility?.name) pushSet(ORDER_FIELD_LABELS.facility, facility.name);
  if (callReceivedDate) pushSet(ORDER_FIELD_LABELS.callReceivedDate, callReceivedDate.toISOString().slice(0, 10));
  if (dischargeDate) pushSet(ORDER_FIELD_LABELS.dischargeDate, dischargeDate.toISOString().slice(0, 10));
  if (requestedDeliveryDate) pushSet(ORDER_FIELD_LABELS.requestedDeliveryDate, requestedDeliveryDate.toISOString().slice(0, 10));
  if (primaryInsuranceKey) pushSet(ORDER_FIELD_LABELS.primaryInsurance, primaryInsuranceKey);
  if (secondaryInsuranceKey) pushSet(ORDER_FIELD_LABELS.secondaryInsurance, secondaryInsuranceKey);
  if (deductibleStatus) pushSet(ORDER_FIELD_LABELS.deductibleStatus, deductibleStatus);
  if (coinsurancePct != null) pushSet(ORDER_FIELD_LABELS.coinsurancePct, String(coinsurancePct));
  if (deductibleAmount != null) pushSet(ORDER_FIELD_LABELS.deductibleAmount, String(deductibleAmount));
  if (authStatus !== "NOT_REQ") {
    initialEvents.push({
      who: user.name,
      action: ORDER_ACTIONS.AUTH_STATUS_CHANGED,
      detail: `NOT_REQ → ${authStatus}`,
    });
  }
  if (dosSubmitted) pushSet(ORDER_FIELD_LABELS.dosSubmitted, dosSubmitted.toISOString().slice(0, 10));
  if (verificationStatus) pushSet("Verification status", verificationStatus);
  if (eldercare) pushSet("Eldercare", "yes");
  if (pendingDocuments.length) pushSet("Pending documents", `[${pendingDocuments.join(", ")}]`);
  if (fulfillmentCompanies.length) pushSet(ORDER_FIELD_LABELS.fulfillmentCompanies, `[${fulfillmentCompanies.join(", ")}]`);
  if (handler) pushSet(ORDER_FIELD_LABELS.handler, handler);
  if (status !== "ACTIVE") {
    initialEvents.push({
      who: user.name,
      action: ORDER_ACTIONS.STATUS_CHANGED,
      detail: `${STATUS_LABELS.ACTIVE} → ${STATUS_LABELS[status]}${cancellationReason ? ` · Reason: ${cancellationReason}` : ""}`,
    });
  }
  if (initialItems.length) {
    initialEvents.push({
      who: user.name,
      action: ORDER_ACTIONS.ITEMS_ADDED,
      detail: initialItems
        .map((it) => `${equipmentNames.get(it.equipmentId) ?? it.equipmentId.slice(0, 8)}×${it.quantity}`)
        .join(", "),
    });
  }
  if (cleanNotes) initialEvents.push({ who: user.name, action: ORDER_ACTIONS.NOTE_ADDED, detail: cleanNotes });

  // Order create + system audit mirror in a single transaction so a half-baked
  // create can never leave audit rows pointing at a missing order.
  const [created] = await db.$transaction([
    db.order.create({
      data: {
        orderNumber,
        stage,
        workOrderType,
        eldercare,
        linkedOrderId,
        csrId,
        createdById: user.id,
        patientFirst,
        patientLast,
        facilityId,
        notes: cleanNotes,
        callReceivedDate,
        dischargeDate,
        requestedDeliveryDate,
        primaryInsuranceKey,
        secondaryInsuranceKey,
        deductibleStatus,
        coinsurancePct,
        deductibleAmount,
        authStatus,
        authRequiredAt,
        authSubmittedAt,
        authApprovedAt,
        authDeniedAt,
        pendingDocuments,
        verificationStatus,
        dosSubmitted,
        fulfillmentCompanies,
        handler,
        status,
        cancellationReason,
        cancelledAt,
        // Brent 2026-06: items carry their own driverId + completedAt.
        items: initialItems.length
          ? {
              createMany: {
                data: initialItems.map((it) => ({
                  equipmentId: it.equipmentId,
                  quantity: it.quantity,
                  driverId: it.driverId,
                  completedAt: it.completedAt,
                  doorTagCount: it.doorTagCount,
                })),
              },
            }
          : undefined,
        history: { create: initialEvents.map((e) => ({ who: e.who, action: e.action, detail: e.detail })) },
      },
      include: ORDER_INCLUDE,
    }),
    buildAuditMirrorOp(initialEvents, user, `ORD-${orderNumber}`, formatPatientName(patientFirst, patientLast)),
  ]);

  return NextResponse.json({ order: toOrderShape(created) }, { status: 201 });
}

export { deriveStage };
