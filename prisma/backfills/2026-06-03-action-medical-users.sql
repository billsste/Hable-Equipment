-- Replace the demo @equipdispatch.com users with the real Action Medical
-- staff list (15 names, minus AP which is skipped). Idempotent on re-run
-- because every UPSERT is keyed on email and the order-FK migration only
-- fires while old rows still exist.
--
-- Strategy:
--   1) Upsert all 14 real users (Stee Suite stays untouched).
--   2) Migrate orders + items + attachments from old demo user rows to the
--      new Action-Medical row with the same first name. So "Brent" demo
--      orders stay attached to the real Brent Hable; same for Gabe/Rodney/
--      Bob/Brandon/Terrell/Dawn/Danisha/Melissa/Lorne/Shane/Tyler.
--   3) Null any remaining FK references to old demo users.
--   4) Delete every @equipdispatch.com user EXCEPT stee@equipdispatch.com.

-- ── Step 1: Upsert real users with default password + force-change flag ──
-- mustChangePassword=true only on first insert; if a user already exists
-- (re-run), leave their password + flag alone.

INSERT INTO "User" (name, email, password, role, roles, active, "mustChangePassword", "mfaEnabled", "mfaBackupCodes")
VALUES
  ('Danisha King',        'dking@actionmedicalequip.com',         'Equip2026!', 'csr',    ARRAY['csr'],            true, true, false, ARRAY[]::text[]),
  ('Dawn Fleeson',        'dfleeson@actionmedicalequip.com',      'Equip2026!', 'csr',    ARRAY['csr'],            true, true, false, ARRAY[]::text[]),
  ('Keshawn Hunt',        'keshawn@actionmedicalequip.com',       'Equip2026!', 'csr',    ARRAY['csr'],            true, true, false, ARRAY[]::text[]),
  ('Lorne Green',         'lgreen@actionmedicalequip.com',        'Equip2026!', 'csr',    ARRAY['csr'],            true, true, false, ARRAY[]::text[]),
  ('Melissa Songalewski', 'msongalewski@actionmedicalequip.com',  'Equip2026!', 'csr',    ARRAY['csr'],            true, true, false, ARRAY[]::text[]),
  ('Shane Loch',          'sloch@actionmedicalequip.com',         'Equip2026!', 'csr',    ARRAY['csr'],            true, true, false, ARRAY[]::text[]),
  ('Tyler Fleeson',       'tfleeson@actionmedicalequip.com',      'Equip2026!', 'csr',    ARRAY['csr'],            true, true, false, ARRAY[]::text[]),
  ('Brent Hable',         'bhable@actionmedicalequip.com',        'Equip2026!', 'csr',    ARRAY['csr','driver'],   true, true, false, ARRAY[]::text[]),
  ('Gabe Green',          'ggreen@actionmedicalequip.com',        'Equip2026!', 'csr',    ARRAY['csr','driver'],   true, true, false, ARRAY[]::text[]),
  ('Rodney Guyton',       'rguyton@actionmedicalequip.com',       'Equip2026!', 'csr',    ARRAY['csr','driver'],   true, true, false, ARRAY[]::text[]),
  ('Bob Frauce',          'bob@actionmedicalequip.com',           'Equip2026!', 'driver', ARRAY['driver'],         true, true, false, ARRAY[]::text[]),
  ('Brandon Williams',    'brandon@actionmedicalequip.com',       'Equip2026!', 'driver', ARRAY['driver'],         true, true, false, ARRAY[]::text[]),
  ('Robert Vadnais',      'rvadnais@actionmedicalequip.com',      'Equip2026!', 'driver', ARRAY['driver'],         true, true, false, ARRAY[]::text[]),
  ('Terrell Cooks',       'tcooks@actionmedicalequip.com',        'Equip2026!', 'driver', ARRAY['driver'],         true, true, false, ARRAY[]::text[])
ON CONFLICT (email) DO UPDATE SET
  name   = EXCLUDED.name,
  role   = EXCLUDED.role,
  roles  = EXCLUDED.roles,
  active = true;

-- ── Step 2: Migrate order FKs from old demo users → new real users by
--    first-name match. Lower-case + first-token compare so "Brent" old
--    matches "Brent Hable" new. Loops through every (old, new) pair.

WITH name_map AS (
  SELECT old.id AS old_id, new.id AS new_id
  FROM "User" old
  JOIN "User" new
    ON LOWER(SPLIT_PART(old.name, ' ', 1)) = LOWER(SPLIT_PART(new.name, ' ', 1))
   AND new.email LIKE '%@actionmedicalequip.com'
  WHERE old.email LIKE '%@equipdispatch.com'
    AND old.email <> 'stee@equipdispatch.com'
)
UPDATE "Order" o
SET "csrId" = nm.new_id
FROM name_map nm
WHERE o."csrId" = nm.old_id;

WITH name_map AS (
  SELECT old.id AS old_id, new.id AS new_id
  FROM "User" old
  JOIN "User" new
    ON LOWER(SPLIT_PART(old.name, ' ', 1)) = LOWER(SPLIT_PART(new.name, ' ', 1))
   AND new.email LIKE '%@actionmedicalequip.com'
  WHERE old.email LIKE '%@equipdispatch.com'
    AND old.email <> 'stee@equipdispatch.com'
)
UPDATE "Order" o
SET "createdById" = nm.new_id
FROM name_map nm
WHERE o."createdById" = nm.old_id;

WITH name_map AS (
  SELECT old.id AS old_id, new.id AS new_id
  FROM "User" old
  JOIN "User" new
    ON LOWER(SPLIT_PART(old.name, ' ', 1)) = LOWER(SPLIT_PART(new.name, ' ', 1))
   AND new.email LIKE '%@actionmedicalequip.com'
  WHERE old.email LIKE '%@equipdispatch.com'
    AND old.email <> 'stee@equipdispatch.com'
)
UPDATE "OrderItem" i
SET "driverId" = nm.new_id
FROM name_map nm
WHERE i."driverId" = nm.old_id;

WITH name_map AS (
  SELECT old.id AS old_id, new.id AS new_id
  FROM "User" old
  JOIN "User" new
    ON LOWER(SPLIT_PART(old.name, ' ', 1)) = LOWER(SPLIT_PART(new.name, ' ', 1))
   AND new.email LIKE '%@actionmedicalequip.com'
  WHERE old.email LIKE '%@equipdispatch.com'
    AND old.email <> 'stee@equipdispatch.com'
)
UPDATE "OrderAttachment" a
SET "uploadedById" = nm.new_id
FROM name_map nm
WHERE a."uploadedById" = nm.old_id;

-- Also migrate Ticket / TicketAudit if they reference users — defensive in
-- case the legacy ticket UI still has rows pointing at the old demo team.
WITH name_map AS (
  SELECT old.id AS old_id, new.id AS new_id
  FROM "User" old
  JOIN "User" new
    ON LOWER(SPLIT_PART(old.name, ' ', 1)) = LOWER(SPLIT_PART(new.name, ' ', 1))
   AND new.email LIKE '%@actionmedicalequip.com'
  WHERE old.email LIKE '%@equipdispatch.com'
    AND old.email <> 'stee@equipdispatch.com'
)
UPDATE "Ticket" t
SET "createdById" = nm.new_id
FROM name_map nm
WHERE t."createdById" = nm.old_id;

WITH name_map AS (
  SELECT old.id AS old_id, new.id AS new_id
  FROM "User" old
  JOIN "User" new
    ON LOWER(SPLIT_PART(old.name, ' ', 1)) = LOWER(SPLIT_PART(new.name, ' ', 1))
   AND new.email LIKE '%@actionmedicalequip.com'
  WHERE old.email LIKE '%@equipdispatch.com'
    AND old.email <> 'stee@equipdispatch.com'
)
UPDATE "Ticket" t
SET "driverId" = nm.new_id
FROM name_map nm
WHERE t."driverId" = nm.old_id;

-- ── Step 3: NULL remaining FK references that didn't find a name match
--    (e.g. "Austin", "Nic", "Sunshine", "Paul", "Eiva" have no equivalent
--    in the new list).
UPDATE "Order"
SET "csrId" = NULL
WHERE "csrId" IN (
  SELECT id FROM "User"
  WHERE email LIKE '%@equipdispatch.com' AND email <> 'stee@equipdispatch.com'
);
UPDATE "Order"
SET "createdById" = NULL
WHERE "createdById" IN (
  SELECT id FROM "User"
  WHERE email LIKE '%@equipdispatch.com' AND email <> 'stee@equipdispatch.com'
);
UPDATE "OrderItem"
SET "driverId" = NULL
WHERE "driverId" IN (
  SELECT id FROM "User"
  WHERE email LIKE '%@equipdispatch.com' AND email <> 'stee@equipdispatch.com'
);
UPDATE "OrderAttachment"
SET "uploadedById" = NULL
WHERE "uploadedById" IN (
  SELECT id FROM "User"
  WHERE email LIKE '%@equipdispatch.com' AND email <> 'stee@equipdispatch.com'
);
UPDATE "Ticket"
SET "createdById" = NULL
WHERE "createdById" IN (
  SELECT id FROM "User"
  WHERE email LIKE '%@equipdispatch.com' AND email <> 'stee@equipdispatch.com'
);
UPDATE "Ticket"
SET "driverId" = NULL
WHERE "driverId" IN (
  SELECT id FROM "User"
  WHERE email LIKE '%@equipdispatch.com' AND email <> 'stee@equipdispatch.com'
);

-- ── Step 4: Delete all old demo users except the Stee admin.
DELETE FROM "User"
WHERE email LIKE '%@equipdispatch.com'
  AND email <> 'stee@equipdispatch.com';
