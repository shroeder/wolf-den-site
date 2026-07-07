-- Turn a "want" into a full buy order: a buyer says "I want this product (single OR sealed), qty N,
-- willing to pay up to $X", optionally tied to their account and a coarse location so vendors can see
-- demand on the map and act on it. Backward compatible — existing notify-me wants keep working
-- (quantity defaults to 1, status 'open', location/price null).

ALTER TABLE mkt_want ADD COLUMN IF NOT EXISTS buyer_id UUID REFERENCES mkt_buyer(id) ON DELETE SET NULL;
ALTER TABLE mkt_want ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;
ALTER TABLE mkt_want ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE mkt_want ADD COLUMN IF NOT EXISTS lat NUMERIC(9, 6);
ALTER TABLE mkt_want ADD COLUMN IF NOT EXISTS lng NUMERIC(9, 6);
ALTER TABLE mkt_want ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open';

-- Open buy orders with a location power the map demand + "buy orders near here".
CREATE INDEX IF NOT EXISTS idx_mkt_want_geo ON mkt_want (lat, lng) WHERE status = 'open' AND lat IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mkt_want_buyer ON mkt_want (buyer_id);
CREATE INDEX IF NOT EXISTS idx_mkt_want_open ON mkt_want (status, created_at DESC) WHERE status = 'open';
