import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { LOOKUP_HANDLERS, pickPayload } from "@/lib/lookups";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { type, id } = await params;
  const handler = LOOKUP_HANDLERS[type];
  if (!handler) return NextResponse.json({ error: "Unknown type" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payload = pickPayload(type, body, "update");
  if ("error" in payload) {
    return NextResponse.json({ error: payload.error }, { status: 400 });
  }

  const row = await handler.update(id, payload);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ row });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { type, id } = await params;
  const handler = LOOKUP_HANDLERS[type];
  if (!handler) return NextResponse.json({ error: "Unknown type" }, { status: 404 });

  const ok = await handler.remove(id);
  if (!ok) {
    return NextResponse.json(
      { error: "Could not delete — this record may still be referenced by orders. Try disabling instead." },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true });
}
