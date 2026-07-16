-- Each boss gets its own AI-generated battle background (the 2D side-scrolling stage art).
ALTER TABLE boss_event ADD COLUMN IF NOT EXISTS background_url TEXT;
