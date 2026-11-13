-- ── A VAULT CARD IS A DECISION WITH A DEADLINE ──────────────────────────────────────────────────────────────
-- Luke, 2026-11-12: "Cards should auto sell back after 3 days. And the timer should be apparant for users."
--
-- Until now a held card sat in the vault for ever. That is a real cost to the shop: the physical card is off
-- the shelf and unsellable for as long as somebody leaves it there (idx_vault_held_variation exists purely so
-- the counter can ask "is this one spoken for?"), while the member has already been paid in cards for credit
-- they spent once. Three days is the window to decide: keep it (order it — shipped or collected) or let it
-- trade back at the counter rate.
--
-- ⚠️ THE DEADLINE IS A COLUMN, NOT `created_at + 3 days` COMPUTED AT READ TIME. Two reasons, and the second
-- is the one that would have bitten:
--
--   1. The window can legitimately MOVE — see below — and a derived deadline cannot be moved.
--   2. It has to be stamped once and shown to the member. A member who reads "2 days left" must get two days,
--      even if the rule changes tomorrow. [[item-stats-are-generated-not-authored]] is the opposite case and
--      the distinction is the same one: what a player was PROMISED is a fact about the row.
ALTER TABLE mkt_vault_card
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- ── ⚠️ EXISTING HELD CARDS GET A FULL THREE DAYS FROM NOW, NOT FROM WHEN THEY WERE PULLED ───────────────────
-- Backfilling `created_at + 3 days` would have been the obvious line and it would have sold somebody's card
-- the first time the sweep ran, with no warning and no timer ever shown to them. The rule is new; nobody who
-- is holding a card today agreed to it. They get the window in full, starting when it starts existing.
--
-- Measured before writing this: exactly ONE card is held (one member, $2.00, pulled 2026-11-08 — already four
-- days old). So this clause protects one card today and the principle for ever.
UPDATE mkt_vault_card
   SET expires_at = NOW() + INTERVAL '3 days'
 WHERE status = 'held' AND expires_at IS NULL;

-- ── ⚠️ AND THE RELEASE HOLD WINS WHEREVER IT IS LATER ───────────────────────────────────────────────────────
-- §12: a card cannot leave the building until 7 days after the member's most recent credit top-up, and
-- createVaultOrder only accepts cards past that hold. So a 3-day clock running against a 7-day hold would
-- force-sell cards the member was never ALLOWED to keep — the one state this feature must never create.
-- The clock therefore starts when the card becomes orderable, not when it was pulled. Applied here for the
-- backfill and in vaultExpiryAt() for every row written after this.
UPDATE mkt_vault_card
   SET expires_at = releasable_at + INTERVAL '3 days'
 WHERE status = 'held' AND releasable_at IS NOT NULL AND releasable_at > NOW()
   AND releasable_at + INTERVAL '3 days' > expires_at;

-- The sweep's only question: which held cards are past their deadline? Partial, because every other status
-- is irrelevant to it — a card on an order, shipped, collected or already sold back is out of the race.
CREATE INDEX IF NOT EXISTS idx_vault_expiring
    ON mkt_vault_card (expires_at)
    WHERE status = 'held' AND expires_at IS NOT NULL;
