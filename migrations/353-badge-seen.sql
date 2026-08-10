-- A BADGE SHOULD BE AN EVENT, NOT A DISCOVERY.
--
-- 139 badges, every one with its own painted die-cut sprite, its own XP and gold, and its own permanent bonus
-- in the system it belongs to — and the only way to learn you had earned one was to go to the badge screen
-- and notice. Most of them are earned by doing something else entirely (a boss, a harvest, a trade), so the
-- moment they land is a moment nobody is looking at the badge screen.
--
-- `seen_at` is what makes a celebration possible: NULL means "earned and never shown". Backfilled to
-- awarded_at for everything that already exists, because opening the game to a stack of 139 modals for badges
-- you earned in June is not a celebration, it is a queue.
ALTER TABLE mkt_user_badge ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ;
UPDATE mkt_user_badge SET seen_at = awarded_at WHERE seen_at IS NULL;

-- The lookup the pop-up does on every game screen: "anything unseen for this member?"
CREATE INDEX IF NOT EXISTS idx_mkt_user_badge_unseen ON mkt_user_badge (buyer_id) WHERE seen_at IS NULL;
