import { NextResponse } from "next/server";
import type { SerialStatus } from "@prisma/client";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

const VALID_STATUSES: SerialStatus[] = ["available", "deployed", "in_service", "out_of_service", "retired"];

const LOC_MAX = 80;
const NOTES_MAX = 500;

// Update one serial — status / location / notes / linked order. Status
// transitions also stamp deployedAt/retiredAt so the lifecycle history reads
// cleanly without a full event table.
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(request, ["supplier"]);
  if ("error" in guard) return guard.error;
  const { id } = await ctx.params;

  const body = (await request.json().catch(() => null)) as {
    status?: SerialStatus; location?: string; notes?: string; orderId?: string | null;
  } | null;
  if (!body) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  // Runtime-validate any string fields before calling .slice on them — a TS
  // `as` cast doesn't gate non-string JSON bodies (number, object, array) and
  // would otherwise throw TypeError → 500.
  if (body.location !== undefined && typeof body.location !== "string") {
    return NextResponse.json({ error: "location must be a string." }, { status: 400 });
  }
  if (body.notes !== undefined && typeof body.notes !== "string") {
    return NextResponse.json({ error: "notes must be a string." }, { status: 400 });
  }
  if (body.orderId !== undefined && body.orderId !== null && typeof body.orderId !== "string") {
    return NextResponse.json({ error: "orderId must be a string or null." }, { status: 400 });
  }

  const existing = await db.serialItem.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // If linking to an order, confirm it exists rather than letting Prisma raise
  // a 500 on the FK constraint. Skipped when body.orderId is null (unassign).
  if (body.orderId) {
    const orderExists = await db.order.findUnique({
      where: { id: body.orderId },
      select: { id: true },
    });
    if (!orderExists) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }
  }

  const data: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    data.status = body.status;
    if (body.status === "deployed" && !existing.deployedAt) data.deployedAt = new Date();
    if (body.status === "retired" && !existing.retiredAt) data.retiredAt = new Date();
    if (body.status === "available") {
      data.deployedAt = null;
      data.retiredAt = null;
      data.orderId = null;
    }
    // A serial moved to retired or out_of_service is no longer with the
    // customer it was deployed to — clear the FK so order↔serial joins stay
    // honest and the par-level "deployed" count doesn't double-count.
    if (body.status === "retired" || body.status === "out_of_service") {
      data.orderId = null;
    }
  }
  if (body.location !== undefined) data.location = body.location.slice(0, LOC_MAX);
  if (body.notes !== undefined) data.notes = body.notes.slice(0, NOTES_MAX);
  // Explicit orderId in body wins (allows manual reassignment); status-driven
  // clearing above is the default when only status is sent.
  if (body.orderId !== undefined) data.orderId = body.orderId;

  const updated = await db.serialItem.update({ where: { id }, data });

  await logAudit(request, guard.user, {
    action: "Inventory serial updated",
    detail: `Serial ${updated.sn}: ${body.status ? `status→${updated.status}` : ""}${body.location !== undefined ? ` location→${updated.location}` : ""}${body.orderId !== undefined ? ` order→${updated.orderId ?? "—"}` : ""}`,
    ref: `SN-${updated.sn}`,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(request, ["supplier"]);
  if ("error" in guard) return guard.error;
  const { id } = await ctx.params;
  const existing = await db.serialItem.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });
  await db.serialItem.delete({ where: { id } });
  await logAudit(request, guard.user, {
    action: "Inventory serial removed",
    detail: `Serial ${existing.sn} removed`,
    ref: `SN-${existing.sn}`,
  });
  return NextResponse.json({ ok: true });
}
