import type { OrderStage, AuthStatus, DeductibleStatus, HandlerType, OutcomeStatus, WorkOrderType, VerificationStatus } from "@prisma/client";

export type { VerificationStatus };

export type OrderShape = {
  id: string;
  orderNumber: string;
  stage: OrderStage;
  workOrderType: WorkOrderType;
  linkedOrderId: string | null;
  linkedOrderNumber: string | null;
  csrId: number | null;
  csrName: string | null;
  patientFirst: string;
  patientLast: string;
  patientDisplay: string;
  facilityId: number | null;
  facilityName: string | null;
  facilityAddress: string | null;
  facilityCity: string | null;
  facilityState: string | null;
  facilityZip: string | null;
  facilityPhone: string | null;
  facilityContact: string | null;
  primaryInsuranceKey: string | null;
  secondaryInsuranceKey: string | null;
  deductibleStatus: DeductibleStatus | null;
  coinsurancePct: number | null;
  deductibleAmount: number | null;
  authStatus: AuthStatus;
  authSubmittedAt: string | null;
  dosSubmitted: string | null;
  fulfillmentCompanies: string[];
  status: OutcomeStatus;
  handler: HandlerType | null;
  // Brent's 2026-06 spec
  verificationStatus: VerificationStatus | null;
  eldercare: boolean;
  pendingDocuments: string[];
  callReceivedDate: string | null;
  dischargeDate: string | null;
  requestedDeliveryDate: string | null;
  printedAt: string | null;
  acknowledgedAt: string | null;
  outForDeliveryAt: string | null;
  doorTaggedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  notes: string;
  items: Array<{
    id: string;
    equipmentId: string;
    name: string;
    category: string;
    abbreviation: string;
    hcpcsCode: string;
    quantity: number;
    // Per-item driver + completion per Brent's "Steve delivers beds, Brent
    // delivers chairs" model. Both nullable while in flight.
    driverId: number | null;
    driverName: string | null;
    // Per-item scheduled delivery date — drives the Delivery Status
    // auto-promotion ladder in deriveDeliveryStatus().
    scheduledDeliveryDate: string | null;
    completedAt: string | null;
    // Per-item door-tag attempts. Increments when a driver leaves a tag for
    // this specific line; resets to 0 on Stage 1 equipment changes.
    doorTagCount: number;
  }>;
  history: Array<{
    id: string;
    ts: string;
    who: string;
    action: string;
    detail: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

export function normalizeName(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

export function deriveStage(input: {
  current: OrderStage;
  workOrderType: WorkOrderType;
  status: OutcomeStatus;
  primaryInsuranceKey: string | null;
  authStatus: AuthStatus;
  // Brent 2026-06: replaced the order-level dispatcherId + deliveredAt with
  // derived booleans from per-item driver assignments and completions.
  anyItemAssigned: boolean;       // ≥1 OrderItem has a driverId
  allItemsCompleted: boolean;     // every OrderItem has a non-null completedAt
  printedAt: Date | null;
  acknowledgedAt: Date | null;
  outForDeliveryAt: Date | null;
  doorTaggedAt: Date | null;
  cancelledAt: Date | null;
}): OrderStage {
  if (isTerminalStatus(input.status) && input.status !== "DELIVERED") return "CANCELLED";
  if (input.status === "DELIVERED" || input.allItemsCompleted) return "DELIVERED";
  if (input.cancelledAt) return "CANCELLED";
  if (input.outForDeliveryAt) return "OUT_FOR_DELIVERY";
  if (input.doorTaggedAt) return "DOOR_TAG";
  if (input.acknowledgedAt) return "ACKNOWLEDGED";
  if (input.printedAt && input.anyItemAssigned) return "ASSIGNED";

  // Verification only applies to DELIVERY orders. Service-call type orders
  // skip the insurance/auth gate and go straight to READY_TO_ASSIGN.
  const verificationComplete =
    input.workOrderType !== "DELIVERY" ||
    (!!input.primaryInsuranceKey &&
      (input.authStatus === "NOT_REQ" || input.authStatus === "APPROVED"));

  if (verificationComplete) return "READY_TO_ASSIGN";
  return input.current === "INTAKE_OFF_RIP" ? "INTAKE_OFF_RIP" : "INTAKE_VERIFICATION";
}

// Auto-promotion ladder for the Order.status (Delivery Status) field.
// Brent 2026-06: Delivery Status now mirrors item-level state so dispatchers
// don't have to remember to flip it manually.
//
//   verification = READY_FOR_DELIVERY → at least READY_TO_SCHEDULE
//   every item has driverId + scheduledDeliveryDate → SCHEDULED
//   every item has completedAt → DELIVERED
//
// Paused / terminal states (ON_HOLD, HELD_FOR_AUTH, CANCELLED, DELIVERED,
// LOOSE_ENDS / TRANSFERRED / REJECTED / WRITE_OFF) are sticky — auto only
// runs when the current value is in {ACTIVE, READY_TO_SCHEDULE, SCHEDULED}.
// Once paused, a human has to clear the pause before auto resumes; once
// auto-promotes to DELIVERED that's terminal too. This keeps a CSR's
// explicit "on hold" decision from being silently overwritten by a driver
// assignment.
export function deriveDeliveryStatus(input: {
  currentStatus: OutcomeStatus;
  verificationStatus: VerificationStatus | null;
  items: ReadonlyArray<{
    driverId: number | null;
    scheduledDeliveryDate: Date | string | null;
    completedAt: Date | string | null;
  }>;
}): OutcomeStatus {
  if (!AUTO_DELIVERY_STATUS_ELIGIBLE.includes(input.currentStatus)) {
    return input.currentStatus;
  }
  const items = input.items;
  if (items.length > 0 && items.every((it) => it.completedAt != null)) {
    return "DELIVERED";
  }
  if (
    items.length > 0 &&
    items.every((it) => it.driverId != null && it.scheduledDeliveryDate != null)
  ) {
    return "SCHEDULED";
  }
  if (input.verificationStatus === "READY_FOR_DELIVERY") {
    return "READY_TO_SCHEDULE";
  }
  return "ACTIVE";
}

// "Still moving toward delivery" — these statuses mean the order is in
// flight (TBD = default, SCHEDULED = planned, OUT_FOR_DELIVERY = driver
// out, DOOR_TAG = attempted). DELIVERED is intentionally NOT in this set:
// it's terminal (success).
const IN_FLIGHT_STATUSES: ReadonlyArray<OutcomeStatus> = [
  "ACTIVE", "READY_TO_SCHEDULE", "SCHEDULED", "OUT_FOR_DELIVERY", "DOOR_TAG",
];

// Statuses where deriveDeliveryStatus() may auto-advance the order along
// the in-flight ladder (TBD → Ready to Schedule → Scheduled for Delivery →
// Delivered). Paused (ON_HOLD / HELD_FOR_AUTH) and terminal (CANCELLED /
// LOOSE_ENDS / TRANSFERRED / REJECTED / WRITE_OFF / DELIVERED) are sticky —
// a human has to un-set them. DELIVERED is intentionally NOT eligible
// either (terminal once auto-promoted there).
const AUTO_DELIVERY_STATUS_ELIGIBLE: ReadonlyArray<OutcomeStatus> = [
  "ACTIVE", "READY_TO_SCHEDULE", "SCHEDULED",
];

// Paused (not terminal) — order can come back to in-flight. ON_HOLD is
// generic "stopped"; HELD_FOR_AUTH is specifically "waiting on insurance
// authorization to clear". Both stay in the "Open" view because the
// order isn't done yet.
const PAUSED_STATUSES: ReadonlyArray<OutcomeStatus> = ["ON_HOLD", "HELD_FOR_AUTH"];

// Terminal = end-state, won't progress further. DELIVERED (success) +
// cancellation-family (CANCELLED / LOOSE_ENDS / TRANSFERRED / REJECTED /
// WRITE_OFF). ON_HOLD and HELD_FOR_AUTH are paused, not terminal.
export function isTerminalStatus(s: OutcomeStatus): boolean {
  return !IN_FLIGHT_STATUSES.includes(s) && !PAUSED_STATUSES.includes(s);
}

// Blocks driver assignment. Anything not in-flight and not DELIVERED is a
// hold/cancel state — the order shouldn't pick up a new driver. DELIVERED
// is excluded so the historical assignment stays editable on a delivered row.
export function isBlockingStatus(s: OutcomeStatus): boolean {
  return !IN_FLIGHT_STATUSES.includes(s) && s !== "DELIVERED";
}

// Needs a reason note in the comments thread. Identical to the blocking set
// except HELD_FOR_AUTH — its reason is implicit (waiting on auth), so we
// don't make the user retype it. ON_HOLD / cancel / transfer / etc. all
// still want a written explanation; in-flight states
// and DELIVERED don't.
export function requiresReason(s: OutcomeStatus): boolean {
  return !IN_FLIGHT_STATUSES.includes(s) && s !== "DELIVERED" && s !== "HELD_FOR_AUTH";
}

export function authAgingDays(authStatus: AuthStatus, authSubmittedAt: string | null): number | null {
  if (authStatus !== "SUBMITTED" && authStatus !== "UNDER_REVIEW") return null;
  if (!authSubmittedAt) return null;
  return Math.floor((Date.now() - new Date(authSubmittedAt).getTime()) / (24 * 60 * 60 * 1000));
}

export function dcUrgency(dischargeDate: string | null): "none" | "ok" | "warn" | "urgent" | "overdue" {
  if (!dischargeDate) return "none";
  const days = Math.ceil((new Date(dischargeDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0) return "overdue";
  if (days < 3) return "urgent";
  if (days <= 7) return "warn";
  return "ok";
}

export const STAGE_LABELS: Record<OrderStage, string> = {
  INTAKE_OFF_RIP: "Initial Intake",
  INTAKE_VERIFICATION: "Verifying",
  READY_TO_ASSIGN: "Ready to Assign",
  ASSIGNED: "Assigned / Printed",
  ACKNOWLEDGED: "Acknowledged",
  OUT_FOR_DELIVERY: "Out for Delivery",
  DOOR_TAG: "Door Tag",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

// Stripe-style status pills: tinted bg @ ~20% alpha, deep text. No neon.
export const STAGE_COLORS: Record<OrderStage, { bg: string; color: string }> = {
  INTAKE_OFF_RIP:      { bg: "rgba(83,58,253,0.10)",   color: "#4434d4" },
  INTAKE_VERIFICATION: { bg: "rgba(155,104,41,0.14)",  color: "#9b6829" },
  READY_TO_ASSIGN:     { bg: "rgba(21,190,83,0.18)",   color: "#108c3d" },
  ASSIGNED:            { bg: "rgba(40,116,173,0.14)",  color: "#2874ad" },
  ACKNOWLEDGED:        { bg: "rgba(40,116,173,0.18)",  color: "#1f5e8a" },
  OUT_FOR_DELIVERY:    { bg: "rgba(155,104,41,0.18)",  color: "#7a5320" },
  DOOR_TAG:            { bg: "rgba(139,92,246,0.16)",  color: "#6d3fbf" },
  DELIVERED:           { bg: "rgba(21,190,83,0.14)",   color: "#108c3d" },
  CANCELLED:           { bg: "rgba(100,116,141,0.14)", color: "#64748d" },
};

export const AUTH_LABELS: Record<AuthStatus, string> = {
  NOT_REQ: "Not Required",
  REQUIRED: "Required",
  READY_TO_SUBMIT: "Ready to Submit",
  PENDING_SIGNATURE: "Pending Signature",
  PENDING_DOCUMENTS: "Pending Documents",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  APPROVED: "Approved",
  DENIED: "Denied",
};

// Auth state transitions. PENDING_DOCUMENTS is the new "pending more info"
// state per Brent's call — accessible from any in-flight state, and resolves
// out to SUBMITTED (or back to READY_TO_SUBMIT if the missing docs come in
// before the auth packet goes out).
export const AUTH_NEXT: Record<AuthStatus, ReadonlyArray<AuthStatus>> = {
  NOT_REQ:           ["REQUIRED"],
  REQUIRED:          ["NOT_REQ", "READY_TO_SUBMIT", "PENDING_SIGNATURE", "PENDING_DOCUMENTS"],
  READY_TO_SUBMIT:   ["REQUIRED", "PENDING_SIGNATURE", "PENDING_DOCUMENTS", "SUBMITTED"],
  PENDING_SIGNATURE: ["READY_TO_SUBMIT", "PENDING_DOCUMENTS", "SUBMITTED"],
  PENDING_DOCUMENTS: ["READY_TO_SUBMIT", "SUBMITTED"],
  SUBMITTED:         ["UNDER_REVIEW", "APPROVED", "DENIED"],
  UNDER_REVIEW:      ["APPROVED", "DENIED"],
  APPROVED:          ["UNDER_REVIEW", "DENIED"],
  DENIED:            ["UNDER_REVIEW", "SUBMITTED", "APPROVED"],
};

export function isValidAuthTransition(from: AuthStatus, to: AuthStatus): boolean {
  if (from === to) return true;
  // Brent 2026-06: the picker now only surfaces the 4 statuses in
  // AUTH_PICKER_VALUES, and the workflow lets the CSR jump between them
  // freely (NOT_REQ ↔ READY_TO_SUBMIT ↔ PENDING_DOCUMENTS ↔ SUBMITTED).
  // Legacy values still respect AUTH_NEXT so partially-migrated rows
  // can't drift back into deprecated states by accident.
  if (AUTH_PICKER_VALUES.includes(from) && AUTH_PICKER_VALUES.includes(to)) return true;
  return AUTH_NEXT[from].includes(to);
}

// Auth states where the order is mid-authorization (not closed-out as
// approved/denied/not-required). Drives the "auth follow-ups" filter and the
// conditional auth fields in Stage 2.
export const AUTH_IN_FLIGHT: ReadonlyArray<AuthStatus> = [
  "REQUIRED",
  "READY_TO_SUBMIT",
  "PENDING_SIGNATURE",
  "PENDING_DOCUMENTS",
  "SUBMITTED",
  "UNDER_REVIEW",
];

// Five Pending-Documents checkboxes per Brent's call. Stored as String[] in
// Order.pendingDocuments; the keys are stable code-locked identifiers (stable
// uppercase identifiers + human label). Sorted alphabetically by label.
export const PENDING_DOCUMENT_OPTIONS = [
  { key: "DIAGNOSIS_CODE", label: "Diagnosis Code" },
  { key: "FACE_SHEET",     label: "Face Sheet" },
  { key: "NOTES",          label: "Notes" },
  { key: "PICKUP_TICKET",  label: "Pick Up Ticket" },
  { key: "SIGNATURE",      label: "Signature" },
] as const;

export type PendingDocument = (typeof PENDING_DOCUMENT_OPTIONS)[number]["key"];

// Brent's manual outcome for the Verification step. Distinct from the
// auto-derived OrderStage. Enum lives in Prisma; this is the display map.
export const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  READY_FOR_DELIVERY: "Ready for Delivery",
  ON_HOLD: "On Hold",
  TRANSFERRED: "Transferred",
};

// Renamed "Status" → "Delivery Status" per Brent (2026-06). ACTIVE relabeled
// to "TBD" since the picker is about the order's delivery outcome — "to be
// determined" reads more naturally as the default than "Active". OrderStage
// (auto-derived) still surfaces "Out for Delivery" / "Door Tag" elsewhere;
// this picker is the manual outcome flag.
export const STATUS_LABELS: Record<OutcomeStatus, string> = {
  ACTIVE: "TBD",
  READY_TO_SCHEDULE: "Ready to Schedule",
  SCHEDULED: "Scheduled for Delivery",
  ON_HOLD: "On Hold",
  HELD_FOR_AUTH: "Held for Authorization",
  OUT_FOR_DELIVERY: "Out for Delivery",
  DOOR_TAG: "Door Tag",
  LOOSE_ENDS: "Loose Ends / On Call",
  TRANSFERRED: "Transferred",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  DELIVERED: "Delivered",
  WRITE_OFF: "Write Off",
};

// What the Delivery Status picker exposes. Legacy values (LOOSE_ENDS /
// TRANSFERRED / REJECTED / WRITE_OFF) are STILL valid enum members for
// back-compat on rows that already use them; they just don't appear in the
// new-order picker. The picker auto-includes the row's current value if
// it's outside this set so a user editing a legacy row doesn't see "blank".
export const DELIVERY_STATUS_PICKER_VALUES: ReadonlyArray<OutcomeStatus> = [
  "ACTIVE",            // TBD
  "READY_TO_SCHEDULE",
  "SCHEDULED",         // "Scheduled for Delivery"
  "ON_HOLD",
  "HELD_FOR_AUTH",
  "OUT_FOR_DELIVERY",
  // DOOR_TAG removed from the manual picker — door tags are now tracked
  // per-item in Stage 3 (OrderItem.doorTagCount). Existing rows that already
  // have status = DOOR_TAG still render via the "include current value"
  // logic in the picker call sites.
  "CANCELLED",
  "DELIVERED",
];

// Authorization Status picker per Brent 2026-06: just these 4. Legacy
// values (REQUIRED / PENDING_SIGNATURE / UNDER_REVIEW / APPROVED / DENIED)
// stay in the AuthStatus enum + AUTH_LABELS so existing rows still render,
// but the picker filters them out the same way DELIVERY_STATUS_PICKER_VALUES
// does for delivery status.
export const AUTH_PICKER_VALUES: ReadonlyArray<AuthStatus> = [
  "NOT_REQ",
  "READY_TO_SUBMIT",
  "PENDING_DOCUMENTS",
  "SUBMITTED",
];

export const STATUS_COLORS: Record<OutcomeStatus, { bg: string; color: string }> = {
  ACTIVE:           { bg: "rgba(83,58,253,0.10)",   color: "#4434d4" },
  READY_TO_SCHEDULE:{ bg: "rgba(40,116,173,0.10)",  color: "#2874ad" },
  SCHEDULED:        { bg: "rgba(40,116,173,0.18)",  color: "#1f5e8a" },
  ON_HOLD:          { bg: "rgba(245,158,11,0.16)",  color: "#9b6829" },
  HELD_FOR_AUTH:    { bg: "rgba(234,34,97,0.10)",   color: "#b41850" },
  OUT_FOR_DELIVERY: { bg: "rgba(155,104,41,0.18)",  color: "#7a5320" },
  DOOR_TAG:         { bg: "rgba(139,92,246,0.16)",  color: "#6d3fbf" },
  LOOSE_ENDS:       { bg: "rgba(245,158,11,0.18)",  color: "#7a5320" },
  TRANSFERRED:      { bg: "rgba(139,92,246,0.16)",  color: "#6d3fbf" },
  REJECTED:         { bg: "rgba(229,72,77,0.14)",   color: "#b03238" },
  CANCELLED:        { bg: "rgba(100,116,141,0.14)", color: "#64748d" },
  DELIVERED:        { bg: "rgba(21,190,83,0.16)",   color: "#108c3d" },
  WRITE_OFF:        { bg: "rgba(100,116,141,0.18)", color: "#475569" },
};

// Action vocabulary for OrderEvent and AuditEntry rows. These strings are
// persisted, surfaced in the History panel, and matched against in the
// LIFECYCLE_ACTIONS filter — keep them stable.
export const ORDER_ACTIONS = {
  ORDER_CREATED: "Order created",
  TICKET_PRINTED: "Ticket printed",
  DISPATCHER_ACKNOWLEDGED: "Dispatcher acknowledged",
  OUT_FOR_DELIVERY: "Out for delivery",
  DOOR_TAG: "Door tag",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  STATUS_CHANGED: "Status changed",
  AUTH_STATUS_CHANGED: "Auth status changed",
  NOTE_ADDED: "Note added",
  ITEMS_ADDED: "Equipment items added",
  ITEMS_CHANGED: "Equipment items changed",
  PICKUP_CREATED: "Pickup created",
} as const;

export type OrderAction = (typeof ORDER_ACTIONS)[keyof typeof ORDER_ACTIONS];

export const ORDER_FIELD_LABELS = {
  patientFirst: "Patient first name",
  patientLast: "Patient last name",
  csr: "CSR",
  facility: "Facility",
  dispatcher: "Dispatcher",
  fulfillmentCompanies: "Fulfillment companies",
  primaryInsurance: "Primary insurance",
  secondaryInsurance: "Secondary insurance",
  deductibleStatus: "Deductible status",
  coinsurancePct: "Coinsurance %",
  deductibleAmount: "Deductible amount",
  handler: "Handler",
  cancellationReason: "Cancellation reason",
  callReceivedDate: "Call received date",
  dischargeDate: "Discharge date",
  requestedDeliveryDate: "Requested delivery date",
  scheduledDeliveryDate: "Scheduled delivery date",
  dosSubmitted: "DOS submitted",
  workOrderType: "Work order type",
} as const;

export type OrderFieldKey = keyof typeof ORDER_FIELD_LABELS;

export const AUTH_COLORS: Record<AuthStatus, { bg: string; color: string }> = {
  NOT_REQ:           { bg: "rgba(21,190,83,0.14)",   color: "#108c3d" },
  REQUIRED:          { bg: "rgba(83,58,253,0.10)",   color: "#4434d4" },
  READY_TO_SUBMIT:   { bg: "rgba(234,34,97,0.12)",   color: "#b41850" },
  PENDING_SIGNATURE: { bg: "rgba(245,158,11,0.18)",  color: "#7a5320" },
  PENDING_DOCUMENTS: { bg: "rgba(245,158,11,0.20)",  color: "#9b6829" },
  SUBMITTED:         { bg: "rgba(155,104,41,0.14)",  color: "#9b6829" },
  UNDER_REVIEW:      { bg: "rgba(229,72,77,0.12)",   color: "#b03238" },
  APPROVED:          { bg: "rgba(21,190,83,0.18)",   color: "#108c3d" },
  DENIED:            { bg: "rgba(229,72,77,0.16)",   color: "#b03238" },
};

// Brent 2026-06 commit B: PLAN_TYPE_LABELS / DATA_ENTRY_LABELS /
// BILLING_LABELS removed alongside their Order columns. ELDERCARE and
// SERVICE_PICKUP WorkOrderType values removed (folded into eldercare flag
// + PICK_UP respectively).

export const WORK_ORDER_TYPE_LABELS: Record<WorkOrderType, string> = {
  DELIVERY: "Delivery",
  SERVICE_CALL: "Service Call",
  PICK_UP: "Pick Up",
  EQUIPMENT_MOVE: "Equipment Move",
  EXCHANGE: "Exchange",
  FACILITY_DELIVERY: "Facility Delivery",
};

export const WORK_ORDER_TYPE_COLORS: Record<WorkOrderType, { bg: string; color: string }> = {
  DELIVERY:          { bg: "rgba(83,58,253,0.10)",   color: "#4434d4" },
  SERVICE_CALL:      { bg: "rgba(40,116,173,0.16)",  color: "#1f5e8a" },
  PICK_UP:           { bg: "rgba(100,116,141,0.18)", color: "#475569" },
  EQUIPMENT_MOVE:    { bg: "rgba(21,190,83,0.14)",   color: "#108c3d" },
  EXCHANGE:          { bg: "rgba(245,158,11,0.16)",  color: "#9b6829" },
  FACILITY_DELIVERY: { bg: "rgba(139,92,246,0.16)",  color: "#6d3fbf" },
};

// Types whose verification step doesn't apply (no patient insurance/auth flow).
// Used to relax patient-name required-validation and Stage 2 derivation gates.
export function isServiceCallType(t: WorkOrderType): boolean {
  return t !== "DELIVERY";
}
