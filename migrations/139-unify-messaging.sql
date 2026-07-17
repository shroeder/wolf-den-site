-- Messaging unification Phase 2: fold buyer<->vendor threads into the member DM store so there is ONE
-- message store. A DM thread may now carry vendor context (vendor_id + subject/listing/product); when set,
-- it's a "shop conversation" between the buyer member and the vendor's linked account member.
--
-- Reversible + additive: mkt_thread / mkt_message are LEFT INTACT (not read, not written after deploy) so
-- we can roll back. The vendor messaging APIs become a thin facade over these unified tables.

-- 1. Vendor-context columns on the DM thread (all nullable; NULL vendor_id == a plain friend DM).
ALTER TABLE mkt_dm_thread ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES mkt_vendor(id) ON DELETE CASCADE;
ALTER TABLE mkt_dm_thread ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE mkt_dm_thread ADD COLUMN IF NOT EXISTS listing_id UUID;
ALTER TABLE mkt_dm_thread ADD COLUMN IF NOT EXISTS catalog_product_id TEXT;

-- 2. The old UNIQUE(user_a,user_b) would block a friend DM AND a shop thread between the same two members
--    from coexisting. Replace it with partial uniques: one friend DM per pair; one shop thread per pair
--    per vendor. (CHECK(user_a<user_b) stays — vendor threads store the sorted member pair too.)
ALTER TABLE mkt_dm_thread DROP CONSTRAINT IF EXISTS mkt_dm_thread_user_a_user_b_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mkt_dm_thread_friend ON mkt_dm_thread (user_a, user_b) WHERE vendor_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mkt_dm_thread_vendor ON mkt_dm_thread (user_a, user_b, vendor_id) WHERE vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mkt_dm_thread_vendor ON mkt_dm_thread (vendor_id) WHERE vendor_id IS NOT NULL;

-- 2b. Link any vendor to its owner's member account by matching email, so shops can participate in the
--     unified store. (New vendors are already account-linked; this catches legacy unlinked ones.) Idempotent.
UPDATE mkt_vendor v
   SET account_id = b.id
  FROM mkt_buyer b
 WHERE v.account_id IS NULL AND LOWER(b.email) = LOWER(v.email);

-- 3. Backfill existing vendor threads whose vendor has a linked account, PRESERVING the thread id so old
--    links / notifications still resolve. Skips self-threads and anything already migrated. Idempotent.
INSERT INTO mkt_dm_thread (id, user_a, user_b, vendor_id, subject, listing_id, catalog_product_id, created_at, last_message_at, a_last_read_at, b_last_read_at)
SELECT t.id,
       LEAST(t.buyer_id, v.account_id)    AS user_a,
       GREATEST(t.buyer_id, v.account_id) AS user_b,
       t.vendor_id, t.subject, t.listing_id, t.catalog_product_id::text,
       t.created_at, t.last_message_at,
       CASE WHEN t.buyer_id = LEAST(t.buyer_id, v.account_id)    THEN t.buyer_last_read_at ELSE t.vendor_last_read_at END,
       CASE WHEN t.buyer_id = GREATEST(t.buyer_id, v.account_id) THEN t.buyer_last_read_at ELSE t.vendor_last_read_at END
  FROM mkt_thread t
  JOIN mkt_vendor v ON v.id = t.vendor_id
 WHERE v.account_id IS NOT NULL
   AND v.account_id <> t.buyer_id
   AND NOT EXISTS (SELECT 1 FROM mkt_dm_thread d WHERE d.id = t.id)
ON CONFLICT DO NOTHING;

-- 4. Backfill their messages, mapping the buyer/vendor SIDE to the member id, preserving timestamps.
INSERT INTO mkt_dm_message (thread_id, sender_id, body, created_at)
SELECT m.thread_id,
       CASE WHEN m.sender = 'vendor' THEN v.account_id ELSE t.buyer_id END,
       m.body, m.created_at
  FROM mkt_message m
  JOIN mkt_thread t ON t.id = m.thread_id
  JOIN mkt_vendor v ON v.id = t.vendor_id
 WHERE v.account_id IS NOT NULL
   AND v.account_id <> t.buyer_id
   AND EXISTS (SELECT 1 FROM mkt_dm_thread d WHERE d.id = m.thread_id)
   AND NOT EXISTS (
       SELECT 1 FROM mkt_dm_message dm
        WHERE dm.thread_id = m.thread_id AND dm.created_at = m.created_at AND dm.body = m.body
   );
