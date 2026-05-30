import type { OrderStage } from "@prisma/client";
import { AUTH_LABELS, STAGE_LABELS, authAgingDays, dcUrgency, type OrderShape } from "./order-types";

const HOUR = 60 * 60 * 1000;

export type SlaLevel = "ok" | "warn" | "breach";

// Hours an order may sit in each stage before it warns / then breaches SLA.
// Terminal stages (DELIVERED, CANCELLED) carry no SLA. These are the single
// source of truth for stage-aging thresholds — tune here, not in the UI.
export const STAGE_SLA_HOURS: Record<OrderStage, { warn: number; breach: number } | null> = {
  INTAKE_OFF_RIP: { warn: 8, breach: 24 },
  INTAKE_VERIFICATION: { warn: 24, breach: 48 },
  READY_TO_ASSIGN: { warn: 8, breach: 24 },
  ASSIGNED: { warn: 4, breach: 12 },
  ACKNOWLEDGED: { warn: 8, breach: 24 },
  OUT_FOR_DELIVERY: { warn: 8, breach: 24 },
  DOOR_TAG: { warn: 24, breach: 48 },
  DELIVERED: null,
  CANCELLED: null,
};

// Days an auth may sit in-flight (submitted / under review) before it warns /
// then breaches. authAgingDays() already returns null unless in-flight.
export const AUTH_WARN_DAYS = 5;
export const AUTH_BREACH_DAYS = 10;

// Best-effort timestamp for when the order ENTERED its current stage.
// Most forward transitions stamp a dedicated column (printedAt, acknowledgedAt,
// outForDeliveryAt, doorTaggedAt). The two paperwork stages
// (INTAKE_VERIFICATION, READY_TO_ASSIGN) have no dedicated column, so we fall
// back to updatedAt — i.e. "untouched since the last edit." INTAKE_OFF_RIP uses
// createdAt; terminal stages use their close-out timestamp.
export function stageEnteredAt(order: OrderShape): Date {
  const pick = (iso: string | null, fallback: string) => new Date(iso ?? fallback);
  switch (order.stage) {
    case "DELIVERED":
      return pick(order.deliveredAt, order.updatedAt);
    case "CANCELLED":
      return pick(order.cancelledAt, order.updatedAt);
    case "OUT_FOR_DELIVERY":
      return pick(order.outForDeliveryAt, order.updatedAt);
    case "DOOR_TAG":
      return pick(order.doorTaggedAt, order.updatedAt);
    case "ACKNOWLEDGED":
      return pick(order.acknowledgedAt, order.updatedAt);
    case "ASSIGNED":
      return pick(order.printedAt, order.updatedAt);
    case "READY_TO_ASSIGN":
      return new Date(order.updatedAt);
    case "INTAKE_VERIFICATION":
      return new Date(order.updatedAt);
    case "INTAKE_OFF_RIP":
      return new Date(order.createdAt);
  }
}

export type StageAging = {
  hours: number;
  level: SlaLevel;
  enteredAt: Date;
  threshold: { warn: number; breach: number };
};

// How long the order has sat in its current stage, and whether that breaches
// the stage SLA. Returns null for terminal stages (no SLA).
export function stageAging(order: OrderShape, now: number = Date.now()): StageAging | null {
  const threshold = STAGE_SLA_HOURS[order.stage];
  if (!threshold) return null;
  const enteredAt = stageEnteredAt(order);
  const hours = Math.max(0, (now - enteredAt.getTime()) / HOUR);
  const level: SlaLevel = hours >= threshold.breach ? "breach" : hours >= threshold.warn ? "warn" : "ok";
  return { hours, level, enteredAt, threshold };
}

// Compact human duration: "<1h", "6h", "2d", "2d 3h".
export function formatDuration(hours: number): string {
  if (hours < 1) return "<1h";
  if (hours < 24) return `${Math.floor(hours)}h`;
  const d = Math.floor(hours / 24);
  const h = Math.floor(hours % 24);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

export type AlertKind = "stage" | "auth" | "discharge";

export type OrderAlert = {
  kind: AlertKind;
  level: Exclude<SlaLevel, "ok">;
  label: string;
  detail: string;
};

// Roll up every SLA dimension for one order into a severity-tagged alert list.
// Only warn/breach conditions are returned; an empty array means "healthy."
// Terminal orders (delivered / cancelled) never alert.
export function orderAlerts(order: OrderShape, now: number = Date.now()): OrderAlert[] {
  const alerts: OrderAlert[] = [];
  if (order.stage === "DELIVERED" || order.stage === "CANCELLED") return alerts;

  // 1) Stuck-in-stage
  const aging = stageAging(order, now);
  if (aging && aging.level !== "ok") {
    alerts.push({
      kind: "stage",
      level: aging.level,
      label: `${formatDuration(aging.hours)} in ${STAGE_LABELS[order.stage]}`,
      detail: `In ${STAGE_LABELS[order.stage]} for ${formatDuration(aging.hours)} — SLA is ${aging.threshold.breach}h.`,
    });
  }

  // 2) Authorization aging (in-flight only)
  const authAge = authAgingDays(order.authStatus, order.authSubmittedAt);
  if (authAge !== null && authAge >= AUTH_WARN_DAYS) {
    alerts.push({
      kind: "auth",
      level: authAge >= AUTH_BREACH_DAYS ? "breach" : "warn",
      label: `Auth ${authAge}d`,
      detail: `Auth ${AUTH_LABELS[order.authStatus]} for ${authAge}d with no resolution.`,
    });
  }

  // 3) Discharge urgency (imminent / passed and not yet delivered)
  const dc = dcUrgency(order.dischargeDate);
  if (dc === "overdue" || dc === "urgent") {
    alerts.push({
      kind: "discharge",
      level: dc === "overdue" ? "breach" : "warn",
      label: dc === "overdue" ? "DC overdue" : "DC imminent",
      detail:
        dc === "overdue"
          ? "Discharge date has passed and the order isn't delivered."
          : "Discharge is within 3 days and the order isn't delivered.",
    });
  }

  return alerts;
}

// Highest severity across a set of alerts. "ok" when the list is empty.
export function topAlertLevel(alerts: OrderAlert[]): SlaLevel {
  if (alerts.some((a) => a.level === "breach")) return "breach";
  if (alerts.some((a) => a.level === "warn")) return "warn";
  return "ok";
}

// Sort weight so breaches float above warnings above healthy rows.
export function alertSortWeight(level: SlaLevel): number {
  return level === "breach" ? 2 : level === "warn" ? 1 : 0;
}
