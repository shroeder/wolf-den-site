-- ── RECORD WHAT WE ACTUALLY PAID OUT, ON THE ROW THAT IS THE P&L ────────────────────────────────────────────
-- Luke, 2026-10-27: "we will need telemetry and a screen in admin to tracking profit and loss for the online
-- random buy features."
--
-- ⚠️ mkt_pack_open ALREADY HELD EVERY NUMBER BUT THE ONE THAT DECIDES THE OUTCOME. price_cents, revenue,
-- tax, cogs, card_value — and then nothing for the sell-back, which is the single largest cash movement the
-- feature makes. A report could only reach it by joining to mkt_store_credit_event, or by re-deriving it
-- from card_value_cents, and re-deriving is exactly what buyback.js spends forty lines telling us never to
-- do: the quarter round-up and the $1 floor both run in the member's favour, so the derived figure is
-- quietly WRONG in the house's favour on every open that hits either.
--
-- At 60% that was a rounding question. At 100% sell-back the margin on a $5 pack is $0.75, and the
-- round-up alone moves a payout by up to $0.24 — a third of the margin. The number has to be recorded, not
-- reconstructed.
--
-- NULL means "not sold back" (kept, or still pending). It is deliberately nullable rather than defaulting
-- to 0, because a kept card and a card sold back for nothing are different events and a report that cannot
-- tell them apart will average them together.

ALTER TABLE mkt_pack_open
    ADD COLUMN IF NOT EXISTS buy_back_cents INTEGER;

-- ── BACKFILL FROM THE CREDIT LEDGER ─────────────────────────────────────────────────────────────────────────
-- Every sell-back wrote a mkt_store_credit_event, so the history is recoverable even though the open row
-- never carried it. Matched on the card id inside the event's meta, which is how those rows identify
-- themselves (see sellVaultCards / choosePackOutcome).
--
-- ⚠️ ONLY WHERE THE OPEN SAYS IT WAS SOLD. A credit event can also be a top-up, a refund or an adjustment;
-- keying off the open's own outcome rather than the event's reason means a mislabelled ledger row cannot
-- invent a payout against a card somebody still owns.
UPDATE mkt_pack_open o
   SET buy_back_cents = e.delta_cents
  FROM mkt_store_credit_event e
 WHERE o.outcome = 'sold_back'
   AND o.buy_back_cents IS NULL
   AND e.delta_cents > 0
   AND e.reason IN ('vault_sellback', 'pack_open')
   AND e.buyer_id = o.buyer_id
   AND e.meta ->> 'card' IS NOT NULL
   AND e.created_at BETWEEN o.created_at AND o.created_at + INTERVAL '2 hours';

-- The telemetry groups by pool over a date window; this is the index that query wants.
CREATE INDEX IF NOT EXISTS mkt_pack_open_pool_created_idx
    ON mkt_pack_open (pool, created_at)
    WHERE preview = FALSE;
