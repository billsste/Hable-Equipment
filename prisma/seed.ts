import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { INITIAL_FACILITIES } from "../lib/facilities-data";
import {
  CSRS,
  DISPATCHERS,
  FACILITIES_63,
  WHATS_NEEDED,
  INSURANCE_LIST,
  COMPANIES,
  ITEM_TYPES,
  CANCELLATION_REASONS,
  EQUIPMENT,
} from "./seed-data";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required to seed.");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// Names that appear in BOTH CSRS and DISPATCHERS — they get role:"csr" but
// roles[]:["csr", "driver"] so they show up in both pickers. Matches the
// 2026-06 Action Medical staff list.
const MULTI_ROLE_OVERLAPS = new Set(["Brent Hable", "Gabe Green", "Rodney Guyton"]);

// Default password every newly-provisioned user gets. Forced change on first
// login is enforced by User.mustChangePassword + the (admin) layout redirect.
const DEFAULT_PASSWORD = "Equip2026!";

async function main() {
  console.log("Seeding EquipDispatch (revamp)...");

  // Wipe order data first so users that own orders can be deleted cleanly.
  await db.orderItem.deleteMany({});
  await db.orderEvent.deleteMany({});
  await db.order.deleteMany({});

  // Trim the user table down to the people the client provided + the Stee Suite admin.
  const desiredEmails = new Set<string>([
    "stee@equipdispatch.com",
    ...CSRS.map((u) => u.email),
    ...DISPATCHERS.map((u) => u.email),
  ]);
  await db.user.deleteMany({ where: { email: { notIn: [...desiredEmails] } } });

  // ── Stee Suite admin (the only seeded supplier-level account) ──
  await db.user.upsert({
    where: { email: "stee@equipdispatch.com" },
    update: {
      name: "Stee Suite",
      role: "supplier",
      roles: ["supplier", "csr", "driver"],
      active: true,
    },
    create: {
      name: "Stee Suite",
      email: "stee@equipdispatch.com",
      password: "Admin123!",
      role: "supplier",
      roles: ["supplier", "csr", "driver"],
      active: true,
    },
  });

  // ── CSR users ──
  // `mustChangePassword: true` only on CREATE — existing users keep whatever
  // they've already chosen. Pre-flagged accounts that have logged in once
  // already are not reflagged.
  for (const u of CSRS) {
    const isOverlap = MULTI_ROLE_OVERLAPS.has(u.name);
    await db.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: "csr", roles: isOverlap ? ["csr", "driver"] : ["csr"], active: true },
      create: {
        name: u.name,
        email: u.email,
        password: DEFAULT_PASSWORD,
        role: "csr",
        roles: isOverlap ? ["csr", "driver"] : ["csr"],
        active: true,
        mustChangePassword: true,
      },
    });
  }
  console.log(`Seeded ${CSRS.length} CSRs`);

  // ── Driver users ── Multi-role overlaps already seeded as CSRs above.
  for (const u of DISPATCHERS) {
    if (MULTI_ROLE_OVERLAPS.has(u.name)) continue;
    await db.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: "driver", roles: ["driver"], active: true },
      create: {
        name: u.name,
        email: u.email,
        password: DEFAULT_PASSWORD,
        role: "driver",
        roles: ["driver"],
        active: true,
        mustChangePassword: true,
      },
    });
  }
  console.log(`Seeded ${DISPATCHERS.length - MULTI_ROLE_OVERLAPS.size} driver-only users (+ ${MULTI_ROLE_OVERLAPS.size} multi-role)`);

  // ── Facilities (63+) ──
  // Preserve existing facility IDs by name, then add anything missing.
  const existingByName = new Map<string, number>();
  const existingFacilities = await db.facility.findMany();
  for (const f of existingFacilities) existingByName.set(f.name, f.id);

  const allNames = new Set<string>([
    ...INITIAL_FACILITIES.map((f) => f.name),
    ...FACILITIES_63,
  ]);

  for (const name of allNames) {
    if (existingByName.has(name)) continue;
    await db.facility.create({
      data: { name, initials: initialsFor(name), active: true, state: "MI" },
    });
  }
  const facilityCount = await db.facility.count();
  console.log(`Seeded facilities — total: ${facilityCount}`);

  // ── Lookup tables ──
  for (const w of WHATS_NEEDED) {
    await db.whatsNeededOption.upsert({
      where: { key: w.key },
      update: { label: w.label, color: w.color, sortOrder: w.sortOrder, active: true },
      create: w,
    });
  }
  for (const ins of INSURANCE_LIST) {
    await db.insuranceOption.upsert({
      where: { key: ins.key },
      update: {
        label: ins.label,
        coverageType: ins.coverageType ?? null,
        accepted: ins.accepted ?? true,
        active: true,
      },
      create: {
        key: ins.key,
        label: ins.label,
        coverageType: ins.coverageType ?? null,
        accepted: ins.accepted ?? true,
      },
    });
  }
  await db.fulfillmentCompany.deleteMany({
    where: { key: { notIn: COMPANIES.map((c) => c.key) } },
  });
  for (const c of COMPANIES) {
    await db.fulfillmentCompany.upsert({
      where: { key: c.key },
      update: { label: c.label, color: c.color ?? null, active: true },
      create: { key: c.key, label: c.label, color: c.color ?? null },
    });
  }
  for (const it of ITEM_TYPES) {
    await db.itemTypeOption.upsert({
      where: { key: it.key },
      update: { label: it.label, color: it.color, active: true },
      create: it,
    });
  }
  for (const r of CANCELLATION_REASONS) {
    await db.cancellationReason.upsert({
      where: { key: r.key },
      update: { label: r.label, active: true },
      create: r,
    });
  }
  console.log(
    `Seeded lookups: ${WHATS_NEEDED.length} What's Needed, ${INSURANCE_LIST.length} insurance, ${COMPANIES.length} companies, ${ITEM_TYPES.length} item types, ${CANCELLATION_REASONS.length} cancellation reasons`,
  );

  // ── Equipment catalog ──
  // Refresh from the par sheet so the picker matches the warehouse vocabulary 1:1.
  // (Orders/items/events were already wiped at the top of main, so OrderItem FKs are clear.)
  const desiredIds = new Set(EQUIPMENT.map((eq) => keyFor(eq.category, eq.name)));
  await db.equipment.deleteMany({ where: { id: { notIn: [...desiredIds] } } });
  let equipCount = 0;
  for (const eq of EQUIPMENT) {
    await db.equipment.upsert({
      where: { id: keyFor(eq.category, eq.name) },
      update: {
        category: eq.category,
        name: eq.name,
        abbreviation: eq.abbreviation ?? "",
        hcpcsCode: eq.hcpcsCode ?? "",
        kind: eq.kind ?? "item",
        active: true,
        sortOrder: equipCount,
        parLevel: eq.parLevel ?? null,
      },
      create: {
        id: keyFor(eq.category, eq.name),
        category: eq.category,
        name: eq.name,
        abbreviation: eq.abbreviation ?? "",
        hcpcsCode: eq.hcpcsCode ?? "",
        kind: eq.kind ?? "item",
        sortOrder: equipCount,
        parLevel: eq.parLevel ?? null,
      },
    });
    equipCount++;
  }
  console.log(`Seeded ${equipCount} equipment items`);

  // ── Sample orders so the tracker isn't empty for client demo ──
  // Skipped by default (clean prod). Set SEED_DEMO_ORDERS=1 for the full local
  // dataset, or SEED_DEMO_ORDER_LIMIT=N for a small curated demo set (prod).
  const demoLimit = process.env.SEED_DEMO_ORDER_LIMIT
    ? Math.max(0, Number.parseInt(process.env.SEED_DEMO_ORDER_LIMIT, 10) || 0)
    : undefined;
  if (process.env.SEED_DEMO_ORDERS === "1" || demoLimit) {
    await seedDemoOrders(demoLimit);
  } else {
    console.log("Skipping demo orders (set SEED_DEMO_ORDERS=1 or SEED_DEMO_ORDER_LIMIT=N).");
  }

  console.log("Done.");
}

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .join("")
    .slice(0, 5)
    .toUpperCase();
}

function keyFor(category: string, name: string): string {
  return `${category}::${name}`.toLowerCase().replace(/[^a-z0-9:]+/g, "-");
}

async function seedDemoOrders(limit?: number) {
  const csrs = await db.user.findMany({ where: { roles: { has: "csr" } } });
  const dispatchers = await db.user.findMany({ where: { roles: { has: "driver" } } });
  const facilities = await db.facility.findMany();
  const equipment = await db.equipment.findMany({ where: { active: true } });
  if (csrs.length === 0 || facilities.length === 0 || equipment.length === 0) return;

  const existingDemoCount = await db.order.count();
  if (existingDemoCount > 0) {
    console.log(`Skipping demo orders — ${existingDemoCount} already present.`);
    return;
  }

  const equipByAbbr = new Map<string, (typeof equipment)[number]>();
  for (const e of equipment) if (e.abbreviation) equipByAbbr.set(e.abbreviation, e);
  function lookupItem(abbr: string) {
    const e = equipByAbbr.get(abbr);
    if (!e) throw new Error(`Equipment not seeded: ${abbr}`);
    return e;
  }

  const year = new Date().getFullYear();
  let seq = 1;
  function nextOrderNumber() {
    return `ED-${year}-${String(seq++).padStart(6, "0")}`;
  }

  function daysFromNow(d: number): Date {
    return new Date(Date.now() + d * 24 * 60 * 60 * 1000);
  }

  type Stage =
    | "INTAKE_OFF_RIP"
    | "INTAKE_VERIFICATION"
    | "READY_TO_ASSIGN"
    | "ASSIGNED"
    | "ACKNOWLEDGED"
    | "OUT_FOR_DELIVERY"
    | "DELIVERED"
    | "CANCELLED";

  type Demo = {
    stage: Stage;
    patientFirst: string;
    patientLast: string;
    facilityIdx: number;
    csrIdx: number;
    whatsNeeded?: string[];
    primary?: string;
    secondary?: string;
    deductible?: "MET" | "NOT_MET" | "NA";
    coinsurancePct?: number;
    deductibleAmount?: number;
    planMemberId?: string;
    planName?: string;
    planType?: "HMO" | "HMO_POS" | "PPO";
    auth?: "NOT_REQ" | "REQUIRED" | "READY_TO_SUBMIT" | "SUBMITTED" | "APPROVED" | "DENIED";
    companies?: string[];
    dcDays?: number;
    dispatcherIdx?: number;
    items: string[];
    quantities?: number[];
    daysAgo: number;
    notes?: string;
    cancellationReason?: string;
  };

  const demos: Demo[] = [
    // ── Active intake (current week) ──
    { stage: "INTAKE_OFF_RIP", patientFirst: "Dorothy", patientLast: "Marshall", facilityIdx: 0, csrIdx: 0, whatsNeeded: ["DX", "FS"], items: [], daysAgo: 1, notes: "Off-rip — 5 fields only" },
    { stage: "INTAKE_VERIFICATION", patientFirst: "Harold", patientLast: "Stevens", facilityIdx: 1, csrIdx: 1, whatsNeeded: ["SIG"], primary: "MCARE", secondary: "BCBS", deductible: "MET", coinsurancePct: 20, deductibleAmount: 0, planMemberId: "10183281800", planName: "HAP Medicare Superior (HMO) Individual Plan 028", planType: "HMO", auth: "REQUIRED", dcDays: 5, items: ["WC18", "ELR"], daysAgo: 2 },
    { stage: "INTAKE_VERIFICATION", patientFirst: "Walter", patientLast: "Yang", facilityIdx: 7, csrIdx: 2, whatsNeeded: ["DX", "PEND_CB"], primary: "VA", auth: "REQUIRED", dcDays: 9, items: ["FE", "MAT300"], daysAgo: 3, notes: "Awaiting VA callback for auth." },
    { stage: "READY_TO_ASSIGN", patientFirst: "Evelyn", patientLast: "Carter", facilityIdx: 2, csrIdx: 2, primary: "PP", deductible: "NA", auth: "NOT_REQ", dcDays: 2, companies: ["ACTION"], items: ["BSC", "TTB"], daysAgo: 4 },
    { stage: "ASSIGNED", patientFirst: "Robert", patientLast: "Nguyen", facilityIdx: 3, csrIdx: 0, primary: "AETNA", deductible: "NOT_MET", coinsurancePct: 35, deductibleAmount: 1976.65, planMemberId: "20457913302", planName: "Aetna Medicare Choice (PPO) Plan 014", planType: "PPO", auth: "APPROVED", dcDays: 4, companies: ["CDME"], dispatcherIdx: 0, items: ["WC20", "ELR", "FR"], daysAgo: 5 },
    { stage: "ACKNOWLEDGED", patientFirst: "Margaret", patientLast: "Foster", facilityIdx: 4, csrIdx: 3, primary: "MCAID", deductible: "MET", auth: "APPROVED", dcDays: 1, companies: ["ACTION"], dispatcherIdx: 1, items: ["FE", "FULLRAIL"], daysAgo: 6 },
    { stage: "OUT_FOR_DELIVERY", patientFirst: "James", patientLast: "Park", facilityIdx: 5, csrIdx: 4, primary: "HUMANA_HMO", deductible: "MET", auth: "APPROVED", dcDays: 0, companies: ["SHAN"], dispatcherIdx: 2, items: ["MANLIFT", "SLINGL"], daysAgo: 7 },

    // ── Last 30 days, mixed categories ──
    { stage: "DELIVERED", patientFirst: "Linda", patientLast: "O'Brien", facilityIdx: 6, csrIdx: 1, primary: "BCBSM_AUTO", deductible: "MET", auth: "APPROVED", dcDays: -3, companies: ["CDME"], dispatcherIdx: 3, items: ["NEB"], daysAgo: 12 },
    { stage: "DELIVERED", patientFirst: "Carlos", patientLast: "Reyes", facilityIdx: 8, csrIdx: 2, primary: "MCARE", deductible: "MET", auth: "APPROVED", dcDays: -5, companies: ["ACTION"], dispatcherIdx: 0, items: ["WC18", "WC20"], daysAgo: 14 },
    { stage: "DELIVERED", patientFirst: "Patricia", patientLast: "Adams", facilityIdx: 9, csrIdx: 3, primary: "MCAID", deductible: "MET", auth: "APPROVED", dcDays: -7, companies: ["CARE_ONE"], dispatcherIdx: 1, items: ["FE", "MAT300", "HALFRAIL"], daysAgo: 16 },
    { stage: "DELIVERED", patientFirst: "Frank", patientLast: "Holloway", facilityIdx: 10, csrIdx: 0, primary: "PRIORITY", deductible: "NOT_MET", auth: "APPROVED", dcDays: -8, companies: ["SHAN"], dispatcherIdx: 2, items: ["BSC", "SCBACK"], daysAgo: 18 },
    { stage: "DELIVERED", patientFirst: "Helen", patientLast: "Brooks", facilityIdx: 11, csrIdx: 1, primary: "MCARE", deductible: "MET", auth: "APPROVED", dcDays: -10, companies: ["ACTION"], dispatcherIdx: 4, items: ["ELECLIFT", "SLINGM"], daysAgo: 20 },
    { stage: "CANCELLED", patientFirst: "Gary", patientLast: "Wilkins", facilityIdx: 12, csrIdx: 2, primary: "AETNA", auth: "DENIED", dcDays: -2, items: ["WC22"], daysAgo: 22, notes: "Insurance denied" },
    { stage: "DELIVERED", patientFirst: "Ruth", patientLast: "Castillo", facilityIdx: 13, csrIdx: 3, primary: "MCARE", deductible: "MET", auth: "APPROVED", dcDays: -12, companies: ["CDME"], dispatcherIdx: 0, items: ["2WW", "ROLL"], daysAgo: 24 },
    { stage: "DELIVERED", patientFirst: "Daniel", patientLast: "Ferguson", facilityIdx: 14, csrIdx: 4, primary: "UHC", deductible: "MET", auth: "APPROVED", dcDays: -15, companies: ["ACTION"], dispatcherIdx: 1, items: ["FE", "APP"], daysAgo: 26 },
    { stage: "DELIVERED", patientFirst: "Sandra", patientLast: "Knight", facilityIdx: 15, csrIdx: 0, primary: "MCAID", deductible: "MET", auth: "APPROVED", dcDays: -18, companies: ["CARE_ONE"], dispatcherIdx: 2, items: ["DAC", "TTB"], daysAgo: 28 },

    // ── 30-60 days ago ──
    { stage: "DELIVERED", patientFirst: "Edward", patientLast: "Powell", facilityIdx: 0, csrIdx: 1, primary: "MCARE", deductible: "MET", auth: "APPROVED", dcDays: -32, companies: ["ACTION"], dispatcherIdx: 3, items: ["WC16", "ELR"], daysAgo: 34 },
    { stage: "DELIVERED", patientFirst: "Jean", patientLast: "Patterson", facilityIdx: 2, csrIdx: 2, primary: "BCBS", deductible: "MET", auth: "APPROVED", dcDays: -36, companies: ["SHAN"], dispatcherIdx: 4, items: ["BARIBED", "MAT42"], daysAgo: 38 },
    { stage: "DELIVERED", patientFirst: "Charles", patientLast: "Bryant", facilityIdx: 3, csrIdx: 3, primary: "MCARE", deductible: "MET", auth: "APPROVED", dcDays: -40, companies: ["CDME"], dispatcherIdx: 0, items: ["MANLIFT", "SLINGL"], daysAgo: 42 },
    { stage: "DELIVERED", patientFirst: "Joyce", patientLast: "Murphy", facilityIdx: 5, csrIdx: 4, primary: "PRIORITY", deductible: "MET", auth: "APPROVED", dcDays: -44, companies: ["ACTION"], dispatcherIdx: 1, items: ["NEB"], daysAgo: 46 },
    { stage: "DELIVERED", patientFirst: "Kenneth", patientLast: "Sanders", facilityIdx: 6, csrIdx: 0, primary: "MCARE", deductible: "MET", auth: "APPROVED", dcDays: -48, companies: ["CARE_ONE"], dispatcherIdx: 2, items: ["WC20", "BSC"], daysAgo: 50 },
    { stage: "CANCELLED", patientFirst: "Brenda", patientLast: "Lambert", facilityIdx: 8, csrIdx: 1, primary: "MCAID", auth: "DENIED", items: ["FE"], daysAgo: 52 },
    { stage: "DELIVERED", patientFirst: "Steven", patientLast: "Reed", facilityIdx: 10, csrIdx: 2, primary: "HUMANA", deductible: "MET", auth: "APPROVED", dcDays: -54, companies: ["SHAN"], dispatcherIdx: 3, items: ["ELECSTS", "STSSLM"], daysAgo: 56 },

    // ── 60-90 days ago ──
    { stage: "DELIVERED", patientFirst: "Carol", patientLast: "Watkins", facilityIdx: 4, csrIdx: 3, primary: "MCARE", deductible: "MET", auth: "APPROVED", dcDays: -62, companies: ["ACTION"], dispatcherIdx: 4, items: ["WC18", "FR"], daysAgo: 64 },
    { stage: "DELIVERED", patientFirst: "Donald", patientLast: "Hicks", facilityIdx: 9, csrIdx: 4, primary: "BCBS", deductible: "MET", auth: "APPROVED", dcDays: -68, companies: ["CDME"], dispatcherIdx: 0, items: ["FE", "MAT300"], daysAgo: 70 },
    { stage: "DELIVERED", patientFirst: "Nancy", patientLast: "Burns", facilityIdx: 11, csrIdx: 0, primary: "AETNA", deductible: "MET", auth: "APPROVED", dcDays: -72, companies: ["ACTION"], dispatcherIdx: 1, items: ["BSC", "SCBACK", "TTB"], daysAgo: 74 },
    { stage: "DELIVERED", patientFirst: "George", patientLast: "Sullivan", facilityIdx: 13, csrIdx: 1, primary: "MCARE", deductible: "MET", auth: "APPROVED", dcDays: -78, companies: ["SHAN"], dispatcherIdx: 2, items: ["WC22", "HWC22"], daysAgo: 80 },
    { stage: "DELIVERED", patientFirst: "Susan", patientLast: "Fields", facilityIdx: 15, csrIdx: 2, primary: "MCAID", deductible: "MET", auth: "APPROVED", dcDays: -82, companies: ["CARE_ONE"], dispatcherIdx: 3, items: ["MANLIFT", "SLINGL", "SLINGXL"], daysAgo: 84 },
    { stage: "DELIVERED", patientFirst: "Paul", patientLast: "Walters", facilityIdx: 1, csrIdx: 3, primary: "MCARE", deductible: "MET", auth: "APPROVED", dcDays: -86, companies: ["ACTION"], dispatcherIdx: 4, items: ["NEB", "O2BAG"], daysAgo: 88 },

    // ── 90-120 days ago ──
    { stage: "DELIVERED", patientFirst: "Diane", patientLast: "Mason", facilityIdx: 7, csrIdx: 4, primary: "MCARE", deductible: "MET", auth: "APPROVED", dcDays: -94, companies: ["CDME"], dispatcherIdx: 0, items: ["WC20", "ELR"], daysAgo: 96 },
    { stage: "DELIVERED", patientFirst: "Joseph", patientLast: "Hardy", facilityIdx: 12, csrIdx: 0, primary: "BCN", deductible: "MET", auth: "APPROVED", dcDays: -100, companies: ["ACTION"], dispatcherIdx: 1, items: ["FE", "HALFRAIL"], daysAgo: 102 },
    { stage: "DELIVERED", patientFirst: "Betty", patientLast: "Andrews", facilityIdx: 14, csrIdx: 1, primary: "MCAID", deductible: "MET", auth: "APPROVED", dcDays: -106, companies: ["CARE_ONE"], dispatcherIdx: 2, items: ["BARIC", "BARIDAC"], daysAgo: 108 },
    { stage: "CANCELLED", patientFirst: "Ronald", patientLast: "Ferguson", facilityIdx: 0, csrIdx: 2, primary: "PP", auth: "NOT_REQ", items: ["WC18"], daysAgo: 112, notes: "Patient deceased" },
    { stage: "DELIVERED", patientFirst: "Dorothy", patientLast: "Rivera", facilityIdx: 3, csrIdx: 3, primary: "MCARE", deductible: "MET", auth: "APPROVED", dcDays: -114, companies: ["SHAN"], dispatcherIdx: 3, items: ["ELECLIFT", "SLINGM"], daysAgo: 116 },
  ];

  // Full procedural backfill (12 months × category coverage) only runs when no
  // explicit limit is given. With a limit (prod demo data) we use just the
  // curated lifecycle samples above and slice to the requested count.
  if (limit === undefined) {
  const FIRST_NAMES = [
    "John", "Mary", "Robert", "Patricia", "Michael", "Jennifer", "William", "Linda",
    "David", "Elizabeth", "Richard", "Barbara", "Joseph", "Susan", "Thomas", "Jessica",
    "Charles", "Sarah", "Christopher", "Karen", "Daniel", "Nancy", "Matthew", "Lisa",
    "Anthony", "Betty", "Mark", "Helen", "Donald", "Sandra", "Steven", "Donna",
    "Andrew", "Carol", "Joshua", "Ruth", "Kenneth", "Sharon", "Kevin", "Michelle",
    "Brian", "Laura", "Edward", "Sarah", "Ronald", "Kimberly", "Timothy", "Deborah",
  ];
  const LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
    "Taylor", "Moore", "Jackson", "Lee", "Perez", "Thompson", "White", "Harris",
    "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker", "Young", "Allen",
    "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores", "Green", "Adams",
    "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell", "Carter", "Roberts",
  ];
  const BUNDLES_BY_CATEGORY: Record<string, string[][]> = {
    Wheelchair: [
      ["WC16"], ["WC18"], ["WC18", "ELR"], ["WC18", "FR"],
      ["WC20"], ["WC20", "ELR"], ["WC20", "FR"], ["WC22"], ["WC22", "HWC22"],
      ["WC24"], ["WC26"], ["HWC16"], ["HWC18"], ["HWC18", "ELR"],
      ["HWC20"], ["HWC24"], ["TC17"], ["TC19"],
      ["WC18", "CSH18X16"], ["WC20", "CSH20X18"],
    ],
    Recliner: [
      ["REC16"], ["REC18"], ["REC20"], ["REC18", "REC16"],
    ],
    "Walker/Mobility": [
      ["2WW"], ["ROLL"], ["BARI2WW"], ["BARIROLL"], ["HEMIW"],
      ["JRW"], ["QCSB"], ["QCLB"], ["2WW", "QCLB"],
    ],
    Bed: [
      ["FE"], ["FE", "MAT300"], ["FE", "HALFRAIL"],
      ["FE", "FULLRAIL", "MAT300"], ["FE", "APP"],
      ["BARIBED", "MAT42"], ["FE", "MAT300", "HALFRAIL"],
      ["FE", "MAT300", "FULLRAIL"], ["BARIBED", "MAT42", "APP"],
    ],
    "Bath/Commode": [
      ["BSC"], ["BSC", "TTB"], ["DAC"], ["BARIC"], ["BARIDAC"],
      ["SCBACK"], ["TTB", "RTSELONG"], ["TTB"],
      ["DAC", "SCBACK"], ["BSC", "RTSRND"], ["RTSRND"], ["RTSELONG"],
    ],
    Respiratory: [
      ["NEB"], ["NEB", "O2BAG"], ["O2BAG"],
    ],
    Lift: [
      ["MANLIFT", "SLINGL"], ["ELECLIFT", "SLINGM"], ["MANSTS"],
      ["ELECSTS", "STSSLM"], ["MANLIFT", "SLINGXL"],
      ["ELECLIFT", "SLINGL"], ["ELECSTS", "STSSLL"],
      ["MANLIFT", "SLINGXXL"], ["ELECLIFT", "SLINGM", "BSSTD"],
    ],
  };
  const CATEGORIES = Object.keys(BUNDLES_BY_CATEGORY);

  const INSURANCE_POOL = [
    "MCARE", "MCAID", "BCBS", "AETNA", "AETNA_BETTERHEALTH", "HUMANA", "PRIORITY", "UHC", "UHC_PPO", "VA", "PP",
    "BCN", "MERIDIAN", "MOLINA", "HUMANA_HMO", "BCN_ADVANTAGE", "BCBSM_AUTO",
    "MCLAREN", "WELLCARE", "WELLCARE_HMO", "CIGNA", "TRICARE", "ALLIANCE_HEALTH",
    "STATE_FARM_AUTO", "PROGRESSIVE_AUTO", "AAA_AUTO", "FARM_BUREAU_AUTO",
    "MEMIC_WC", "ACCIDENT_FUND_WC", "TRAVELERS_WC",
  ];
  const SECONDARY_POOL = [
    "BCBS", "BCN", "MCAID", "PP", "AETNA", "MERIDIAN", "MOLINA",
  ];
  const COMPANY_POOL = ["ACTION", "CDME", "SHAN", "CARE_ONE", "ADVANCED_MEDICAL"];
  const PLAN_NAME_POOL = [
    "HAP Medicare Superior (HMO) Individual Plan 028",
    "HAP Medicare Primary (HMO) Plan 011",
    "BCN Advantage HMO-POS Classic Plan 003",
    "Aetna Medicare Choice (PPO) Plan 014",
    "Priority Health Medicare PPO Plan 042",
    "Humana Gold Plus (HMO) Plan 019",
    "UnitedHealthcare Dual Complete (HMO) Plan 007",
    "Molina Medicare Complete Care (HMO) Plan 022",
  ];
  const CANCEL_REASONS = [
    "PATIENT_DECLINED", "DUPLICATE", "FACILITY_CANCELLED",
    "INS_DENIED", "PATIENT_DECEASED", "WRONG_EQUIPMENT",
    "TRANSFERRED_OUT", "OTHER",
  ];

  let prng = 0x9e3779b9;
  const rand = () => {
    prng = (prng + 0x6d2b79f5) | 0;
    let t = prng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  const maybe = (p: number) => rand() < p;

  let facilityCursor = 0;
  const nextFacilityIdx = () => {
    const i = facilityCursor % facilities.length;
    facilityCursor++;
    return i;
  };

  for (let monthsBack = 0; monthsBack < 12; monthsBack++) {
    // Guarantee category coverage every month: 3-5 orders per category.
    for (const category of CATEGORIES) {
      const perCategory = 3 + Math.floor(rand() * 3);
      for (let n = 0; n < perCategory; n++) {
        const daysAgo = monthsBack * 30 + Math.floor(rand() * 28) + 1;
        const items = pick(BUNDLES_BY_CATEGORY[category]);
        const quantities = items.map(() => (maybe(0.85) ? 1 : 2));
        let stage: Stage;
        if (monthsBack === 0) {
          stage = pick(["INTAKE_VERIFICATION", "READY_TO_ASSIGN", "ASSIGNED", "ACKNOWLEDGED", "OUT_FOR_DELIVERY", "DELIVERED", "DELIVERED", "DELIVERED", "CANCELLED"] as Stage[]);
        } else {
          const r = rand();
          stage = r < 0.82 ? "DELIVERED" : r < 0.93 ? "CANCELLED" : "OUT_FOR_DELIVERY";
        }
        const auth: Demo["auth"] = stage === "CANCELLED" && maybe(0.45) ? "DENIED" : maybe(0.1) ? "NOT_REQ" : "APPROVED";
        const needsDispatcher = stage !== "INTAKE_OFF_RIP" && stage !== "INTAKE_VERIFICATION" && stage !== "READY_TO_ASSIGN";
        const needsCompany = stage !== "INTAKE_OFF_RIP" && stage !== "INTAKE_VERIFICATION";
        const companyCount = needsCompany ? (maybe(0.18) ? 2 : 1) : 0;
        const companies: string[] = [];
        while (companies.length < companyCount) {
          const c = pick(COMPANY_POOL);
          if (!companies.includes(c)) companies.push(c);
        }
        const cancellationReason = stage === "CANCELLED"
          ? auth === "DENIED" ? "INS_DENIED" : pick(CANCEL_REASONS)
          : undefined;
        // Patient cost-share: most have deductible met ($0 owed); the rest carry a
        // remaining balance. Coinsurance is typically a 20% Medicare split.
        const dedMet = maybe(0.7);
        const deductibleAmount = dedMet ? 0 : Math.round(rand() * 330000) / 100; // up to ~$3,300
        // Plan details (column D/E/F): not every order has them recorded yet.
        const planType = maybe(0.8) ? pick(["HMO", "HMO", "HMO_POS", "PPO"] as const) : undefined;
        const planMemberId = planType
          ? String(10000000000 + Math.floor(rand() * 8999999999))
          : undefined;
        const planName = planType ? pick(PLAN_NAME_POOL) : undefined;
        demos.push({
          stage,
          patientFirst: pick(FIRST_NAMES),
          patientLast: pick(LAST_NAMES),
          facilityIdx: nextFacilityIdx(),
          csrIdx: Math.floor(rand() * csrs.length),
          dispatcherIdx: needsDispatcher && dispatchers.length > 0 ? Math.floor(rand() * dispatchers.length) : undefined,
          primary: pick(INSURANCE_POOL),
          secondary: maybe(0.25) ? pick(SECONDARY_POOL) : undefined,
          deductible: dedMet ? "MET" : "NOT_MET",
          coinsurancePct: pick([20, 20, 20, 35, 0]),
          deductibleAmount,
          planMemberId,
          planName,
          planType,
          auth,
          companies,
          dcDays: -daysAgo + Math.floor(rand() * 10),
          items,
          quantities,
          daysAgo,
          cancellationReason,
        });
      }
    }
  }
  }

  const seedSet = limit === undefined ? demos : demos.slice(0, limit);
  await Promise.all(
    seedSet.map((d) => {
      const stage = d.stage;
      const orderNumber = nextOrderNumber();
      const csr = csrs[d.csrIdx % csrs.length];
      const facility = facilities[d.facilityIdx % facilities.length];
      const dispatcher = d.dispatcherIdx !== undefined ? dispatchers[d.dispatcherIdx % dispatchers.length] : null;

      const createdAt = daysFromNow(-d.daysAgo);
      const offset = (h: number) => new Date(createdAt.getTime() + h * 60 * 60 * 1000);
      const printedAt = ["ASSIGNED", "ACKNOWLEDGED", "OUT_FOR_DELIVERY", "DELIVERED"].includes(stage) ? offset(4) : null;
      const acknowledgedAt = ["ACKNOWLEDGED", "OUT_FOR_DELIVERY", "DELIVERED"].includes(stage) ? offset(8) : null;
      const outForDeliveryAt = ["OUT_FOR_DELIVERY", "DELIVERED"].includes(stage) ? offset(14) : null;
      const deliveredAt = stage === "DELIVERED" ? offset(24) : null;
      const cancelledAt = stage === "CANCELLED" ? offset(12) : null;

      const status =
        stage === "DELIVERED" ? "DELIVERED" : stage === "CANCELLED" ? "CANCELLED" : "ACTIVE";

      return db.order.create({
        data: {
          orderNumber,
          stage,
          status,
          createdAt,
          csrId: csr.id,
          createdById: csr.id,
          patientFirst: d.patientFirst,
          patientLast: d.patientLast,
          facilityId: facility.id,
          whatsNeeded: d.whatsNeeded ?? [],
          primaryInsuranceKey: d.primary ?? null,
          secondaryInsuranceKey: d.secondary ?? null,
          deductibleStatus: d.deductible ?? null,
          coinsurancePct: d.coinsurancePct ?? null,
          deductibleAmount: d.deductibleAmount ?? null,
          // Brent 2026-06 commit B: planMemberId / planName / planType /
          // dispatcherId / deliveredAt dropped from Order. Per-item driver
          // and completedAt are set on items[] below.
          authStatus: d.auth ?? "NOT_REQ",
          authRequiredAt: d.auth === "REQUIRED" || d.auth === "APPROVED" ? createdAt : null,
          authApprovedAt: d.auth === "APPROVED" ? createdAt : null,
          fulfillmentCompanies: d.companies ?? [],
          dischargeDate: d.dcDays !== undefined ? daysFromNow(d.dcDays) : null,
          printedAt,
          acknowledgedAt,
          outForDeliveryAt,
          cancelledAt,
          cancellationReason: d.cancellationReason ?? null,
          notes: d.notes ?? "",
          items: {
            create: d.items.map((abbr, i) => ({
              equipmentId: lookupItem(abbr).id,
              quantity: d.quantities?.[i] ?? 1,
            })),
          },
          history: {
            create: [{ who: csr.name, action: "Order created" }],
          },
        },
      });
    }),
  );
  console.log(`Seeded ${seedSet.length} demo orders across the lifecycle`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
