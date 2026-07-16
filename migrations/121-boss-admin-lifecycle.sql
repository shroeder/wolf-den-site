-- Weekly boss lifecycle: admin creates a DRAFT (name, AI art, HP, rewards, ticket rule), then RELEASES
-- it (goes live, notifications blast out). One live boss at a time; defeated/expired -> ended.
ALTER TABLE boss_event ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'live'; -- draft | live | ended
ALTER TABLE boss_event ADD COLUMN IF NOT EXISTS image_url TEXT;         -- AI-generated boss art (Vercel Blob)
ALTER TABLE boss_event ADD COLUMN IF NOT EXISTS description TEXT;       -- lore / the art prompt
ALTER TABLE boss_event ADD COLUMN IF NOT EXISTS rewards_text TEXT;      -- what's up for grabs (shown + announced)
ALTER TABLE boss_event ADD COLUMN IF NOT EXISTS ticket_divisor INT NOT NULL DEFAULT 100; -- raffle tickets = damage / this
ALTER TABLE boss_event ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;    -- auto-closes at week's end
