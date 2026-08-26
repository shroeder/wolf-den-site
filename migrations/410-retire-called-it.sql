-- ── "CALLED IT" GOES WITH THE WHEEL IT BELONGED TO ───────────────────────────────────────────────────────────
-- Migration 391 seeded eight casino badges. One of them, `casino_called_it`, was for naming a single pocket on
-- the roulette wheel and having it land. The wheel was later taken off the floor, and its badge went with it --
-- nobody held it, so nothing was taken from anybody. `progressForRule` still carries the note where the
-- `casino_pocket` rule used to be.
--
-- What it did NOT go with was the history. The INSERT in 391 is still the last word the migrations say about
-- that slug, so check:rewards -- which reads the migrations precisely because they are the record -- saw a badge
-- with no bonus and asked for one. I gave it one. That bonus has been sitting in BADGE_BONUSES ever since,
-- paying +1 Might and +2 Crit to the holders of a badge that has no row, no rule, and no way to be earned.
--
-- The honest fix is not an allowlist in the gate. It is to make the record say what actually happened: the row
-- is gone. Then the gate replays the DELETE like it replays every other retirement, the bonus comes out of the
-- code, and the eight casino badges in the comment above it are eight again.
--
-- A no-op against production, where the row is already absent. It is written for the history and for any
-- database rebuilt from these files.
DELETE FROM mkt_badge WHERE slug = 'casino_called_it';
DELETE FROM mkt_user_badge WHERE badge_slug = 'casino_called_it';
