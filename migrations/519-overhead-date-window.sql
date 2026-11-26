-- ── AN OVERHEAD LINE CAN HAVE A START AND AN END ─────────────────────────────────────────────────────────────
-- Luke, 2026-11-26: rent is $100 a month for the next seven months (December 2026 through June 2027),
-- then back to $750. Overhead used to be one flat rate applied to every day, past and future, so lowering
-- rent would have quietly rewritten every past day's break-even too. Each line now has an optional first and
-- last day (Chicago dates, inclusive); a day only bills the lines in force on it (lib/admin-app/breakeven.js).
ALTER TABLE wolfden_overhead ADD COLUMN IF NOT EXISTS starts_on DATE;
ALTER TABLE wolfden_overhead ADD COLUMN IF NOT EXISTS ends_on DATE;

-- The $750 rent ends with November...
UPDATE wolfden_overhead SET ends_on = DATE '2026-11-30', updated_at = NOW()
 WHERE label = 'Rent' AND ends_on IS NULL AND amount_cents = 75000;

-- ...$100 a month December through June...
INSERT INTO wolfden_overhead (label, amount_cents, cadence, sort_order, starts_on, ends_on)
SELECT 'Rent (reduced, Dec-Jun)', 10000, 'monthly', 0, DATE '2026-12-01', DATE '2027-06-30'
 WHERE NOT EXISTS (SELECT 1 FROM wolfden_overhead WHERE label = 'Rent (reduced, Dec-Jun)');

-- ...and $750 again from July 2027.
INSERT INTO wolfden_overhead (label, amount_cents, cadence, sort_order, starts_on)
SELECT 'Rent (from Jul 2027)', 75000, 'monthly', 0, DATE '2027-07-01'
 WHERE NOT EXISTS (SELECT 1 FROM wolfden_overhead WHERE label = 'Rent (from Jul 2027)');
