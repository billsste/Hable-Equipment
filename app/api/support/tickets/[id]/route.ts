import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

const STEE_SUPPORT_TICKETS_BASE_URL =
  process.env.STEE_SUPPORT_TICKETS_BASE_URL ??
  "https://admin.stee-suite.com/api/intake/tickets";
const EQUIP_DISPATCH_APP_KEY =
  process.env.STEE_SUPPORT_APP_KEY ?? "equip-dispatch";

function normalizeAttachmentFileParam(file: string) {
  const trimmed = String(file ?? "").trim();
  if (!trimmed) return trimmed;

  try {
    const parsed = new URL(trimmed, "http://localhost");
    const nestedFile = parsed.searchParams.get("file");
    if (nestedFile) {
      return nestedFile;
    }
  } catch {}

  return trimmed;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const url = `${STEE_SUPPORT_TICKETS_BASE_URL}/${id}?appKey=${encodeURIComponent(
      EQUIP_DISPATCH_APP_KEY
    )}&email=${encodeURIComponent(user.email)}&name=${encodeURIComponent(user.name)}`;

    const response = await fetch(url, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { error: data.error ?? "Failed to load support ticket" },
        { status: response.status || 500 }
      );
    }

    if (data.ticket?.photos && Array.isArray(data.ticket.photos)) {
      data.ticket.photos = data.ticket.photos.map(
        (photoUrl: string) =>
          `/api/support/tickets/${id}/attachments?file=${encodeURIComponent(
            normalizeAttachmentFileParam(photoUrl)
          )}`
      );
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Support server unavailable" }, { status: 503 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const url = `${STEE_SUPPORT_TICKETS_BASE_URL}/${id}?appKey=${encodeURIComponent(
      EQUIP_DISPATCH_APP_KEY
    )}&email=${encodeURIComponent(user.email)}&name=${encodeURIComponent(user.name)}`;

    const response = await fetch(url, {
      method: "DELETE",
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { error: data.error ?? "Failed to delete support ticket" },
        { status: response.status || 500 }
      );
    }

    return NextResponse.json({ ok: true, id: Number(id) });
  } catch {
    return NextResponse.json({ error: "Support server unavailable" }, { status: 503 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  try {
    const url = `${STEE_SUPPORT_TICKETS_BASE_URL}/${id}?appKey=${encodeURIComponent(
      EQUIP_DISPATCH_APP_KEY
    )}&email=${encodeURIComponent(user.email)}&name=${encodeURIComponent(user.name)}`;

    const response = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        action: body.action,
        appKey: EQUIP_DISPATCH_APP_KEY,
        email: user.email,
        name: user.name,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { error: data.error ?? "Failed to update support ticket" },
        { status: response.status || 500 }
      );
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Support server unavailable" }, { status: 503 });
  }
}
