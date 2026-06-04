import { describe, expect, it, vi } from "vitest";
import {
  authAgingDays,
  dcUrgency,
  deriveStage,
  isBlockingStatus,
  isServiceCallType,
  isTerminalStatus,
  isValidAuthTransition,
  normalizeName,
  requiresReason,
} from "./order-types";

type StageInput = Parameters<typeof deriveStage>[0];

const baseStageInput: StageInput = {
  current: "INTAKE_OFF_RIP",
  workOrderType: "DELIVERY",
  status: "ACTIVE",
  primaryInsuranceKey: null,
  authStatus: "NOT_REQ",
  anyItemAssigned: false,
  allItemsCompleted: false,
  printedAt: null,
  acknowledgedAt: null,
  outForDeliveryAt: null,
  doorTaggedAt: null,
  cancelledAt: null,
};

describe("normalizeName", () => {
  it("title-cases a lowercase name", () => {
    expect(normalizeName("john smith")).toBe("John Smith");
  });
  it("collapses internal whitespace and trims", () => {
    expect(normalizeName("  mary    jane  ")).toBe("Mary Jane");
  });
  it("capitalizes after hyphens and apostrophes", () => {
    expect(normalizeName("o'brien-jones")).toBe("O'Brien-Jones");
  });
});

describe("deriveStage", () => {
  it("starts in INTAKE_OFF_RIP when nothing populated", () => {
    expect(deriveStage(baseStageInput)).toBe("INTAKE_OFF_RIP");
  });

  it("stays in INTAKE_VERIFICATION once verification has begun but is incomplete", () => {
    // Verification is now gated by primaryInsuranceKey + an auth state in
    // {NOT_REQ, APPROVED}. Missing the primary key keeps the order in the
    // verification stage even after it advanced past INTAKE_OFF_RIP.
    expect(
      deriveStage({
        ...baseStageInput,
        current: "INTAKE_VERIFICATION",
        authStatus: "REQUIRED",
      }),
    ).toBe("INTAKE_VERIFICATION");
  });

  it("reaches READY_TO_ASSIGN when DELIVERY verification clears", () => {
    expect(
      deriveStage({
        ...baseStageInput,
        primaryInsuranceKey: "MCARE",
        authStatus: "APPROVED",
      }),
    ).toBe("READY_TO_ASSIGN");
  });

  it("skips verification gates for non-DELIVERY work orders", () => {
    expect(
      deriveStage({ ...baseStageInput, workOrderType: "SERVICE_CALL" }),
    ).toBe("READY_TO_ASSIGN");
    expect(
      deriveStage({ ...baseStageInput, workOrderType: "PICK_UP" }),
    ).toBe("READY_TO_ASSIGN");
  });

  it("blocks READY_TO_ASSIGN when auth is mid-flight for DELIVERY", () => {
    // DELIVERY orders gate on primaryInsuranceKey + auth in {NOT_REQ,
    // APPROVED}. Auth in SUBMITTED holds the order in the verification stage.
    expect(
      deriveStage({
        ...baseStageInput,
        primaryInsuranceKey: "MCARE",
        authStatus: "SUBMITTED",
      }),
    ).toBe("INTAKE_OFF_RIP");
  });

  it("advances to ASSIGNED once printed with at least one driver-assigned item", () => {
    expect(
      deriveStage({
        ...baseStageInput,
        anyItemAssigned: true,
        printedAt: new Date(),
      }),
    ).toBe("ASSIGNED");
  });

  it("advances to ACKNOWLEDGED then OUT_FOR_DELIVERY by timestamp progression", () => {
    expect(
      deriveStage({ ...baseStageInput, acknowledgedAt: new Date() }),
    ).toBe("ACKNOWLEDGED");
    expect(
      deriveStage({
        ...baseStageInput,
        acknowledgedAt: new Date(),
        outForDeliveryAt: new Date(),
      }),
    ).toBe("OUT_FOR_DELIVERY");
  });

  it("lands on DOOR_TAG when door-tagged but not yet delivered", () => {
    expect(
      deriveStage({
        ...baseStageInput,
        acknowledgedAt: new Date(),
        doorTaggedAt: new Date(),
      }),
    ).toBe("DOOR_TAG");
  });

  it("treats outForDelivery as the source of truth over a stale doorTaggedAt (retry path)", () => {
    const earlier = new Date("2026-05-01");
    const later = new Date("2026-05-02");
    expect(
      deriveStage({
        ...baseStageInput,
        doorTaggedAt: earlier,
        outForDeliveryAt: later,
      }),
    ).toBe("OUT_FOR_DELIVERY");
  });

  it("collapses to DELIVERED when every item is completed", () => {
    expect(
      deriveStage({ ...baseStageInput, allItemsCompleted: true }),
    ).toBe("DELIVERED");
  });

  it("collapses to CANCELLED for terminal non-delivered statuses", () => {
    expect(deriveStage({ ...baseStageInput, status: "CANCELLED" })).toBe("CANCELLED");
    expect(deriveStage({ ...baseStageInput, status: "REJECTED" })).toBe("CANCELLED");
    expect(deriveStage({ ...baseStageInput, status: "WRITE_OFF" })).toBe("CANCELLED");
  });
});

describe("auth transitions", () => {
  it("allows the documented happy path", () => {
    expect(isValidAuthTransition("REQUIRED", "READY_TO_SUBMIT")).toBe(true);
    expect(isValidAuthTransition("READY_TO_SUBMIT", "SUBMITTED")).toBe(true);
    expect(isValidAuthTransition("SUBMITTED", "APPROVED")).toBe(true);
  });
  it("permits the new PENDING_SIGNATURE waypoint", () => {
    expect(isValidAuthTransition("REQUIRED", "PENDING_SIGNATURE")).toBe(true);
    expect(isValidAuthTransition("PENDING_SIGNATURE", "SUBMITTED")).toBe(true);
  });
  it("permits no-op transitions for idempotent saves", () => {
    expect(isValidAuthTransition("APPROVED", "APPROVED")).toBe(true);
  });
  it("rejects skipping straight from REQUIRED to APPROVED", () => {
    expect(isValidAuthTransition("REQUIRED", "APPROVED")).toBe(false);
  });
  it("permits DENIED reversal back into review for appeals", () => {
    expect(isValidAuthTransition("DENIED", "SUBMITTED")).toBe(true);
    expect(isValidAuthTransition("DENIED", "APPROVED")).toBe(true);
  });
});

describe("status predicates", () => {
  it("classifies in-flight vs terminal", () => {
    expect(isTerminalStatus("ACTIVE")).toBe(false);
    expect(isTerminalStatus("ON_HOLD")).toBe(false);
    expect(isTerminalStatus("CANCELLED")).toBe(true);
    expect(isTerminalStatus("DELIVERED")).toBe(true);
  });
  it("blocks dispatcher assignment for non-active, non-delivered states", () => {
    expect(isBlockingStatus("ACTIVE")).toBe(false);
    expect(isBlockingStatus("DELIVERED")).toBe(false);
    expect(isBlockingStatus("ON_HOLD")).toBe(true);
    expect(isBlockingStatus("WRITE_OFF")).toBe(true);
  });
  it("requires a reason for off-ramp statuses", () => {
    expect(requiresReason("ACTIVE")).toBe(false);
    expect(requiresReason("DELIVERED")).toBe(false);
    expect(requiresReason("CANCELLED")).toBe(true);
    expect(requiresReason("ON_HOLD")).toBe(true);
  });
});

describe("dcUrgency", () => {
  it("returns 'none' when no DC date is set", () => {
    expect(dcUrgency(null)).toBe("none");
  });
  it("classifies overdue / urgent / warn / ok windows", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-07T12:00:00Z"));
    try {
      expect(dcUrgency("2026-05-06")).toBe("overdue");
      expect(dcUrgency("2026-05-08")).toBe("urgent");
      expect(dcUrgency("2026-05-12")).toBe("warn");
      expect(dcUrgency("2026-06-01")).toBe("ok");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("authAgingDays", () => {
  it("only ages SUBMITTED and UNDER_REVIEW", () => {
    expect(authAgingDays("APPROVED", "2026-05-01T00:00:00Z")).toBeNull();
    expect(authAgingDays("SUBMITTED", null)).toBeNull();
  });
  it("counts whole days since submission", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T00:00:00Z"));
    try {
      expect(authAgingDays("SUBMITTED", "2026-05-01T00:00:00Z")).toBe(7);
      expect(authAgingDays("UNDER_REVIEW", "2026-05-05T00:00:00Z")).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("isServiceCallType", () => {
  it("treats every non-DELIVERY type as a service call", () => {
    expect(isServiceCallType("DELIVERY")).toBe(false);
    expect(isServiceCallType("SERVICE_CALL")).toBe(true);
    expect(isServiceCallType("PICK_UP")).toBe(true);
    expect(isServiceCallType("EQUIPMENT_MOVE")).toBe(true);
    expect(isServiceCallType("EXCHANGE")).toBe(true);
    expect(isServiceCallType("FACILITY_DELIVERY")).toBe(true);
  });
});
