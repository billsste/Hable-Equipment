import type { OrderStage, AuthStatus, DeductibleStatus, HandlerType, OutcomeStatus, DataEntryStatus, BillingStatus, WorkOrderType, PlanType } from "@prisma/client";

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
  whatsNeeded: string[];
  primaryInsuranceKey: string | null;
  secondaryInsuranceKey: string | null;
  deductibleStatus: DeductibleStatus | null;
  coinsurancePct: number | null;
  deductibleAmount: number | null;
  planMemberId: string | null;
  planName: string | null;
  planType: PlanType | null;
  authStatus: AuthStatus;
  authSubmittedAt: string | null;
  dosSubmitted: string | null;
  dataEntryStatus: DataEntryStatus | null;
  billingStatus: BillingStatus | null;
  fulfillmentCompanies: string[];
  status: OutcomeStatus;
  handler: HandlerType | null;
  callReceivedDate: string | null;
  dischargeDate: string | null;
  requestedDeliveryDate: string | null;
  dispatcherId: number | null;
  dispatcherName: string | null;
  printedAt: string | null;
  acknowledgedAt: string | null;
  outForDeliveryAt: string | null;
  doorTaggedAt: string | null;
  deliveredAt: string | null;
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
  whatsNeeded: string[];
  primaryInsuranceKey: string | null;
  authStatus: AuthStatus;
  dispatcherId: number | null;
  printedAt: Date | null;
  acknowledgedAt: Date | null;
  outForDeliveryAt: Date | null;
  doorTaggedAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
}): OrderStage {
  if (isTerminalStatus(input.status) && input.status !== "DELIVERED") return "CANCELLED";
  if (input.status === "DELIVERED" || input.deliveredAt) return "DELIVERED";
  if (input.cancelledAt) return "CANCELLED";
  if (input.outForDeliveryAt) return "OUT_FOR_DELIVERY";
  if (input.doorTaggedAt) return "DOOR_TAG";
  if (input.acknowledgedAt) return "ACKNOWLEDGED";
  if (input.printedAt && input.dispatcherId) return "ASSIGNED";

  // Verification only applies to DELIVERY orders. Service-call type orders
  // skip the insurance/auth gate and go straight to READY_TO_ASSIGN.
  const verificationComplete =
    input.workOrderType !== "DELIVERY" ||
    (input.whatsNeeded.length === 0 &&
      !!input.primaryInsuranceKey &&
      (input.authStatus === "NOT_REQ" || input.authStatus === "APPROVED"));

  if (verificationComplete) return "READY_TO_ASSIGN";
  return input.current === "INTAKE_OFF_RIP" ? "INTAKE_OFF_RIP" : "INTAKE_VERIFICATION";
}

export function isTerminalStatus(s: OutcomeStatus): boolean {
  return s !== "ACTIVE" && s !== "ON_HOLD";
}

// Statuses that block dispatcher assignment (not actively in flight).
export function isBlockingStatus(s: OutcomeStatus): boolean {
  return s !== "ACTIVE" && s !== "DELIVERED";
}

// Non-active statuses require a reason note.
export function requiresReason(s: OutcomeStatus): boolean {
  return s !== "ACTIVE" && s !== "DELIVERED";
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
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  APPROVED: "Approved",
  DENIED: "Denied",
};

export const AUTH_NEXT: Record<AuthStatus, ReadonlyArray<AuthStatus>> = {
  NOT_REQ:           ["REQUIRED"],
  REQUIRED:          ["NOT_REQ", "READY_TO_SUBMIT", "PENDING_SIGNATURE"],
  READY_TO_SUBMIT:   ["REQUIRED", "PENDING_SIGNATURE", "SUBMITTED"],
  PENDING_SIGNATURE: ["READY_TO_SUBMIT", "SUBMITTED"],
  SUBMITTED:         ["UNDER_REVIEW", "APPROVED", "DENIED"],
  UNDER_REVIEW:      ["APPROVED", "DENIED"],
  APPROVED:          ["UNDER_REVIEW", "DENIED"],
  DENIED:            ["UNDER_REVIEW", "SUBMITTED", "APPROVED"],
};

export function isValidAuthTransition(from: AuthStatus, to: AuthStatus): boolean {
  if (from === to) return true;
  return AUTH_NEXT[from].includes(to);
}

// Auth states where the order is mid-authorization (not closed-out as
// approved/denied/not-required). Drives the "auth follow-ups" filter and the
// conditional auth fields in Stage 2.
export const AUTH_IN_FLIGHT: ReadonlyArray<AuthStatus> = [
  "REQUIRED",
  "READY_TO_SUBMIT",
  "PENDING_SIGNATURE",
  "SUBMITTED",
  "UNDER_REVIEW",
];

export const STATUS_LABELS: Record<OutcomeStatus, string> = {
  ACTIVE: "Active",
  ON_HOLD: "On Hold",
  LOOSE_ENDS: "Loose Ends / On Call",
  TRANSFERRED: "Transferred",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  DELIVERED: "Delivered",
  WRITE_OFF: "Write Off",
};

export const STATUS_COLORS: Record<OutcomeStatus, { bg: string; color: string }> = {
  ACTIVE:      { bg: "rgba(83,58,253,0.10)",   color: "#4434d4" },
  ON_HOLD:     { bg: "rgba(245,158,11,0.16)",  color: "#9b6829" },
  LOOSE_ENDS:  { bg: "rgba(245,158,11,0.18)",  color: "#7a5320" },
  TRANSFERRED: { bg: "rgba(139,92,246,0.16)",  color: "#6d3fbf" },
  REJECTED:    { bg: "rgba(229,72,77,0.14)",   color: "#b03238" },
  CANCELLED:   { bg: "rgba(100,116,141,0.14)", color: "#64748d" },
  DELIVERED:   { bg: "rgba(21,190,83,0.16)",   color: "#108c3d" },
  WRITE_OFF:   { bg: "rgba(100,116,141,0.18)", color: "#475569" },
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
  whatsNeeded: "What's still needed",
  fulfillmentCompanies: "Fulfillment companies",
  primaryInsurance: "Primary insurance",
  secondaryInsurance: "Secondary insurance",
  deductibleStatus: "Deductible status",
  coinsurancePct: "Coinsurance %",
  deductibleAmount: "Deductible amount",
  planMemberId: "Plan ID",
  planName: "Plan name",
  planType: "Plan type",
  handler: "Handler",
  cancellationReason: "Cancellation reason",
  callReceivedDate: "Call received date",
  dischargeDate: "Discharge date",
  requestedDeliveryDate: "Requested delivery date",
  deliveredAt: "Delivery date",
  dosSubmitted: "DOS submitted",
  dataEntryStatus: "Data entry status",
  billingStatus: "Billing status",
  workOrderType: "Work order type",
} as const;

export type OrderFieldKey = keyof typeof ORDER_FIELD_LABELS;

export const AUTH_COLORS: Record<AuthStatus, { bg: string; color: string }> = {
  NOT_REQ:           { bg: "rgba(21,190,83,0.14)",   color: "#108c3d" },
  REQUIRED:          { bg: "rgba(83,58,253,0.10)",   color: "#4434d4" },
  READY_TO_SUBMIT:   { bg: "rgba(234,34,97,0.12)",   color: "#b41850" },
  PENDING_SIGNATURE: { bg: "rgba(245,158,11,0.18)",  color: "#7a5320" },
  SUBMITTED:         { bg: "rgba(155,104,41,0.14)",  color: "#9b6829" },
  UNDER_REVIEW:      { bg: "rgba(229,72,77,0.12)",   color: "#b03238" },
  APPROVED:          { bg: "rgba(21,190,83,0.18)",   color: "#108c3d" },
  DENIED:            { bg: "rgba(229,72,77,0.16)",   color: "#b03238" },
};

export const PLAN_TYPE_LABELS: Record<PlanType, string> = {
  HMO: "HMO",
  HMO_POS: "HMO / POS",
  PPO: "PPO",
};

export const DATA_ENTRY_LABELS: Record<DataEntryStatus, string> = {
  NOT_STARTED: "Not Started",
  PT: "PT",
  CLINICAL: "Clinical",
  INS: "INS",
  DT: "DT",
  SERIAL: "Serial #",
  ENTRY_COMPLETE: "Entry Complete",
  ENTERED_FOR_WRITE_OFF: "Entered for Write Off",
};

export const BILLING_LABELS: Record<BillingStatus, string> = {
  PENDING: "Pending",
  CLAIM_DROPPED: "Claim Dropped",
  DEDUCT_HOLD: "Deduct Hold",
  WROTE_OFF: "Wrote Off",
};

export const WORK_ORDER_TYPE_LABELS: Record<WorkOrderType, string> = {
  DELIVERY: "Delivery",
  SERVICE_CALL: "Service Call",
  PICK_UP: "Pick Up",
  EQUIPMENT_MOVE: "Equipment Move",
  EXCHANGE: "Exchange",
  FACILITY_DELIVERY: "Facility Delivery",
  ELDERCARE: "Eldercare",
  SERVICE_PICKUP: "Service / Pick Up",
};

export const WORK_ORDER_TYPE_COLORS: Record<WorkOrderType, { bg: string; color: string }> = {
  DELIVERY:          { bg: "rgba(83,58,253,0.10)",   color: "#4434d4" },
  SERVICE_CALL:      { bg: "rgba(40,116,173,0.16)",  color: "#1f5e8a" },
  PICK_UP:           { bg: "rgba(100,116,141,0.18)", color: "#475569" },
  EQUIPMENT_MOVE:    { bg: "rgba(21,190,83,0.14)",   color: "#108c3d" },
  EXCHANGE:          { bg: "rgba(245,158,11,0.16)",  color: "#9b6829" },
  FACILITY_DELIVERY: { bg: "rgba(139,92,246,0.16)",  color: "#6d3fbf" },
  ELDERCARE:         { bg: "rgba(229,72,77,0.12)",   color: "#b03238" },
  SERVICE_PICKUP:    { bg: "rgba(100,116,141,0.14)", color: "#64748d" },
};

// Types whose verification step doesn't apply (no patient insurance/auth flow).
// Used to relax patient-name required-validation and Stage 2 derivation gates.
export function isServiceCallType(t: WorkOrderType): boolean {
  return t !== "DELIVERY";
}
