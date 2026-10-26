-- ── A VAULT SHIPMENT IS A SHOP ORDER ────────────────────────────────────────────────────────────────────────
-- Cards leaving the Card Vault go out through `shop_orders`, not through a parallel order system — which is
-- what puts them on the admin and employee orders screens that already exist, with no new screen to build.
-- Two columns is the whole cost of that.

ALTER TABLE shop_orders
    -- Marks an order whose line items are VAULT CARDS rather than catalog products. The orders screen needs
    -- it to show a pull list instead of a picking list, and reporting needs it because a vault shipment
    -- carries no merchandise revenue — the card was already paid for when the pack was opened.
    ADD COLUMN IF NOT EXISTS vault_order BOOLEAN NOT NULL DEFAULT FALSE,

    -- ⚠️ WHAT WE CHARGED FOR INSURANCE, BECAUSE EASYPOST BILLS IT AT BUY TIME AND NOT INSIDE THE RATE.
    -- A quote built from the rate alone is short by exactly this much, so the figure the member was quoted
    -- has to be remembered until the label is actually bought — otherwise we absorb the difference on
    -- precisely the shipments where it is largest. See design doc §6.
    ADD COLUMN IF NOT EXISTS insurance_cents INT NOT NULL DEFAULT 0;

-- The orders screens filter to vault orders often enough to be worth the partial index, and it costs nothing
-- for the overwhelming majority of rows that are ordinary shop orders.
CREATE INDEX IF NOT EXISTS idx_shop_orders_vault
    ON shop_orders (created_at DESC)
    WHERE vault_order = TRUE;
