-- ── THE FOUR WHO BOUGHT DURING THE FREE WINDOW ───────────────────────────────────────────────────────────────
-- mig413 emptied every skill path so the whole Den would re-pick under one rule: one branch per skill, twelve
-- points, one every other level. It shipped at 01:45 with unlocking FREE, and at 09:16 unlocking went back to
-- costing a point — which is what makes the arithmetic land (3 unlocks + 9 nodes = 12 = the climb to level 24).
--
-- Four members re-picked inside that window. Their builds did not change; the price of them did. Holding three
-- skills and N nodes cost N that morning and costs N+3 now, so each of them is carrying three points they never
-- earned:
--
--   GrayKitsune  level 19, earned 9, holding 12     Nicholas  level 16, earned 8, holding 11
--   Agent420     level 15, earned 7, holding 10     David B   level 13, earned 6, holding  9
--
-- Nothing was broken by it — skillPointsFor clamps available to zero rather than going negative — but it is
-- three nodes the rest of the Den had to climb for, handed out by a rule that existed for seven hours. Luke's
-- call: reset them, and have the Arbiter say why.
--
-- SAME TREATMENT THE OTHER 27 GOT. The node arrays empty and the skills stay, so nobody re-unlocks anything and
-- nobody loses a skill off their bar. What they choose again is the path — this time against a budget that is
-- actually theirs. They keep every level, every laurel and every point they earned.
--
-- ── WHY THIS IS GUARDED RATHER THAN A LIST OF FOUR IDS ───────────────────────────────────────────────────────
-- A migration runs at deploy, not at the moment it is written, and a member who levels up in between stops
-- being over budget. So this recomputes the budget from arena_xp at RUN TIME and touches only rows that are
-- still over it: if all four have levelled by the time this lands, it changes nothing and that is correct.
--
-- The thresholds below are the arena XP curve (ARENA_XP_BASE 120, growth 1.28) evaluated at each level where
-- the point count changes, generated from arena-classes.js rather than typed, and the unlock price is
-- SKILL_UNLOCK_COST = 1. They are frozen here because a migration is a record of what was
-- true when it ran; the live rule stays in the JS.
UPDATE mkt_arena a
   SET skills = (
        SELECT jsonb_object_agg(k, '[]'::jsonb)
          FROM jsonb_object_keys(a.skills) AS k
   )
 WHERE a.skills IS NOT NULL
   AND a.skills <> '{}'::jsonb
   -- what the build costs today: one per skill unlocked, plus one per node held
   AND (
        (SELECT COUNT(*) FROM jsonb_object_keys(a.skills)) * 1
      + (SELECT COALESCE(SUM(jsonb_array_length(v)), 0)
           FROM jsonb_each(a.skills) AS e(k, v)
          WHERE jsonb_typeof(v) = 'array')
       ) > (
        -- what the climb has actually paid them
        CASE
            WHEN COALESCE(a.arena_xp, 0) >= 124845 THEN 12
            WHEN COALESCE(a.arena_xp, 0) >= 97442 THEN 11
            WHEN COALESCE(a.arena_xp, 0) >= 59307 THEN 10
            WHEN COALESCE(a.arena_xp, 0) >= 36032 THEN 9
            WHEN COALESCE(a.arena_xp, 0) >= 21826 THEN 8
            WHEN COALESCE(a.arena_xp, 0) >= 13155 THEN 7
            WHEN COALESCE(a.arena_xp, 0) >= 7863 THEN 6
            WHEN COALESCE(a.arena_xp, 0) >= 4633 THEN 5
            WHEN COALESCE(a.arena_xp, 0) >= 2661 THEN 4
            WHEN COALESCE(a.arena_xp, 0) >= 1457 THEN 3
            WHEN COALESCE(a.arena_xp, 0) >= 723 THEN 2
            WHEN COALESCE(a.arena_xp, 0) >= 274 THEN 1
            ELSE 0
        END
   );
