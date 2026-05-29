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
  const { searchParams } = new URL(request.url);
  const file = String(searchParams.get("file") ?? "").trim();

  if (!file) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const upstream = `${STEE_SUPPORT_TICKETS_BASE_URL}/${id}/attachment?appKey=${encodeURIComponent(
    EQUIP_DISPATCH_APP_KEY
  )}&email=${encodeURIComponent(user.email)}&name=${encodeURIComponent(user.name)}&file=${encodeURIComponent(file)}`;

  const response = await fetch(upstream, { cache: "no-store" }).catch(() => null);
  if (!response || !response.ok) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  const contentLength = response.headers.get("content-length");
  const buffer = await response.arrayBuffer();

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      ...(contentLength ? { "Content-Length": contentLength } : {}),
      "Cache-Control": "private, max-age=300",
    },
  });
}
