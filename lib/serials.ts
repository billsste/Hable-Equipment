import type { SerialStatus } from "@prisma/client";

// One source of truth for serial-status side effects. Encodes the lifecycle
// rules — what timestamps stamp when, what FKs clear, when prior stamps reset
// — as data, not as if/else chains inside a route handler.
//
// Every writer (PATCH route today; bulk importers, scanner webhooks, the
// order-fulfilled flow tomorrow) calls applyStatusTransition() to derive the
// data patch. If you find yourself reaching for `data.deployedAt = …` outside
// this file, that's a smell.

export const SERIAL_STATUSES: SerialStatus[] = [
  "available",
  "deployed",
  "in_service",
  "out_of_service",
  "retired",
];

export function isValidStatus(value: unknown): value is SerialStatus {
  return typeof value === "string" && (SERIAL_STATUSES as string[]).includes(value);
}

export type SerialSnapshot = {
  deployedAt: Date | null;
  retiredAt: Date | null;
  orderId: string | null;
};

export type SerialTransitionPatch = {
  status: SerialStatus;
  deployedAt?: Date | null;
  retiredAt?: Date | null;
  orderId?: string | null;
};

// Given the current (persisted) snapshot and the target status, return the
// minimum set of fields to write. The patch always carries `status`; other
// fields appear only when the transition meaningfully changes them. The
// function never mutates the input.
export function applyStatusTransition(
  current: SerialSnapshot,
  next: SerialStatus,
  now: Date = new Date(),
): SerialTransitionPatch {
  const patch: SerialTransitionPatch = { status: next };

  switch (next) {
    case "deployed":
      // First time hitting deployed gets a timestamp; subsequent re-deploys
      // (e.g. moved between orders) leave the existing one in place — the
      // explicit orderId change tells the rest of the story.
      if (!current.deployedAt) patch.deployedAt = now;
      break;

    case "retired":
      if (!current.retiredAt) patch.retiredAt = now;
      // Retired units leave the customer; severing the FK keeps the
      // serials↔orders join honest.
      patch.orderId = null;
      break;

    case "out_of_service":
      // Same lifecycle truth as retired: the physical unit is no longer
      // sitting with the order it was deployed against.
      patch.orderId = null;
      break;

    case "available":
      // Resetting to available means the unit is back in the warehouse and
      // unassigned — wipe every lifecycle stamp + FK so the row reads like a
      // fresh serial.
      patch.deployedAt = null;
      patch.retiredAt = null;
      patch.orderId = null;
      break;

    case "in_service":
      // Mid-service-call state. Doesn't change deployment stamps or order
      // assignment — the unit may still be ON its order during a service
      // visit.
      break;
  }

  return patch;
}
