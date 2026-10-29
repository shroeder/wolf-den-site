-- ── DUPLICATES RESOLVE THEMSELVES; THE LOG IS SO YOU CAN CHECK ──────────────────────────────────────────────
-- Luke, 2026-10-29, on the review queue built an hour earlier: "I dont want to manually resolve this. The
-- ledger is automated. The duplicate prevention should be automated not manual intervention." And on the
-- unique index: "that seems bad. Because the whole reason we use dupes is to elect to hydrate details from
-- whichever is more substantive." And on the confidence scores: "if it is truly a dupe than why is it a
-- question."
--
-- All three land, and the third one dissolves the other two. The confidence scores existed because I was
-- matching on amount and date — which is guesswork — while PLAID WAS ALREADY TELLING US THE ANSWER and the
-- app was throwing it away. A posted transaction carries `pending_transaction_id`, the id of the pending row
-- it replaces. Parse that and:
--
--   • a pending link          → the SAME transaction. Certain. Merge it.
--   • two ids, no link        → two REAL transactions. Certain. Leave both alone.
--   • no id at all (typed)    → the only genuine collision, and decidable by rule.
--
-- There is nothing left to be unsure about, so there is nothing to ask. The 63 "same vendor, 0.25 confidence"
-- pairs were never ambiguous — each is its own Plaid transaction with no pending relationship, which is to
-- say a real repeat order from a distributor.
--
-- ⚠️ AND A CONSTRAINT VIOLATION IS THE WRONG MECHANISM, exactly as Luke said. Rejecting the second arrival
-- discards it — but the second arrival is usually the BETTER one: the posted row has the settled amount and
-- the real merchant name where the pending row had "VENMO". The unique index stays, because it is what makes
-- a race impossible, but the write path is now ON CONFLICT DO UPDATE with a field-level merge. The constraint
-- TRIGGERS the merge instead of failing it.

-- The verdict queue is gone. Nothing is asked, so nothing answers.
DROP TABLE IF EXISTS ledger_dupe_verdict;

-- ── WHAT GOT MERGED, AND WHY ────────────────────────────────────────────────────────────────────────────────
-- Not a queue and not a decision — a record, so an automatic merge is inspectable afterwards rather than
-- invisible. The one thing worse than a silent duplicate is a silent correction.
CREATE TABLE IF NOT EXISTS ledger_merge_log (
    id           BIGSERIAL   PRIMARY KEY,
    -- The row that survived, and what was folded into it.
    kept_entry_id   TEXT     NOT NULL,
    merged_from     TEXT,
    -- 'pending_posted'  Plaid told us: this posted row replaces that pending one
    -- 'same_external'   the same transaction id arrived again
    -- 'adopted_manual'  a bank row claimed an unlinked hand entry for the same money
    kind         TEXT        NOT NULL CHECK (kind IN ('pending_posted', 'same_external', 'adopted_manual')),
    -- Which fields the incoming row actually improved, so "it changed my description" is answerable.
    fields       JSONB,
    merged_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ledger_merge_log_kept_idx ON ledger_merge_log (kept_entry_id);
CREATE INDEX IF NOT EXISTS ledger_merge_log_at_idx ON ledger_merge_log (merged_at DESC);

-- ⚠️ THE PENDING ID IS STORED, NOT JUST THE TRANSACTION ID. A posted row needs to be able to find the pending
-- row it supersedes, and the only key that connects them is this one. Without it the link Plaid hands us is
-- read once and discarded, which is precisely how the books ended up with sixteen subscription pairs.
ALTER TABLE ledger_entry ADD COLUMN IF NOT EXISTS external_pending_id TEXT;
CREATE INDEX IF NOT EXISTS ledger_entry_external_pending_idx
    ON ledger_entry (external_pending_id) WHERE external_pending_id IS NOT NULL;

-- Finding an unlinked hand entry to adopt: amount and date, among rows that carry no external id.
CREATE INDEX IF NOT EXISTS ledger_entry_unlinked_idx
    ON ledger_entry (date_ms) WHERE external_id IS NULL;
