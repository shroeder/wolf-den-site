-- ── ONE PATH PER SKILL, SO EVERYONE RE-PICKS ─────────────────────────────────────────────────────────────────
-- Every skill is three branches of three nodes, written as an argument between three ways to use it —
-- Retribution's are "bank it all, spend it once", "answer often, and stop them", and "the answer puts you back
-- together" — with numbers that contradict each other on purpose: the Ledger capstone adds a turn of cooldown,
-- the Punish branch takes two away.
--
-- Nothing enforced the choice. The only rule was a tier gate WITHIN a branch, which orders a path without
-- limiting you to one, so every skill converged on its maximal form. JT's Retribution held all nine nodes and
-- all three capstones: grudge 1.30 on a three-turn cooldown that also froze, shielded, pierced 40% of armour
-- and healed him to full — 5,013 off a 580 damage stat, into a 2,490 health pool.
--
-- Two things change together, so the reset is not optional:
--   1. a member may now hold nodes in ONE branch per skill (arena-progress.js)
--   2. the budget is nine points, one every other level, unlocks free (arena-skills.js)
--
-- 24 of the 27 members holding skills span more than one branch, and everyone past level 18 spent more than
-- nine points — JT spent 21. Leaving those bags alone would grandfather the exact builds this is meant to end,
-- forever, while everyone who comes later gets nine. So every node comes off.
--
-- WHAT IS KEPT: the skills themselves. The keys stay and only the node arrays empty, so nobody has to re-unlock
-- anything (which is free now anyway) and nobody loses a skill from their bar. What they choose again is the
-- path — three decisions, one per skill.
UPDATE mkt_arena a
   SET skills = x.reset
  FROM (
    SELECT m.buyer_id, jsonb_object_agg(k, '[]'::jsonb) AS reset
      FROM mkt_arena m, LATERAL jsonb_object_keys(m.skills) AS k
     WHERE m.skills IS NOT NULL AND m.skills <> '{}'::jsonb
     GROUP BY m.buyer_id
  ) x
 WHERE a.buyer_id = x.buyer_id;
