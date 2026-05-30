import { describe, expect, it } from "vitest";
import { applyStatusTransition, isValidStatus, SERIAL_STATUSES } from "./serials";

const NOW = new Date(Date.UTC(2026, 4, 30, 12, 0, 0));
const empty = { deployedAt: null, retiredAt: null, orderId: null };

describe("isValidStatus", () => {
  it("accepts every enum value", () => {
    for (const s of SERIAL_STATUSES) expect(isValidStatus(s)).toBe(true);
  });

  it("rejects unknown strings and non-strings", () => {
    expect(isValidStatus("active")).toBe(false);
    expect(isValidStatus("")).toBe(false);
    expect(isValidStatus(undefined)).toBe(false);
    expect(isValidStatus(null)).toBe(false);
    expect(isValidStatus(42)).toBe(false);
  });
});

describe("applyStatusTransition", () => {
  it("→ deployed (fresh) stamps deployedAt", () => {
    const p = applyStatusTransition(empty, "deployed", NOW);
    expect(p).toEqual({ status: "deployed", deployedAt: NOW });
  });

  it("→ deployed (already deployed) does NOT re-stamp", () => {
    const p = applyStatusTransition({ ...empty, deployedAt: new Date("2026-01-01T00:00:00Z") }, "deployed", NOW);
    expect(p).toEqual({ status: "deployed" });
  });

  it("→ retired stamps retiredAt AND clears orderId", () => {
    const p = applyStatusTransition({ ...empty, orderId: "ord-123" }, "retired", NOW);
    expect(p).toEqual({ status: "retired", retiredAt: NOW, orderId: null });
  });

  it("→ retired keeps existing retiredAt if already set", () => {
    const existing = new Date("2025-12-01T00:00:00Z");
    const p = applyStatusTransition({ ...empty, retiredAt: existing }, "retired", NOW);
    expect(p).toEqual({ status: "retired", orderId: null });
  });

  it("→ out_of_service clears orderId but does NOT stamp retiredAt", () => {
    const p = applyStatusTransition({ ...empty, orderId: "ord-123" }, "out_of_service", NOW);
    expect(p).toEqual({ status: "out_of_service", orderId: null });
  });

  it("→ available wipes every lifecycle field", () => {
    const p = applyStatusTransition(
      { deployedAt: new Date(), retiredAt: new Date(), orderId: "ord-1" },
      "available",
      NOW,
    );
    expect(p).toEqual({ status: "available", deployedAt: null, retiredAt: null, orderId: null });
  });

  it("→ in_service is a no-op patch beyond the status itself", () => {
    const p = applyStatusTransition({ ...empty, deployedAt: new Date("2026-01-01T00:00:00Z"), orderId: "ord-1" }, "in_service", NOW);
    expect(p).toEqual({ status: "in_service" });
  });

  it("never mutates the input snapshot", () => {
    const snap = { deployedAt: new Date(), retiredAt: new Date(), orderId: "x" };
    const snapCopy = { ...snap };
    applyStatusTransition(snap, "available", NOW);
    expect(snap).toEqual(snapCopy);
  });
});
