-- ── GIVING BACK THE ROADS THE SEASON TOOK TOO EARLY ──────────────────────────────────────────────────────────
-- Luke: "did we reset the ladder already, I thought it was only owner gated."
--
-- It was owner gated, and the reset was not. `rollRoadSeason` hangs off `arenaRow`, the base read for the whole
-- arena — a challenge, the Gauntlet, a plaza skirmish, the nav badge. `roadOpenFor` stops a member WALKING a
-- rung; nothing at all stood in front of the clear. So the moment seasons deployed, every member who opened the
-- arena for any reason had their Road emptied for a season they cannot see. Twenty of them, over about twenty
-- hours: Eric D at rung 100, JT at 86, Kaishiern at 72, GrayKitsune at 70.
--
-- WHY THIS IS RECOVERABLE AT ALL. The archive deliberately keeps the COUNT and not the set (see 416 — two
-- places to read "may I fight this rung" from is the bug that made ladder_beaten authoritative). The set is
-- reconstructable anyway because `beaten = best_rung` for all 21 rows: the Road only unlocks the next rung when
-- the one under it falls, so a climb is always 1..N with no holes. Verified on the live rows before writing
-- this, and asserted again below rather than trusted — if a non-contiguous row ever exists, this migration
-- leaves it alone rather than inventing rungs for it.
--
-- THE OWNER IS NOT RESTORED. That account is deliberately in season 1 testing the thing, seven rungs in, and
-- its archive row is a real record rather than an accident.
--
-- road_best_rung is untouched throughout: it only ever goes up and it is already correct.

-- Put the rungs back, exactly as far as the archive says the climb went.
UPDATE mkt_arena a
   SET ladder_beaten = ARRAY(SELECT generate_series(1, s.best_rung)),
       road_season   = 0
  FROM mkt_arena_road_season s
 WHERE s.buyer_id = a.buyer_id
   AND s.season = 0
   AND s.beaten = s.best_rung          -- contiguous, so 1..N is the true set and not a guess
   AND s.best_rung > 0
   AND a.road_season = 1
   AND COALESCE(array_length(a.ladder_beaten, 1), 0) = 0   -- never overwrite a set they have since rebuilt
   AND a.buyer_id <> (SELECT id FROM mkt_buyer WHERE email = 'deagle.shroeder@gmail.com');

-- The five who rolled with nothing in their set lost no rungs, but they carry the season-1 stamp, which would
-- make them skip the real rollover when the season opens. Unstamp them too.
UPDATE mkt_arena
   SET road_season = 0
 WHERE road_season = 1
   AND COALESCE(array_length(ladder_beaten, 1), 0) = 0
   AND buyer_id <> (SELECT id FROM mkt_buyer WHERE email = 'deagle.shroeder@gmail.com');

-- And drop the archive rows this wrote by mistake, so that when season 1 genuinely opens the rollover writes
-- the real closing figure. A row saying "closed at rung 100" for a season the member never played would sit in
-- the trophy room forever.
DELETE FROM mkt_arena_road_season s
 WHERE s.season = 0
   AND s.buyer_id <> (SELECT id FROM mkt_buyer WHERE email = 'deagle.shroeder@gmail.com')
   AND EXISTS (SELECT 1 FROM mkt_arena a
                WHERE a.buyer_id = s.buyer_id AND a.road_season = 0);
