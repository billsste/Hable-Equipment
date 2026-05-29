# EquipDispatch — Reference

HIPAA-aware DME (Durable Medical Equipment) order dispatch system for a Michigan supplier. Tracks orders from referral call to facility delivery across ~63 skilled nursing facilities.

- **Repo path**: `/Users/stevengbills/Desktop/Claude/equip-dispatch`
- **Local URL**: `http://localhost:3000`
- **Last revamp**: 2026-05 — Order Tracker rebuilt around `OrderStage` (derived) + `OutcomeStatus` (declared), Ticket model retained for legacy compatibility only

---

## Stack

| Layer | Tool |
|---|---|
| Framework | Next.js 16 App Router (Turbopack), TypeScript, standalone output |
| Styling | Tailwind CSS v4 — tokens in `app/globals.css` |
| Icons | Lucide React |
| Charts | Recharts (used in `/reporting`) |
| Database | Local PostgreSQL via Prisma 7 + `@prisma/adapter-pg` |
| Auth | HttpOnly `ed_session` cookie, 8h TTL — see `lib/auth.ts` |

### Local DB

- DB name: `equip_dispatch`
- Connection: `postgresql://stevengbills@localhost:5432/equip_dispatch`
- Schema: `prisma/schema.prisma`
- Seed: `npm run db:seed` (idempotent — safe to re-run)
- Apply schema changes: `npx prisma db push --accept-data-loss && npx prisma generate`

---

## Local setup

```bash
npm install
npx prisma db push --accept-data-loss
npx prisma generate
npm run db:seed
npm run dev          # http://localhost:3000
```

After schema enum changes, the dev server's Prisma engine is cached in memory — kill and restart `next dev` so the new enum value is picked up.

---

## Roles

| Role | Scope |
|---|---|
| `supplier` | Full admin — all surfaces |
| `csr` | Intake (Stage 1) + Verification (Stage 2) |
| `dispatcher` | Fulfillment & Dispatch (Stage 3) |
| `driver` | Legacy schema field only — not surfaced in revamped tracker |

CSRs and dispatchers can be multi-role. Per the seed data, `Gabe`, `Rodney`, `Paul`, `Brent` are listed in both roles.

### Demo credentials

| Email | Password | Role |
|---|---|---|
| `stee@equipdispatch.com` | `Admin123!` | supplier |
| `melissa@equipdispatch.com` | `Equip2026!` | csr (one of 11) |
| `nic@equipdispatch.com` | `Equip2026!` | dispatcher (one of 9) |

Full user list: see `prisma/seed-data.ts` → `CSRS` (11 entries) and `DISPATCHERS` (9 entries).

---

## Routes

| Route | Auth | Purpose |
|---|---|---|
| `/login` | public | Login form |
| `/tracker` | auth | Order list + create/edit modal — main operational surface |
| `/reporting` | auth | Funnel + dimensional analytics with stage/status/dimension filters |
| `/configuration` | supplier | Lookup admin (What's Needed, Insurance, Companies, Item Types, Cancellation Reasons, Equipment) |
| `/facilities` | supplier | Facility CRUD |
| `/users` | supplier | User CRUD |
| `/audit-log` | supplier | Append-only event log |
| `/hipaa` | supplier | Compliance checklist |
| `/support` | auth | In-app support tickets |
| `/print/order/[id]` | auth | Printable dispatch ticket |

API routes mirror the page structure under `/api/*`.

---

## Order lifecycle

Two orthogonal axes: **stage** (where in the workflow) is derived from timestamps + populated fields; **status** (what's happening with the outcome) is declared by the user.

### `OrderStage` — derived, never user-set

```
INTAKE_OFF_RIP        // 1a — 5 fields captured, awaiting verification
  ↓
INTAKE_VERIFICATION   // 1b — gathering missing info / auth
  ↓
READY_TO_ASSIGN       // 2  — all required info present, awaiting dispatcher
  ↓
ASSIGNED              // 3  — dispatcher assigned + ticket printed
  ↓
ACKNOWLEDGED          // 4  — dispatcher acknowledged the assignment
  ↓
OUT_FOR_DELIVERY      // 5  — dispatcher en route
  ↓
DOOR_TAG              // 5b — delivery attempted, no one home; awaiting re-attempt
  ↓
DELIVERED             // 6  — confirmed delivered (terminal happy path)

CANCELLED             // terminal — kill switch
```

`deriveStage()` in `lib/order-types.ts` computes the stage from `printedAt`, `acknowledgedAt`, `outForDeliveryAt`, `doorTaggedAt`, `deliveredAt`, `cancelledAt`, plus the verification-complete predicate (no items in `whatsNeeded`, primary insurance set, auth `NOT_REQ` or `APPROVED`). Service-call work order types (non-`DELIVERY`) skip the insurance/auth gate and go straight to `READY_TO_ASSIGN`.

### `OutcomeStatus` — declared

```
ACTIVE         // default — order is in flight
ON_HOLD        // paused, will resume
LOOSE_ENDS     // on-call holding state — awaiting external response
TRANSFERRED    // handed to another supplier
REJECTED       // not taken
CANCELLED      // killed
DELIVERED      // success
WRITE_OFF      // accounting close-out
```

Any non-`ACTIVE`, non-`DELIVERED` status requires a `cancellationReason`. Statuses other than `ACTIVE` and `DELIVERED` are blocking — the dispatcher field is locked while in those states (see `isBlockingStatus()`).

### Stage 3 UI flow (Fulfillment & Dispatch)

The Stage 3 panel reads top-down as the actions a dispatcher takes:

1. **Review Order** — readonly facility + equipment summary
2. **Assign** — Dispatcher → Handler (Internal / Rep / Facility)
3. **Schedule** — Discharge (readonly) → Requested Delivery (readonly) → Delivery Date (editable)
4. **Outcome** — Status (defaults to Active); Reason appears only when required

Stage 3 footer renders stage-advancement actions (Print Ticket / Mark Printed / Acknowledge / Out for Delivery) on the left and Save Changes on the right.

---

## Data model (Prisma)

Source: `prisma/schema.prisma`. Key models:

- `Order` — central record, joins Facility/User/OrderItem/OrderEvent
- `OrderItem` — many per Order; FK to `Equipment` + quantity
- `OrderEvent` — append-only history rows (who/action/detail/ts)
- `Equipment` — catalog (see Equipment Catalog section below)
- `Facility`, `User` (with `roles: String[]`)
- Lookup tables: `WhatsNeededOption`, `InsuranceOption`, `FulfillmentCompany`, `ItemTypeOption`, `CancellationReason`
- `OrderSequence` — counter for `ED-{yyyy}-{6digit}` order numbers
- `LoginAttempt` — rate-limit + lockout state

### Order shape (API serialization)

`lib/order-types.ts` exports `OrderShape` — the API-serialized form of an Order with all FK names denormalized (`csrName`, `facilityName`, etc.) and dates as ISO strings.

---

## Lookup tables

All lookups follow the same shape: `key` (immutable, used as FK), `label` (display), `color`, `sortOrder`, `active`. Edited via `/configuration`; seeded from `prisma/seed-data.ts`.

| Table | Count | Notes |
|---|---|---|
| `WhatsNeededOption` | 10 | DX, SIG, FS, NOTES, PU_DT, PEND_CB, MGMT_REV, DC_POST, ORD_HOLD, INS_ISSUE |
| `InsuranceOption` | 49 | Medicare/Medicaid/Commercial/Auto/WC/VA/PrivatePay variants |
| `FulfillmentCompany` | 5 | ACTION, CDME, SHAN, CARE_ONE, ADVANCED_MEDICAL — real companies only |
| `ItemTypeOption` | 8 | Wheelchair, Bed, Lift, Commode, Oxygen, Walker, Wound Vac, Misc |
| `CancellationReason` | 8 | Patient Declined, Duplicate, Facility Cancelled, Ins Denied, Patient Deceased, Wrong Equipment, Transferred, Other |

Outcome states (Cancelled / Transferred / Rejected / On Hold / Loose Ends / Write Off) live on `Order.status`, NOT on the company list. Rep / Facility live on `Order.handler`.

---

## Equipment catalog

64 items across 7 categories. Source: `prisma/seed-data.ts` → `EQUIPMENT`.

Each entry has: `category`, `name`, `abbreviation`, optional `hcpcsCode`, optional `kind` (`item` | `accessory`), optional `parLevel` (warehouse minimum on-hand stock).

| Category | Items |
|---|---|
| Wheelchair | 13 chairs (TC17/19, WC/HWC 16-26) |
| Recliner | 3 (REC16/18/20) |
| Wheelchair accessories | 8 cushions + ELR + FR |
| Walker/Mobility | 8 (2WW, ROLL, BARI variants, HEMIW, JRW, QC SB/LB) |
| Bed | 8 (FE, BARIBED, mattresses, rails, sheets, APP) |
| Bath/Commode | 8 (BSC, DAC, BARI variants, TTB, SCBACK, RTS RND/ELONG) |
| Respiratory | 2 (NEB, O2BAG) |
| Lift | 12 (MAN/ELEC LIFT, MAN/ELEC STS, slings M/L/XL/XXL, sit-to-stand slings, butt straps) |

### Abbreviation policy

**No spaces. All uppercase.** Standardized 2026-05-07 so abbreviations are consistent across:

- The order picker (`OrderForm` equipment search)
- Print tickets (`/print/order/[id]`)
- Warehouse pick labels
- HCPCS code adjacency in display (e.g. `FE · E0265`)

Verified at runtime: 0 abbreviations contain spaces, 0 contain lowercase.

### Legacy → canonical mapping

The 2026-05-07 standardization renamed 37 abbreviations. The remaining 27 were already canonical. The full mapping is the authoritative reference for any data migration from prior systems or from the pre-2026-05-07 seed:

| Legacy | Canonical | Equipment |
|---|---|---|
| `CSH 16x16` | `CSH16X16` | 16"x16" Cushion |
| `CSH 18x16` | `CSH18X16` | 18"x16" Cushion |
| `CSH 18x18` | `CSH18X18` | 18"x18" Cushion |
| `CSH 20x16` | `CSH20X16` | 20"x16" Cushion |
| `CSH 20x18` | `CSH20X18` | 20"x18" Cushion |
| `CSH 22x18` | `CSH22X18` | 22"x18" Cushion |
| `CSH 24x18` | `CSH24X18` | 24"x18" Cushion |
| `CSH 26x18` | `CSH26X18` | 26"x18" Cushion |
| `BARI 2WW` | `BARI2WW` | Bariatric 2-Wheeled Walker |
| `BARI ROLL` | `BARIROLL` | Bariatric Rollator |
| `HEMI W` | `HEMIW` | Hemi Walker |
| `JR W` | `JRW` | Junior Walker |
| `QC SB` | `QCSB` | Small Base Quad Cane |
| `QC LB` | `QCLB` | Large Base Quad Cane |
| `BARI BED` | `BARIBED` | Bariatric Bed |
| `300 MAT` | `MAT300` | 300-Style Mattress |
| `42 MAT` | `MAT42` | 42" Bariatric Mattress |
| `FULL RAIL` | `FULLRAIL` | Full Length Bed Rails |
| `HALF RAIL` | `HALFRAIL` | Half Bed Rails |
| `BARI C` | `BARIC` | Bariatric Commode |
| `BARI DAC` | `BARIDAC` | Bariatric Drop Arm Commode |
| `SC BACK` | `SCBACK` | Shower Chair w/ Back |
| `RTS RND` | `RTSRND` | Raised Toilet Seat (Round) |
| `RTS ELONG` | `RTSELONG` | Raised Toilet Seat (Elongated) |
| `O2 BAG` | `O2BAG` | Oxygen Bag/Holder |
| `MAN LIFT` | `MANLIFT` | Manual Lift |
| `ELEC LIFT` | `ELECLIFT` | Electric Lift |
| `MAN STS` | `MANSTS` | Manual Sit-to-Stand |
| `ELEC STS` | `ELECSTS` | Electric Sit-to-Stand |
| `SLING M` | `SLINGM` | Medium Sling |
| `SLING L` | `SLINGL` | Large Sling |
| `SLING XL` | `SLINGXL` | X-Large Sling |
| `SLING XXL` | `SLINGXXL` | XXL Sling |
| `STS SL M` | `STSSLM` | Sit-to-Stand Sling (Medium) |
| `STS SL L` | `STSSLL` | Sit-to-Stand Sling (Large) |
| `BS STD` | `BSSTD` | Butt Strap (Standard) |
| `BS LG` | `BSLG` | Butt Strap (Large) |

Unchanged (already canonical, safe pass-throughs in any migration):
`TC17`, `TC19`, `WC16`, `HWC16`, `WC18`, `HWC18`, `WC20`, `HWC20`, `WC22`, `HWC22`, `WC24`, `HWC24`, `WC26`, `REC16`, `REC18`, `REC20`, `ELR`, `FR`, `2WW`, `ROLL`, `FE`, `APP`, `SHEETS`, `BSC`, `DAC`, `TTB`, `NEB`.

---

## Data migration

`prisma/abbreviation-migration.ts` is the authoritative migration helper. It exports:

- `ABBREVIATION_MIGRATION: Record<string, string>` — exhaustive 64-entry map (every current catalog abbreviation has an entry, both renamed and unchanged), so callers can rely on it as a complete lookup table.
- `migrateAbbreviation(old: string): string` — exact match → uppercase fallback (handles legacy exports like `"bari bed"`) → **throws** on unknown inputs.

### Usage in a future import script

```ts
import { migrateAbbreviation } from "../prisma/abbreviation-migration";

for (const row of legacyRows) {
  try {
    row.abbreviation = migrateAbbreviation(row.abbreviation);
  } catch (e) {
    unknownSkus.push({ row, error: (e as Error).message });
  }
}
```

The throw-on-unknown design means a bad SKU surfaces during dry-run rather than silently importing as malformed data.

### Recommended import flow

When the client provides legacy data:

1. Land the file as-is under `prisma/legacy/` (gitignored).
2. Build `prisma/import-legacy.ts` that runs in **dry-run mode by default**:
   - Parse the file
   - Translate each abbreviation via `migrateAbbreviation()`
   - Resolve facility names → `Facility.id`, CSR initials → `User.id`, insurance carrier → `InsuranceOption.key`
   - Report: rows accepted, rows rejected (with reason), unknown SKUs, missing facilities, malformed dates
3. Only after the dry-run report is approved, re-run with `--write` to persist.

---

## API surface

All routes return JSON. Auth required unless noted.

| Route | Methods | Notes |
|---|---|---|
| `/api/auth/login` | POST | Sets `ed_session` cookie |
| `/api/auth/logout` | POST | Clears cookie |
| `/api/me` | GET | Current user |
| `/api/tracker/orders` | GET, POST | List + create |
| `/api/tracker/orders/[id]` | GET, PATCH | Get + update; PATCH validates `OutcomeStatus` against `VALID_OUTCOME_STATUSES` and requires a reason for non-active/non-delivered statuses |
| `/api/tracker/lookups` | GET | Bundles all lookup tables |
| `/api/lookups/[type]` | GET, POST | Lookup CRUD; supplier-only for writes |
| `/api/lookups/[type]/[id]` | PATCH, DELETE | Lookup item edit/delete |
| `/api/facilities`, `/api/facilities/[id]` | GET/POST/PATCH/DELETE | Facility CRUD |
| `/api/users`, `/api/users/[id]` | GET/POST/PATCH/DELETE | User CRUD |
| `/api/audit` | GET | Audit log query |
| `/api/support/tickets`, `/api/support/tickets/[id]` | GET/POST/PATCH | In-app support |

---

## Auth

`lib/auth.ts` handles sessions and rate limiting:

- HMAC-signed JSON cookie containing `{ userId, expiresAt }`
- 8-hour TTL, sliding renewal on each request
- Login lockout via `LoginAttempt` model — exponential backoff on repeated failures
- Password complexity enforced server-side: 8+ chars, upper, lower, number

`getSessionUser(req)` returns the authenticated user or null. `ALLOWED_PATCH_ROLES` on order routes is `["supplier", "csr", "dispatcher"]`.

---

## Reporting (`/reporting`)

Filterable analytics dashboard. `app/(admin)/reporting/ReportingClient.tsx`.

- **Filters**: date range, stages, statuses, CSRs, dispatchers, facilities, insurance, item types, fulfillment companies
- **Funnel** — count of orders that hit each stage (ignores stage + status filters so the funnel reflects the full universe)
- **Dimensional breakdown** — pivots by selected dimension (status, stage, csr, dispatcher, facility, insurance, item type, fulfillment company, day/week/month bucket)
- Filter state is encoded into the URL (`?stat=`, `?stage=`, etc.) so views are shareable

Adding a new `OutcomeStatus` enum value automatically flows through the reporting filters because `VALID_STATUS` is derived from `STATUS_LABELS`.

---

## HIPAA posture

`/hipaa` is a click-through compliance checklist. Production deployment requires (not yet wired):

- TLS 1.3 termination at the LB
- Postgres-at-rest encryption (LUKS or managed `pgcrypto`)
- Off-site encrypted backups + PITR
- WAF + per-IP rate limiting
- MFA for `supplier` role
- BAAs with the hosting provider and any third-party processor

See `reference_master_architecture.md` (auto-memory) for the canonical security baseline that applies to all stee-suite apps.

---

## Deploy

```bash
npm run build      # next build + postbuild rsync of static into standalone
node .next/standalone/server.js
```

Postbuild step copies `.next/static/` into `.next/standalone/.next/static/` so PM2/Docker hosting from `standalone` doesn't 404 on chunk requests.

PM2 / Docker recipes live in this repo's deploy notes (TODO: rewire when the prod target is decided).

---

## Repo conventions

- **Schema changes**: edit `prisma/schema.prisma` → `npx prisma db push --accept-data-loss && npx prisma generate` → restart `next dev` (Prisma engine is cached in memory). Don't generate Prisma migrations — `db push` is the authoritative path for this app.
- **Seed self-correction**: `seed.ts` does `deleteMany where key notIn [...]` before upserts so removed lookup entries are pruned, not just hidden.
- **Status taxonomy single source**: `STATUS_LABELS` in `lib/order-types.ts` drives the dropdown, the reporting filter, and the API validator. Adding a new status only requires updating the Prisma enum + this constant.
- **No Prisma migrations directory**: schema is authoritative; `prisma db push` syncs it. Demo data is recreated on every `npm run db:seed`.
