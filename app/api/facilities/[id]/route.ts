import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { equipStore } from "@/lib/equip-store";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Role gate dropped per Brent 2026-06 — any authenticated user.

  const { id } = await params;
  const patch = await request.json();
  const facility = await equipStore.updateFacility(Number(id), patch);
  if (!facility) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await equipStore.addAuditEntry({
    ts: new Date().toISOString(),
    who: user.name,
    role: user.role,
    action: "Update Facility",
    detail: `Updated: ${JSON.stringify(patch)}`,
    ref: `FAC-${id}`,
  });

  return NextResponse.json({ facility });
}
