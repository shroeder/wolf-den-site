-- ── ARCHIVING AN ORDER ───────────────────────────────────────────────────────────────────────────────────
-- Luke: "We need a way to archive orders in both the employee and admin apps."
--
-- The orders screen only ever grew. Every order the shop has ever taken sat in one list for ever, so the
-- handful that actually need working today were buried under months of finished ones.
--
-- ⚠️ A TIMESTAMP, NOT A BOOLEAN. "When did this leave the list" answers questions a flag cannot: how long a
-- thing sat before being filed, whether a batch was archived in one sweep, and whether something was filed
-- the same minute it was created (which is somebody clearing the screen rather than finishing the work).
-- It also makes un-archiving a single NULL rather than a second column.
--
-- ⚠️ AND IT IS SEPARATE FROM fulfillment_status ON PURPOSE. Cancelled is a thing that happened to the ORDER;
-- archived is a thing the shop did to its own list. The app currently calls the cancelled tab "archived",
-- which is exactly the confusion this removes: a cancelled order can still need a refund chasing, and a
-- picked-up order can be filed the moment it walks out the door.
ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Every list the apps draw is "the active ones, newest first", so that is the index.
CREATE INDEX IF NOT EXISTS idx_shop_orders_active
    ON shop_orders (created_at DESC)
    WHERE archived_at IS NULL;
