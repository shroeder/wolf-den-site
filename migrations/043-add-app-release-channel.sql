-- Two app variants now share the self-update system: the full app (Luke) and a stripped employee
-- app (scan + trade only, for store helpers). Each gets its own release channel so an employee phone
-- only ever pulls employee builds and vice-versa. Existing rows are the 'full' channel.

ALTER TABLE app_release
    ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'full';

CREATE INDEX IF NOT EXISTS idx_app_release_channel_version
    ON app_release (channel, version_code DESC);
