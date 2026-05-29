import { NextResponse } from "next/server";
import { SESSION_COOKIE, getSessionUser } from "@/lib/auth";
import { equipStore } from "@/lib/equip-store";

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (user) {
    await equipStore.addAuditEntry({
      ts: new Date().toISOString(),
      who: user.name,
      role: user.role,
      action: "Logout",
      detail: "User logged out",
      ref: `USR-${user.id}`,
    });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 0,
    path: "/",
  });
  return response;
}
