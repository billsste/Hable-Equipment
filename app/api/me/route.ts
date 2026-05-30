import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  // mfaEnabled + backupCodesRemaining are folded into getSessionUser's select
  // — no second roundtrip needed on this hot endpoint.
  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mfaEnabled: user.mfaEnabled,
      backupCodesRemaining: user.backupCodesRemaining,
    },
  });
}
