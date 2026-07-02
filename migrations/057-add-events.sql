-- "I'll Be There": marketplace events (card shows, FNM, trade nights) that vendors mark attendance
-- for, so buyers can see who's bringing what to an event and meet in person.

CREATE TABLE IF NOT EXISTS mkt_event (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    location_label TEXT,
    event_date DATE,
    created_by UUID REFERENCES mkt_vendor(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mkt_event_vendor (
    event_id UUID NOT NULL REFERENCES mkt_event(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES mkt_vendor(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (event_id, vendor_id)
);

CREATE INDEX IF NOT EXISTS idx_mkt_event_date ON mkt_event (event_date);
CREATE INDEX IF NOT EXISTS idx_mkt_event_vendor_vendor ON mkt_event_vendor (vendor_id);
