import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

const STEE_SUPPORT_TICKETS_BASE_URL =
  process.env.STEE_SUPPORT_TICKETS_BASE_URL ??
  "https://admin.stee-suite.com/api/intake/tickets";
const EQUIP_DISPATCH_APP_KEY =
  process.env.STEE_SUPPORT_APP_KEY ?? "equip-dispatch";

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
    const url = `${STEE_SUPPORT_TICKETS_BASE_URL}/${id}/comments?appKey=${encodeURIComponent(
      EQUIP_DISPATCH_APP_KEY
    )}&email=${encodeURIComponent(user.email)}&name=${encodeURIComponent(user.name)}`;

    const response = await fetch(url, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { error: data.error ?? "Failed to load support comments" },
        { status: response.status || 500 }
      );
    }

    return NextResponse.json({ comments: data.comments ?? [] });
  } catch {
    return NextResponse.json({ error: "Support server unavailable" }, { status: 503 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const content = String(body.content ?? "").trim();

  if (!content) {
    return NextResponse.json({ error: "Comment content is required" }, { status: 400 });
  }

  try {
    const response = await fetch(`${STEE_SUPPORT_TICKETS_BASE_URL}/${id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appKey: EQUIP_DISPATCH_APP_KEY,
        email: user.email,
        name: user.name,
        content,
      }),
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { error: data.error ?? "Failed to add comment" },
        { status: response.status || 500 }
      );
    }

    return NextResponse.json({ comments: data.comments ?? [] }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Support server unavailable" }, { status: 503 });
  }
}
