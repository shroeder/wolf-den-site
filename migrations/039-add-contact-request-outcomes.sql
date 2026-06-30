-- Close the contact -> sale loop. A contact request is no longer fire-and-forget: the vendor moves
-- it through new -> responded -> sold/closed, which captures (a) the conversion funnel and (b) the
-- two reputation signals deferred in Phase 6 (response time via responded_at, close rate via sold
-- count). mkt_sale.contact_request_id attributes a sale back to the lead that produced it. See docs.

ALTER TABLE mkt_contact_request
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new',   -- new | responded | sold | closed
    ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ,             -- first time the vendor acted on it
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

ALTER TABLE mkt_sale
    ADD COLUMN IF NOT EXISTS contact_request_id UUID REFERENCES mkt_contact_request(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mkt_contact_status ON mkt_contact_request (vendor_id, status);
