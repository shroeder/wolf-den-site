-- ── ONE PURCHASE, ONE LOYALTY CLAIM ──────────────────────────────────────────────────────────────────────────
-- The claim was idempotent on `square_payment_id`, which is the wrong key. One Square ORDER can carry more than
-- one payment — a split tender, or a first attempt that is superseded — and each payment minted its own claim
-- for the FULL order amount, each firing its own "Loyalty — offer points" push. Luke: "im getting double alerts
-- sometimes", two notifications 14 seconds apart for the same $83.70.
--
-- Ten orders in 505 claims did this. Three were redeemed twice, and only the XP layer stopped it becoming real:
-- awardXp dedupes on `spend:<orderId>`, so the second redemption granted nothing. That dedupe is PER BUYER
-- though — two different people each redeeming one of a pair would both have been paid for one purchase.
--
-- Keep one row per order: the redeemed one if there is one (it carries who claimed it), otherwise the earliest.
DELETE FROM mkt_loyalty_claim c
 USING (
     SELECT token,
            ROW_NUMBER() OVER (
                PARTITION BY award_order_id
                ORDER BY (redeemed_at IS NOT NULL) DESC, created_at ASC
            ) AS rn
       FROM mkt_loyalty_claim
 ) ranked
 WHERE c.token = ranked.token AND ranked.rn > 1;

-- And the guarantee, on the column that actually identifies the purchase. createLoyaltyClaim now conflicts on
-- this; the square_payment_id key stays as it was, so a repeated webhook for the SAME payment is still a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_claim_order ON mkt_loyalty_claim (award_order_id);
