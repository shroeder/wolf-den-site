-- ── DETECTING DUPLICATE LEDGER ENTRIES PROPERLY ─────────────────────────────────────────────────────────────
-- Luke, 2026-10-29, on finding 105 same-amount pairs in the books: "Its supposed to dedupe itself if it picks
-- up on a matching amount within a day or so. Why is it getting duplicated."
--
-- Because the only guard that existed was a set of Plaid transaction ids in SharedPreferences ON THE PHONE
-- (KEY_SYNCED_TRANSACTION_IDS in PlaidTransactionsService). Three holes, and each one maps to a pattern in the
-- books today:
--
--   1. The set is per-device and per-install. Reinstall, switch handsets, or sync from the second phone and it
--      is empty — every transaction looks new again. Nothing in the database knew a row had been imported.
--   2. It keys on Plaid's transaction_id, WHICH CHANGES BETWEEN PENDING AND POSTED. A subscription arrives
--      pending with one id and posts days later with another, so the set has no reason to connect them. That
--      is the 16 Vercel/Google/Namecheap pairs.
--   3. It cannot see hand entries at all. A typed "Restock buy — 10 items" has no Plaid id, so when the
--      matching Venmo debit lands there is nothing to compare against. That is the five expensive ones,
--      $3,427 of the same money recorded twice by two different paths.
--
-- ⚠️ AND THE ANSWER IS NOT AN AGGRESSIVE AUTO-SKIP. Measured on the real books: of 105 same-amount pairs, 63
-- are the SAME VENDOR 2-4 days apart, almost all Southern Hobby Distribution. A card shop ordering from its
-- distributor twice in a week is a Tuesday. An importer strict enough to have blocked the five real duplicates
-- would have silently eaten about $9,400 of legitimate spend — and a missing expense is worse than a doubled
-- one, because a doubled one is visible.
--
-- So: make an EXACT re-import impossible at the database, and make a NEAR match something a human is asked
-- about once and never asked about again.

-- ── 1. THE HARD GUARANTEE ───────────────────────────────────────────────────────────────────────────────────
-- Where this row came from outside our own books: a Plaid transaction id, a Square payment id, whatever the
-- source calls it. Nullable, because hand-entered rows have no such thing and must stay allowed.
ALTER TABLE ledger_entry ADD COLUMN IF NOT EXISTS external_id TEXT;

-- ⚠️ THE UNIQUE INDEX IS THE POINT, and it is PARTIAL so the hundreds of hand-entered rows (all NULL) do not
-- collide with each other. With this in place the same bank transaction cannot be imported twice from any
-- device, after any reinstall, ever — which is the hole the phone-local set could never close.
CREATE UNIQUE INDEX IF NOT EXISTS ledger_entry_external_id_uniq
    ON ledger_entry (external_id) WHERE external_id IS NOT NULL;

-- Looking up "have I seen this one" has to be cheap on every import.
CREATE INDEX IF NOT EXISTS ledger_entry_source_idx ON ledger_entry (source);

-- ⚠️ AND AN INDEX FOR THE NEAR-MATCH SCAN ITSELF. It groups on rounded amount and payment method within a
-- date window; without this it is a sequential scan of the whole ledger on every import.
CREATE INDEX IF NOT EXISTS ledger_entry_near_match_idx
    ON ledger_entry (payment_method, date_ms) WHERE type IN ('Expense', 'Inventory');

-- ── 2. THE HUMAN'S ANSWER, REMEMBERED ───────────────────────────────────────────────────────────────────────
-- A verdict on ONE PAIR, not on one row — and that distinction is load-bearing. Row A can be perfectly fine
-- beside B and a duplicate of C; a `reviewed` flag on the row itself would answer for both and be wrong about
-- one of them.
--
-- ⚠️ THE PAIR IS STORED IN A CANONICAL ORDER (lo < hi) AND THE CHECK ENFORCES IT. Without that, (A,B) and
-- (B,A) are two rows, the lookup misses half the time, and the member gets asked about the same two entries
-- forever — which is exactly the kind of quiet re-asking that makes people stop reading the prompt.
CREATE TABLE IF NOT EXISTS ledger_dupe_verdict (
    lo_entry_id  TEXT        NOT NULL,
    hi_entry_id  TEXT        NOT NULL,
    -- 'duplicate'  — the same money twice; one side should go
    -- 'distinct'   — genuinely two payments, stop asking
    verdict      TEXT        NOT NULL CHECK (verdict IN ('duplicate', 'distinct')),
    decided_by   TEXT,
    decided_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    note         TEXT,
    PRIMARY KEY (lo_entry_id, hi_entry_id),
    CONSTRAINT ledger_dupe_verdict_ordered CHECK (lo_entry_id < hi_entry_id)
);

-- The scan asks "has this pair already been judged" for every candidate it finds.
CREATE INDEX IF NOT EXISTS ledger_dupe_verdict_hi_idx ON ledger_dupe_verdict (hi_entry_id);
