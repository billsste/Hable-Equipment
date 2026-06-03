-- Brent 2026-06: the fulfillment-companies dropdown is restricted to the
-- three vendors Action Medical actually books out to: Action Medical itself,
-- Care One, and Christian Mobility. Everything else gets deactivated (NOT
-- deleted) so historical orders that still reference an old company key keep
-- rendering their chip — only the picker hides the legacy rows.
--
-- Idempotent: every deploy runs the full backfill list (Pattern A). Re-runs
-- on already-trimmed rows are no-ops; if Steven re-activates a row by hand
-- the next deploy WILL re-deactivate it, which is the intended behavior
-- (this file is the source of truth for the allowed set).

-- Ensure the three canonical rows exist + are active + correctly labeled.
INSERT INTO "FulfillmentCompany" ("id", "key", "label", "sortOrder", "active")
VALUES
  ('fc_action',             'action',             'Action Medical',     10, true),
  ('fc_care_one',           'care-one',           'Care One',           20, true),
  ('fc_christian_mobility', 'christian-mobility', 'Christian Mobility', 30, true)
ON CONFLICT ("key") DO UPDATE
SET "label"  = EXCLUDED."label",
    "active" = true;

-- Deactivate every other row.
UPDATE "FulfillmentCompany"
SET "active" = false
WHERE "key" NOT IN ('action', 'care-one', 'christian-mobility')
  AND "active" = true;
