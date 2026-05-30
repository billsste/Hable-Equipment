import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { equipStore } from "@/lib/equip-store";

const MAX_BULK = 200;
const SN_MAX = 60;
const LOC_MAX = 80;

function cleanSn(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, SN_MAX);
}

// List every serial across the warehouse, joined to its equipment for the
// inventory screen's filters. Supplier + dispatcher can read; supplier owns
// writes so par-level tracking has a single source of edits.
export async function GET(request: Request) {
  const guard = await requireRole(request, ["supplier", "dispatcher"]);
  if ("error" in guard) return guard.error;
  const rows = await db.serialItem.findMany({
    include: { equipment: { select: { id: true, name: true, category: true, abbreviation: true } } },
    orderBy: [{ updatedAt: "desc" }],
  });
  return NextResponse.json({
    serials: rows.map((s) => ({
      id: s.id,
      sn: s.sn,
      equipmentId: s.equipmentId,
      equipmentName: s.equipment.name,
      equipmentCategory: s.equipment.category,
      equipmentAbbreviation: s.equipment.abbreviation,
      status: s.status,
      location: s.location,
      notes: s.notes,
      orderId: s.orderId,
      deployedAt: s.deployedAt?.toISOString() ?? null,
      retiredAt: s.retiredAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
  });
}

// Add one serial OR bulk-add many by passing { sns: ["A1", "A2", ...] }.
// Bulk runs in a transaction; duplicates are reported back rather than failing
// the whole batch.
export async function POST(request: Request) {
  const guard = await requireRole(request, ["supplier"]);
  if ("error" in guard) return guard.error;
  const body = (await request.json().catch(() => null)) as {
    equipmentId?: string; sn?: string; sns?: string[]; location?: string;
  } | null;
  if (!body?.equipmentId) {
    return NextResponse.json({ error: "Equipment is required." }, { status: 400 });
  }
  const equipment = await db.equipment.findUnique({ where: { id: body.equipmentId } });
  if (!equipment) {
    return NextResponse.json({ error: "Equipment not found." }, { status: 404 });
  }
  const location = (body.location ?? "Warehouse").slice(0, LOC_MAX);

  const list = body.sns ? body.sns : body.sn ? [body.sn] : [];
  const clean = Array.from(new Set(list.map(cleanSn).filter(Boolean)));
  if (clean.length === 0) {
    return NextResponse.json({ error: "Provide one or more serial numbers." }, { status: 400 });
  }
  if (clean.length > MAX_BULK) {
    return NextResponse.json({ error: `Bulk add capped at ${MAX_BULK} serials per request.` }, { status: 400 });
  }

  const existing = await db.serialItem.findMany({
    where: { sn: { in: clean } },
    select: { sn: true },
  });
  const taken = new Set(existing.map((e) => e.sn));
  const toCreate = clean.filter((s) => !taken.has(s));

  if (toCreate.length > 0) {
    // skipDuplicates handles the race where two concurrent bulk-adds both
    // see the same `existing` snapshot — the second batch silently drops
    // rows that the first batch just inserted instead of throwing P2002 and
    // aborting the whole transaction.
    await db.serialItem.createMany({
      data: toCreate.map((sn) => ({
        equipmentId: equipment.id,
        sn,
        location,
      })),
      skipDuplicates: true,
    });
  }

  await equipStore.addAuditEntry({
    ts: new Date().toISOString(),
    who: guard.user.name,
    role: guard.user.role,
    action: "Inventory serial added",
    detail: `Added ${toCreate.length} serial(s) for ${equipment.name}${taken.size ? ` (${taken.size} duplicate skipped)` : ""}`,
    ref: `EQP-${equipment.id.slice(0, 8)}`,
  });

  return NextResponse.json({
    created: toCreate.length,
    skipped: Array.from(taken),
  });
}
