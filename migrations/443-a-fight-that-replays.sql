-- ── DID THE FIGHT ACTUALLY HAPPEN ────────────────────────────────────────────────────────────────────────
-- The card engine runs in the browser and the run route now replays every claimed win through it server-side
-- (verifyWin). While that verifier is in shadow -- counting disagreements rather than rejecting them, because
-- a verifier that rejects honest players is worse than no verifier -- the count has to land somewhere a single
-- query can read.
--
-- `unverified` is how many rooms in this run did not replay to the health they claimed. Zero is the answer for
-- every honest run. Anything else is either somebody walking the map without fighting, or the replay drifting
-- from the animation loop the screen steps by hand -- and `unverified_why` says which, in the replay's own
-- words ("foes_alive", "illegal_play", "hp 62 vs 48").
--
-- When this column is quiet across real traffic, the count in the route becomes a 400 and this becomes history.
ALTER TABLE mkt_cards_result ADD COLUMN IF NOT EXISTS unverified SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE mkt_cards_result ADD COLUMN IF NOT EXISTS unverified_why TEXT;

-- Partial, because the only rows anybody will ever look for here are the ones that failed.
CREATE INDEX IF NOT EXISTS mkt_cards_result_unverified
    ON mkt_cards_result (buyer_id, ended_at DESC) WHERE unverified > 0;
