import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { equipStore, type UserRole } from "@/lib/equip-store";
import { getSessionUser, validatePassword, LIMITS, clip } from "@/lib/auth";
import type { Prisma } from "@prisma/client";

const VALID_ROLES: UserRole[] = ["supplier", "driver", "csr"];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Brent 2026-06 follow-up: only admins (supplier) can manage user
  // accounts. Combined with the self-demotion guard below, that means an
  // admin can edit anyone except themselves out of admin.
  if (user.role !== "supplier") {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  const { id } = await params;
  const targetId = Number(id);
  const target = await db.user.findUnique({
    where: { id: targetId },
    select: { id: true, name: true, email: true, role: true, roles: true, active: true },
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: Prisma.UserUpdateInput = {};
  const changes: string[] = [];

  if ("name" in body) {
    const name = clip(body.name, LIMITS.name).trim();
    if (!name) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    if (name !== target.name) {
      data.name = name;
      changes.push(`name → ${name}`);
    }
  }

  if ("role" in body) {
    const role = body.role as UserRole;
    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: "Invalid primary role" }, { status: 400 });
    }
    if (target.id === user.id && role !== "supplier" && user.role === "supplier") {
      return NextResponse.json({ error: "Cannot demote your own admin role" }, { status: 403 });
    }
    if (role !== target.role) {
      data.role = role;
      changes.push(`role → ${role}`);
    }
  }

  if ("roles" in body) {
    if (!Array.isArray(body.roles)) {
      return NextResponse.json({ error: "roles must be an array" }, { status: 400 });
    }
    const primaryRole = (data.role as UserRole | undefined) ?? target.role;
    const merged = Array.from(new Set([
      primaryRole,
      ...body.roles.filter((r): r is string => typeof r === "string"),
    ]));
    if (merged.some((r) => !VALID_ROLES.includes(r as UserRole))) {
      return NextResponse.json({ error: "Invalid role in roles list" }, { status: 400 });
    }
    data.roles = merged;
    changes.push(`roles → [${merged.join(", ")}]`);
  }

  if ("password" in body && typeof body.password === "string" && body.password.length > 0) {
    const pwErrors = validatePassword(body.password);
    if (pwErrors.length > 0) {
      return NextResponse.json({ error: pwErrors.join("; ") }, { status: 400 });
    }
    data.password = body.password;
    changes.push("password reset");
  }

  if ("active" in body) {
    if (typeof body.active !== "boolean") {
      return NextResponse.json({ error: "active must be boolean" }, { status: 400 });
    }
    if (target.id === user.id && body.active === false) {
      return NextResponse.json({ error: "Cannot deactivate your own account" }, { status: 403 });
    }
    if (body.active !== target.active) {
      data.active = body.active;
      changes.push(body.active ? "reactivated" : "deactivated");
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await db.user.update({
    where: { id: targetId },
    data,
    select: { id: true, name: true, email: true, role: true, roles: true, active: true },
  });

  await equipStore.addAuditEntry({
    ts: new Date().toISOString(),
    who: user.name,
    role: user.role,
    action: "Update User",
    detail: `Updated ${target.name} (${target.email}): ${changes.join("; ")}`,
    ref: `USR-${targetId}`,
  });

  return NextResponse.json({ user: updated });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Admin-only — see the PATCH gate above.
  if (user.role !== "supplier") {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  const { id } = await params;
  const targetId = Number(id);
  const target = await db.user.findUnique({
    where: { id: targetId },
    select: { id: true, name: true, email: true },
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (target.id === user.id) {
    return NextResponse.json({ error: "Cannot deactivate your own account" }, { status: 403 });
  }

  await db.user.update({ where: { id: targetId }, data: { active: false } });

  await equipStore.addAuditEntry({
    ts: new Date().toISOString(),
    who: user.name,
    role: user.role,
    action: "Deactivate User",
    detail: `Deactivated ${target.name} (${target.email})`,
    ref: `USR-${targetId}`,
  });

  return NextResponse.json({ ok: true });
}
