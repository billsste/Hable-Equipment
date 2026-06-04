import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { equipStore } from "@/lib/equip-store";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Role gate dropped per Brent 2026-06 — any authenticated user can view
  // the audit log. Sensitive entries (passwords, MFA) never include raw
  // values so PHI exposure is contained.
  const entries = await equipStore.getAuditLog();
  return NextResponse.json({ entries });
}
