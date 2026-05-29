import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { equipStore } from "@/lib/equip-store";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const facilities = await equipStore.getFacilities();
  return NextResponse.json({ facilities });
}

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "supplier") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { name, initials, active = true } = await request.json();
    if (!name || !initials) {
      return NextResponse.json({ error: "Name and initials required" }, { status: 400 });
    }
    const facility = await equipStore.addFacility({ name, initials, active, address: "", city: "", state: "MI", zip: "", phone: null, contact: null });

    await equipStore.addAuditEntry({
      ts: new Date().toISOString(),
      who: user.name,
      role: user.role,
      action: "Add Facility",
      detail: `Added facility: ${name} (${initials})`,
      ref: `FAC-${facility.id}`,
    });

    return NextResponse.json({ facility }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
