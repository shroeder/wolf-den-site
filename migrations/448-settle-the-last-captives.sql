-- ── THE MEN WHO WERE STILL BELOW DECKS WHEN THE MINIGAME WAS DELETED ─────────────────────────────────────────
-- 447 took the interrogation out. Anyone holding a captive at that moment was holding him for a screen that no
-- longer exists: the ship was beaten, the capture happened, and the chart it was supposed to buy was behind a
-- panel that is gone. Leaving those rows would be taking a reward away for a change of design.
--
-- So every still-held captain hands over his chart now, at his own star, exactly as he would if he were taken
-- today — and is marked ended, because nothing is ever done to a captain after he talks.
--
-- The band bounds are CHART_BANDS in captains.js, said in SQL because a migration cannot import it. They are
-- four values that have not moved since the feature was written; if they ever do, this file is history and
-- does not follow.
INSERT INTO mkt_ship_chart (buyer_id, grade, band)
SELECT buyer_id,
       LEAST(5, GREATEST(1, stars)),
       CASE WHEN stars >= 5 THEN 'certainty'
            WHEN stars >= 4 THEN 'reckoning'
            WHEN stars >= 2 THEN 'bearing'
            ELSE 'sounding' END
  FROM mkt_ship_captive
 WHERE status = 'held' AND ended_at IS NULL;

UPDATE mkt_ship_captive
   SET status = 'broken', ended_at = NOW()
 WHERE status = 'held' AND ended_at IS NULL;
