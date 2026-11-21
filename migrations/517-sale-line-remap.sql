-- ── A SALE RUNG UP ON THE WRONG ITEM CAN BE POINTED AT THE RIGHT ONE ──────────────────────────────────────────
-- Luke, 2026-11-21: two $5 event entries were rung on "Magic Event", which carries ~$20 of prize cost, and
-- showed as a -308% loss. "These sales should be reclassified."
--
-- A completed Square order is immutable, so the fix lives here: one row per (order, line) naming the variation
-- that line SHOULD have been. src/lib/admin-app/sale-remap.js applies it to orders on the way past -- the admin
-- proxy (every phone screen), reports v2, and the FIFO reconciler -- so cost, category and name all follow.
CREATE TABLE IF NOT EXISTS sale_line_remap (
    order_id      text NOT NULL,
    line_uid      text NOT NULL,
    variation_id  text NOT NULL,
    item_name     text NOT NULL,
    note          text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (order_id, line_uid)
);
