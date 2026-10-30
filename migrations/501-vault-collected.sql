-- ── A CARD CAN FINALLY LEAVE THE VAULT INTO SOMEBODY'S HANDS ────────────────────────────────────────────────
-- Until now mkt_vault_card had three states that mattered -- 'held', 'on_order', 'sold_back' -- and NOT ONE of
-- them meant "the member walked out with this". The order path only ever went held → on_order → (held again,
-- on cancel). So every card ever physically handed over was still sitting in its owner's vault, listed, with a
-- live sell-back price on it.
--
-- 2026-10-29: Anamarisa collected nine cards at the counter, Eric marked the shelf jobs Done in the employee
-- app, and all nine stayed 'held'. $122 of cards she was holding AND could have sold back to us for credit.
--
-- ⚠️ 'collected' IS NOT 'sold_back'. The missing-bag refund next door reuses 'sold_back', which is honest
-- there because the member got credit. Here the member got the CARD. Collapsing the two would write a
-- buy-back into the books that never happened, and would make "where did this card go" unanswerable.
ALTER TABLE mkt_vault_card ADD COLUMN IF NOT EXISTS collected_at TIMESTAMPTZ;

-- Who handed it over, when the row was closed by staff rather than by the order flow. Nullable on purpose:
-- the backfill below has no honest value to put here and should not invent one.
ALTER TABLE mkt_vault_card ADD COLUMN IF NOT EXISTS collected_by TEXT;

-- The vault screen reads status IN ('held','on_order') and the sell path requires 'held'; both already
-- exclude anything else, so no read needs changing for 'collected' to disappear from the member's view.
CREATE INDEX IF NOT EXISTS mkt_vault_card_collected_idx
    ON mkt_vault_card (buyer_id, collected_at)
    WHERE status = 'collected';
