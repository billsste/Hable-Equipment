import { NextResponse } from "next/server";
import type { SerialStatus } from "@prisma/client";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { equipStore } from "@/lib/equip-store";

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

  const existing = await db.serialItem.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

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
  }
  if (body.location !== undefined) data.location = body.location.slice(0, LOC_MAX);
  if (body.notes !== undefined) data.notes = body.notes.slice(0, NOTES_MAX);
  if (body.orderId !== undefined) data.orderId = body.orderId; // null = unassign

  const updated = await db.serialItem.update({ where: { id }, data });

  await equipStore.addAuditEntry({
    ts: new Date().toISOString(),
    who: guard.user.name,
    role: guard.user.role,
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
  await equipStore.addAuditEntry({
    ts: new Date().toISOString(),
    who: guard.user.name,
    role: guard.user.role,
    action: "Inventory serial removed",
    detail: `Serial ${existing.sn} removed`,
    ref: `SN-${existing.sn}`,
  });
  return NextResponse.json({ ok: true });
}
