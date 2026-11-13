-- ── PHYSICALLY VERIFYING WHAT IS ACTUALLY IN THE CASE ───────────────────────────────────────────────────────
-- Luke, 2026-11-13, after four cards on one order turned out not to exist: "we need something in both apps to
-- manually verify what we have for singles, that way we can conclusively say what we dont have once we finish
-- a comprehensive review."
--
-- The investigation that prompted this found no software leak at all. Two of the four had been pulled in a
-- virtual pack and sold straight back within five seconds — the pull task says "the card never left the case"
-- — and the other two had NO system event of any kind between being counted in last May and being sold in
-- November. Nothing removed them. They were counted in, and then at some point they were not there.
--
-- Which means no amount of tracing fixes this: the only way to know what is in the case is for a person to
-- look in the case. That is what this table is for.
--
-- ⚠️ IT IS A LEDGER OF LOOKS, NOT A FLAG ON THE ITEM. A boolean "verified" column on inventory_feed would be
-- overwritten by the next Square sync — that table is a MIRROR and nothing local survives in it. It also
-- could not answer the question Luke actually asked, which is "once we finish a comprehensive review": that
-- needs to know WHEN each card was last looked at and by WHOM, so a round can be shown as complete and the
-- next round can start without losing the last one.
CREATE TABLE IF NOT EXISTS mkt_stock_audit (
    id            BIGSERIAL PRIMARY KEY,
    variation_id  TEXT NOT NULL,
    round         TEXT NOT NULL,              -- a named sweep, e.g. '2026-11', so rounds can be compared
    -- 'present'  the card is in the case
    -- 'missing'  looked for it, it is not there  -> written off in Square
    -- 'skipped'  could not check now (case locked, card out with a customer)
    status        TEXT NOT NULL,
    quantity      INTEGER,                    -- what was actually counted, when it is not simply 1 or 0
    expected      INTEGER,                    -- what Square claimed at the moment of looking
    name          TEXT,                       -- denormalised ON PURPOSE: Square DELETES sold-out items, and
                                              -- an audit of a card nobody can name afterwards is worthless
    price_cents   INTEGER,
    note          TEXT,
    verified_by   TEXT,                       -- which device/operator; the employee build is not Luke
    verified_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The question the worklist asks on every screen: has this card been looked at in this round?
CREATE INDEX IF NOT EXISTS idx_stock_audit_round ON mkt_stock_audit (round, variation_id);
CREATE INDEX IF NOT EXISTS idx_stock_audit_variation ON mkt_stock_audit (variation_id, verified_at DESC);

-- ⚠️ ONE VERDICT PER CARD PER ROUND, AND IT IS A UNIQUE INDEX RATHER THAN A CONVENTION. Two people auditing
-- the same drawer is the normal case, not the exception — a shop with an owner and an employee both holding
-- the same screen is exactly what Luke asked for. Without this, "1,465 of 1,465 verified" could be reached
-- while a third of the case was never opened, because the same fifty cards got counted three times each.
-- The write path upserts on it, so the LAST look wins and the count stays honest.
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_audit_once ON mkt_stock_audit (round, variation_id);
