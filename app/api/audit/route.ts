import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { equipStore } from "@/lib/equip-store";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "supplier") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const entries = await equipStore.getAuditLog();
  return NextResponse.json({ entries });
}
