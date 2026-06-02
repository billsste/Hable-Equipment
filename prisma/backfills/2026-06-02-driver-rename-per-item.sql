-- Backfill for the 2026-06-02 spec from Brent's call.
--
-- Runs after `prisma db push` has added the new columns/enum values, before
-- the smoke test. Every statement is idempotent so re-running on a partially
-- migrated DB (or on every deploy until commit B drops the old columns)
-- doesn't double-apply.

-- 1) Rename role: every existing `dispatcher` user becomes a `driver`.
--    The dispatcher enum value is still present in this commit; commit B
--    drops it after the UI no longer references it.
UPDATE "User"
SET role = 'driver'
WHERE role = 'dispatcher';

-- 2) Per-item driver: copy Order.dispatcherId onto every OrderItem that
--    doesn't have a driver yet.
UPDATE "OrderItem" oi
SET "driverId" = o."dispatcherId"
FROM "Order" o
WHERE oi."orderId" = o.id
  AND oi."driverId" IS NULL
  AND o."dispatcherId" IS NOT NULL;

-- 3) Per-item completion: copy Order.deliveredAt onto every OrderItem that
--    doesn't have a completedAt yet.
UPDATE "OrderItem" oi
SET "completedAt" = o."deliveredAt"
FROM "Order" o
WHERE oi."orderId" = o.id
  AND oi."completedAt" IS NULL
  AND o."deliveredAt" IS NOT NULL;

-- 4) ELDERCARE work-order type folds into DELIVERY + the new eldercare flag.
UPDATE "Order"
SET "workOrderType" = 'DELIVERY',
    "eldercare"     = true
WHERE "workOrderType" = 'ELDERCARE';

-- 5) SERVICE_PICKUP folds into PICK_UP.
UPDATE "Order"
SET "workOrderType" = 'PICK_UP'
WHERE "workOrderType" = 'SERVICE_PICKUP';

-- 6) Seed three new fulfillment companies per Brent's call. ON CONFLICT keeps
--    this safe on re-run. The IDs are deterministic so backfill + manual
--    edits in the admin UI never collide.
INSERT INTO "FulfillmentCompany" (id, key, label, "sortOrder", active)
VALUES
  ('seed-action',              'action',             'Action',             100, true),
  ('seed-care-one',            'care-one',           'Care One',           110, true),
  ('seed-christian-mobility',  'christian-mobility', 'Christian Mobility', 120, true)
ON CONFLICT (key) DO NOTHING;
