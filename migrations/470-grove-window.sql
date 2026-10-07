-- ── A ROLLING KILL WINDOW ────────────────────────────────────────────────────────────────────────────────
-- Luke: "we need to strike a balance between cost and server authority on things, since we cant push all of
-- it on the client due to exploits and responsiveness. But if we can save cost we should."
--
-- ⚠️ THE CEILING RESET EVERY TIME YOU WALKED IN. groveEnter set kills_settled = 0, so the budget that was
-- supposed to bound a session was really a budget per ENTRY — enter, settle the maximum, leave, enter again.
-- The guard was there and it was free to walk around.
--
-- So the bound moves to WALL CLOCK, which nothing the client does can reset: how many kills are physically
-- possible in the last N minutes, given a zone holds at most 30 and refills every 45 seconds. Entering more
-- often does not create more enemies.
--
-- Two columns and no extra query — they fold into the UPDATE that settle already runs.
ALTER TABLE mkt_grove_player ADD COLUMN IF NOT EXISTS kills_window     int         NOT NULL DEFAULT 0;
ALTER TABLE mkt_grove_player ADD COLUMN IF NOT EXISTS kills_window_at  timestamptz NOT NULL DEFAULT NOW();
