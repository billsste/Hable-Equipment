import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import {
  ALLOWED_MIME_TYPES,
  MAX_ATTACHMENTS_PER_ORDER,
  MAX_ATTACHMENT_BYTES,
  isAllowedMime,
  safeFilename,
} from "@/lib/attachments";

// List all attachments for an order (metadata only — bytes are streamed by
// the [attachmentId] route on demand).
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(request, ["supplier", "csr", "dispatcher"]);
  if ("error" in guard) return guard.error;
  const { id } = await ctx.params;
  const rows = await db.orderAttachment.findMany({
    where: { orderId: id },
    select: {
      id: true, filename: true, mimeType: true, size: true,
      uploadedAt: true,
      uploadedBy: { select: { id: true, name: true } },
    },
    orderBy: { uploadedAt: "desc" },
  });
  return NextResponse.json({
    attachments: rows.map((a) => ({
      id: a.id,
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.size,
      uploadedAt: a.uploadedAt.toISOString(),
      uploadedByName: a.uploadedBy?.name ?? null,
      uploadedById: a.uploadedBy?.id ?? null,
    })),
  });
}

// Upload one file via multipart/form-data. The route caps file count + bytes
// and refuses anything outside the document/image allow-list.
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(request, ["supplier", "csr", "dispatcher"]);
  if ("error" in guard) return guard.error;
  const { id } = await ctx.params;

  const order = await db.order.findUnique({ where: { id }, select: { id: true, orderNumber: true } });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const existing = await db.orderAttachment.count({ where: { orderId: id } });
  if (existing >= MAX_ATTACHMENTS_PER_ORDER) {
    return NextResponse.json(
      { error: `Each order can hold up to ${MAX_ATTACHMENTS_PER_ORDER} attachments.` },
      { status: 400 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Could not read upload." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty." }, { status: 400 });
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json(
      { error: `File is too large. Max ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB.` },
      { status: 413 },
    );
  }
  if (!isAllowedMime(file.type)) {
    return NextResponse.json(
      { error: `File type not allowed. Accepted: ${ALLOWED_MIME_TYPES.join(", ")}.` },
      { status: 415 },
    );
  }

  const filename = safeFilename(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());

  const created = await db.orderAttachment.create({
    data: {
      orderId: id,
      filename,
      mimeType: file.type,
      size: buffer.length,
      data: buffer,
      uploadedById: guard.user.id,
    },
    select: {
      id: true, filename: true, mimeType: true, size: true, uploadedAt: true,
      uploadedBy: { select: { id: true, name: true } },
    },
  });

  await logAudit(request, guard.user, {
    action: "Order attachment uploaded",
    detail: `${filename} (${buffer.length} bytes, ${file.type}) attached to ${order.orderNumber}`,
    ref: order.orderNumber,
  });

  return NextResponse.json({
    attachment: {
      id: created.id,
      filename: created.filename,
      mimeType: created.mimeType,
      size: created.size,
      uploadedAt: created.uploadedAt.toISOString(),
      uploadedByName: created.uploadedBy?.name ?? null,
      uploadedById: created.uploadedBy?.id ?? null,
    },
  });
}
