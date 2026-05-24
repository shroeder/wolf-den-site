-- Add per-event signup settings for admin-managed capacity overrides
CREATE TABLE IF NOT EXISTS event_signup_settings (
    event_slug TEXT PRIMARY KEY,
    signup_limit SMALLINT NOT NULL CHECK (signup_limit > 0 AND signup_limit <= 64),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
