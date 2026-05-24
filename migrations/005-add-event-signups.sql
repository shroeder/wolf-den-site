-- Add event RSVP signups with per-event seat assignments
CREATE TABLE IF NOT EXISTS event_signups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_slug TEXT NOT NULL,
    slot_number SMALLINT NOT NULL CHECK (slot_number > 0 AND slot_number <= 64),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    email_normalized TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_slug, slot_number),
    UNIQUE (event_slug, email_normalized)
);

CREATE INDEX IF NOT EXISTS idx_event_signups_event_slug ON event_signups(event_slug);
CREATE INDEX IF NOT EXISTS idx_event_signups_created_at ON event_signups(created_at DESC);
