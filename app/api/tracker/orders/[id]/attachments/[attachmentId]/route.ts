import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

// Stream a single attachment's bytes back to the caller. Returns the original
// filename via Content-Disposition so the download dialog uses the right
// name and extension.
export async function GET(request: Request, ctx: { params: Promise<{ id: string; attachmentId: string }> }) {
  const guard = await requireRole(request, ["supplier", "csr", "driver"]);
  if ("error" in guard) return guard.error;
  const { id, attachmentId } = await ctx.params;

  const row = await db.orderAttachment.findFirst({
    where: { id: attachmentId, orderId: id },
  });
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Use a Uint8Array view so Next/Edge serializes the bytes as-is. The
  // attachment disposition (vs. inline) keeps the browser from rendering
  // PDFs in-tab — wanted here because the document may carry PHI and the
  // user should consciously open/save it.
  return new Response(new Uint8Array(row.data), {
    status: 200,
    headers: {
      "Content-Type": row.mimeType,
      "Content-Length": row.size.toString(),
      "Content-Disposition": `attachment; filename="${row.filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string; attachmentId: string }> }) {
  const guard = await requireRole(request, ["supplier", "csr", "driver"]);
  if ("error" in guard) return guard.error;
  const { id, attachmentId } = await ctx.params;
  // Skip the bytea `data` column — we only need filename/orderNumber for the
  // audit entry. Pulling the full attachment just to delete it could move
  // 10 MB Postgres→Node for nothing.
  const row = await db.orderAttachment.findFirst({
    where: { id: attachmentId, orderId: id },
    select: { id: true, filename: true, order: { select: { orderNumber: true } } },
  });
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
  await db.orderAttachment.delete({ where: { id: row.id } });
  await logAudit(request, guard.user, {
    action: "Order attachment removed",
    detail: `${row.filename} removed from ${row.order.orderNumber}`,
    ref: row.order.orderNumber,
  });
  return NextResponse.json({ ok: true });
}
