import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// One round-trip for every lookup the form/tracker needs.
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [
    csrs,
    dispatchers,
    facilities,
    whatsNeeded,
    insurance,
    companies,
    itemTypes,
    cancellationReasons,
    equipment,
  ] = await Promise.all([
    db.user.findMany({
      where: { roles: { has: "csr" }, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    // Driver list. The backfill renames role 'dispatcher' → 'driver' on
    // existing accounts, but the User.roles[] array isn't migrated, so a
    // user with role='driver' may still carry 'dispatcher' in roles[]. We
    // include either source so the picker stays populated through the
    // transition (and after, when commit B drops the legacy enum value).
    db.user.findMany({
      where: {
        active: true,
        OR: [
          { role: "driver" },
          { role: "dispatcher" },
          { roles: { has: "driver" } },
          { roles: { has: "dispatcher" } },
        ],
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.facility.findMany({
      where: { active: true },
      select: { id: true, name: true, initials: true, facilityType: true },
      orderBy: { name: "asc" },
    }),
    db.whatsNeededOption.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.insuranceOption.findMany({
      where: { active: true },
      orderBy: { label: "asc" },
    }),
    db.fulfillmentCompany.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.itemTypeOption.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.cancellationReason.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.equipment.findMany({
      where: { active: true },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  return NextResponse.json({
    csrs,
    dispatchers,
    facilities,
    whatsNeeded,
    insurance,
    companies,
    itemTypes,
    cancellationReasons,
    equipment,
  });
}
