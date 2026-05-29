import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { LOOKUP_HANDLERS, pickPayload } from "@/lib/lookups";
import { LOOKUP_DEFS } from "@/lib/lookup-defs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ type: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { type } = await params;
  const handler = LOOKUP_HANDLERS[type];
  if (!handler) return NextResponse.json({ error: "Unknown type" }, { status: 404 });

  const rows = await handler.list();
  return NextResponse.json({ rows, def: LOOKUP_DEFS[type] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ type: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "supplier") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { type } = await params;
  const handler = LOOKUP_HANDLERS[type];
  if (!handler) return NextResponse.json({ error: "Unknown type" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payload = pickPayload(type, body, "create");
  if ("error" in payload) {
    return NextResponse.json({ error: payload.error }, { status: 400 });
  }

  try {
    const row = await handler.create(payload);
    return NextResponse.json({ row }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create.";
    const conflict = /unique|duplicate/i.test(message);
    return NextResponse.json({ error: conflict ? "Key already exists." : message }, { status: conflict ? 409 : 500 });
  }
}
