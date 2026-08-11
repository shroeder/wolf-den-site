-- ── DEFENDING PAYS (2026-08-10) ──────────────────────────────────────────────────────────────────────────────
-- The arena is asynchronous: you fight somebody's LOADOUT, not their attention. So a member can be beaten — or
-- can beat somebody — while asleep, and until now the defender's side of that was worth exactly nothing. You
-- opened the app, were told three people had fought you, and that was the whole of it.
--
-- Turning somebody away now pays LAURELS. Not VP: victory points are a score you climb by choosing to fight,
-- and paying them to a sleeping member would inflate the one number that is supposed to mean "I turned up".
-- Laurels are the arena's spending currency and the right shape for "your build did the work".
ALTER TABLE mkt_arena_bout ADD COLUMN IF NOT EXISTS defender_laurels INT NOT NULL DEFAULT 0;

-- The daily cap lives on the member, not the bout: a popular target should not mint laurels simply for being
-- popular, and without this the correct play is to make yourself the most attractive opponent on the board and
-- then stop playing.
ALTER TABLE mkt_arena ADD COLUMN IF NOT EXISTS defence_day DATE;
ALTER TABLE mkt_arena ADD COLUMN IF NOT EXISTS defence_laurels_today INT NOT NULL DEFAULT 0;
