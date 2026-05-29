import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, validatePassword } from "@/lib/auth";
import { equipStore, UserRole } from "@/lib/equip-store";

const VALID_ROLES: UserRole[] = ["supplier", "dispatcher", "csr"];

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "supplier") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db.user.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, role: true, roles: true, active: true },
  });
  return NextResponse.json({ users: rows });
}

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "supplier") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { name, email, password, role, roles } = await request.json();

    if (!name || !email || !password || !role) {
      return NextResponse.json({ error: "All fields required" }, { status: 400 });
    }

    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: "Invalid primary role" }, { status: 400 });
    }

    const rolesArr = Array.isArray(roles) && roles.length
      ? Array.from(new Set([role, ...roles.filter((r): r is string => typeof r === "string")]))
      : [role];
    if (rolesArr.some((r) => !VALID_ROLES.includes(r as UserRole))) {
      return NextResponse.json({ error: "Invalid role in roles list" }, { status: 400 });
    }

    const pwErrors = validatePassword(password);
    if (pwErrors.length > 0) {
      return NextResponse.json({ error: pwErrors.join("; ") }, { status: 400 });
    }

    const existing = await equipStore.getUserByEmail(email);
    if (existing) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }

    const newUser = await db.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        password,
        role,
        roles: rolesArr,
        active: true,
      },
      select: { id: true, name: true, email: true, role: true, roles: true, active: true },
    });

    await equipStore.addAuditEntry({
      ts: new Date().toISOString(),
      who: user.name,
      role: user.role,
      action: "Create User",
      detail: `Created user ${name} (${email}) with roles ${rolesArr.join(", ")}`,
      ref: `USR-${newUser.id}`,
    });

    return NextResponse.json({ user: newUser }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
