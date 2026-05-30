import { describe, expect, it } from "vitest";
import type { OrderShape } from "./order-types";
import {
  formatDuration,
  orderAlerts,
  stageAging,
  stageEnteredAt,
  topAlertLevel,
} from "./sla";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 4, 29, 12, 0, 0); // fixed clock for deterministic aging

// Minimal OrderShape factory — only the fields SLA logic reads are meaningful;
// the rest are filled with inert defaults and cast to satisfy the type.
function makeOrder(overrides: Partial<OrderShape> = {}): OrderShape {
  const base = {
    id: "o1",
    orderNumber: "ED-2026-000001",
    stage: "READY_TO_ASSIGN",
    workOrderType: "DELIVERY",
    status: "ACTIVE",
    authStatus: "NOT_REQ",
    authSubmittedAt: null,
    dischargeDate: null,
    printedAt: null,
    acknowledgedAt: null,
    outForDeliveryAt: null,
    doorTaggedAt: null,
    deliveredAt: null,
    cancelledAt: null,
    createdAt: new Date(NOW).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
  } as unknown as OrderShape;
  return { ...base, ...overrides };
}

describe("formatDuration", () => {
  it("renders sub-hour, hour, and day spans", () => {
    expect(formatDuration(0.5)).toBe("<1h");
    expect(formatDuration(6)).toBe("6h");
    expect(formatDuration(48)).toBe("2d");
    expect(formatDuration(51)).toBe("2d 3h");
  });
});

describe("stageEnteredAt", () => {
  it("uses createdAt for INTAKE_OFF_RIP", () => {
    const o = makeOrder({ stage: "INTAKE_OFF_RIP", createdAt: new Date(NOW - 5 * HOUR).toISOString() });
    expect(stageEnteredAt(o).getTime()).toBe(NOW - 5 * HOUR);
  });

  it("uses the dedicated timestamp for ASSIGNED (printedAt)", () => {
    const o = makeOrder({ stage: "ASSIGNED", printedAt: new Date(NOW - 3 * HOUR).toISOString() });
    expect(stageEnteredAt(o).getTime()).toBe(NOW - 3 * HOUR);
  });

  it("falls back to updatedAt for paperwork stages with no dedicated column", () => {
    const o = makeOrder({ stage: "READY_TO_ASSIGN", updatedAt: new Date(NOW - 2 * HOUR).toISOString() });
    expect(stageEnteredAt(o).getTime()).toBe(NOW - 2 * HOUR);
  });
});

describe("stageAging", () => {
  it("returns null for terminal stages", () => {
    expect(stageAging(makeOrder({ stage: "DELIVERED" }), NOW)).toBeNull();
    expect(stageAging(makeOrder({ stage: "CANCELLED" }), NOW)).toBeNull();
  });

  it("is ok below the warn threshold", () => {
    // ASSIGNED warns at 4h
    const o = makeOrder({ stage: "ASSIGNED", printedAt: new Date(NOW - 2 * HOUR).toISOString() });
    expect(stageAging(o, NOW)?.level).toBe("ok");
  });

  it("warns between warn and breach thresholds", () => {
    const o = makeOrder({ stage: "ASSIGNED", printedAt: new Date(NOW - 6 * HOUR).toISOString() });
    expect(stageAging(o, NOW)?.level).toBe("warn");
  });

  it("breaches at or beyond the breach threshold", () => {
    const o = makeOrder({ stage: "ASSIGNED", printedAt: new Date(NOW - 13 * HOUR).toISOString() });
    expect(stageAging(o, NOW)?.level).toBe("breach");
  });
});

describe("orderAlerts", () => {
  it("returns no alerts for a fresh, healthy order", () => {
    const o = makeOrder({ stage: "READY_TO_ASSIGN", updatedAt: new Date(NOW - 1 * HOUR).toISOString() });
    expect(orderAlerts(o, NOW)).toHaveLength(0);
  });

  it("never alerts on delivered orders even if old", () => {
    const o = makeOrder({ stage: "DELIVERED", deliveredAt: new Date(NOW - 30 * DAY).toISOString() });
    expect(orderAlerts(o, NOW)).toHaveLength(0);
  });

  it("flags a stuck stage", () => {
    const o = makeOrder({ stage: "READY_TO_ASSIGN", updatedAt: new Date(NOW - 30 * HOUR).toISOString() });
    const alerts = orderAlerts(o, NOW);
    expect(alerts.some((a) => a.kind === "stage" && a.level === "breach")).toBe(true);
  });

  it("flags aged in-flight authorization", () => {
    const o = makeOrder({
      stage: "INTAKE_VERIFICATION",
      authStatus: "SUBMITTED",
      authSubmittedAt: new Date(NOW - 12 * DAY).toISOString(),
      updatedAt: new Date(NOW - 1 * HOUR).toISOString(),
    });
    const alerts = orderAlerts(o, NOW);
    expect(alerts.some((a) => a.kind === "auth" && a.level === "breach")).toBe(true);
  });

  it("flags an overdue discharge date", () => {
    const o = makeOrder({
      stage: "READY_TO_ASSIGN",
      dischargeDate: new Date(NOW - 2 * DAY).toISOString(),
      updatedAt: new Date(NOW - 1 * HOUR).toISOString(),
    });
    const alerts = orderAlerts(o, NOW);
    expect(alerts.some((a) => a.kind === "discharge" && a.level === "breach")).toBe(true);
  });

  it("stacks multiple alerts and topAlertLevel picks the worst", () => {
    const o = makeOrder({
      stage: "READY_TO_ASSIGN",
      updatedAt: new Date(NOW - 30 * HOUR).toISOString(), // stage breach
      dischargeDate: new Date(NOW + 1 * DAY).toISOString(), // dc imminent (warn)
    });
    const alerts = orderAlerts(o, NOW);
    expect(alerts.length).toBeGreaterThanOrEqual(2);
    expect(topAlertLevel(alerts)).toBe("breach");
  });
});
