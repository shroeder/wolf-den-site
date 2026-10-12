-- ── AZTHEKU COMES DOWN TO 2,000,000,000 ────────────────────────────────────────────────────────────────
-- Luke: "We were too aggressive woth boss hp, make it 2 billion."
--
-- He is right about the shape of it. The pack is 161 members doing ~81,000,000 a day and climbing, and at
-- 6,651,370,000 the fight needed another SIXTY days — against a ten-day window that had already expired
-- (ends_at was 2026-10-12 05:03 and is informational only; the boss lives until its HP hits 0, so nothing
-- was going to stop it, it was simply never going to end).
--
-- ⚠️ THE DAMAGE DEALT IS PRESERVED, NOT THE FRACTION. THIS IS THE WHOLE POINT OF THIS FILE.
--
-- On 2026-10-03 this same boss was rescaled by multiplying hp and max_hp TOGETHER. That preserves the
-- fraction remaining, which is the intuitive thing to do and is wrong: it multiplies the damage ALREADY
-- DEALT by the same factor. 93,470,006 of real damage became 934,700,060 of progress, the bar ran
-- 841,230,054 ahead of the leaderboard for nine days, and GrayKitsune found it from the outside because the
-- two numbers could not be added up. See 476-boss-carried-damage.sql for the whole of that.
--
-- So this one computes the new HP from the DAMAGE, in a single statement so no swing can land between the
-- read and the write:
--
--     dealt  = max_hp - hp          (1,564,913,306 as of writing: 723,683,252 real + 841,230,054 carried)
--     new hp = 2,000,000,000 - dealt
--
-- Every member's contribution stays worth exactly what it was worth this morning. Nobody's progress moves.
--
-- ⚠️ AND hp_carried IS NOT CLEARED. It would be tempting while rescaling anyway — the phantom is 42% of the
-- new bar rather than 13% of the old one — but taking it back now would add 841M to a boss everyone already
-- says takes too long, and the Arbiter said in the plaza, in as many words, that nobody is losing that
-- progress. Reversing that quietly is exactly the complaint the Den made this afternoon. It stays, and the
-- bar goes on accounting for it out loud.
--
-- Result: 435,086,694 of 2,000,000,000 left, 21.8%, about five more days at the current rate.
--
-- Guarded on the exact pre-change figure so it cannot apply twice or land on a later boss.
UPDATE boss_event
   SET max_hp = 2000000000,
       hp     = GREATEST(0::bigint, 2000000000::bigint - (max_hp - hp))
 WHERE name   = 'Aztheku, Void-Maw'
   AND status = 'live'
   AND max_hp = 6651370000;
