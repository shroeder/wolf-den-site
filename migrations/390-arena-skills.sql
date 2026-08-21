-- ── THE SKILL PANEL ──────────────────────────────────────────────────────────────────────────────────────────
-- Three skills a class, three branches of three inside each, and one bag to hold what a member has bought.
--
-- SHAPE: { skillId: [nodeId, ...] }. A skill present in the bag is UNLOCKED; the array is which of its nine
-- nodes are held. An absent skill is locked. That is deliberately not { skillId: true } plus a separate node
-- list — one structure means a skill cannot be unlocked-with-orphaned-nodes or nodes-without-a-skill, which are
-- the two states that would need reconciling forever if they could exist.
--
-- Not a new table, for the same reason skill_tree is not one: it is read on every single arena request, always
-- for exactly one member, and never joined or aggregated. A row read that is already happening beats a join
-- that is not.
--
-- buyer_id is UUID here as everywhere in mkt_arena — see the note on migration 330 about the BIGINT that
-- failed the Vercel build, because local builds never run migrations and production is the first place it
-- shows up.
ALTER TABLE mkt_arena ADD COLUMN IF NOT EXISTS skills JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ── AND A PLACE TO PUT A FIGHT THAT IS BEING PLAYED ──────────────────────────────────────────────────────────
-- bout_json already holds the bout. What it has never held is a fight that is PART WAY THROUGH: combat was
-- turn-based once and the whole turn loop was deleted, then combat was passive and a bout was resolved the
-- instant it was built, so `bout_json` has only ever contained a finished transcript.
--
-- The ring is the live fighter state — both sides' hp, shields, wounds, burns, cooldowns, the clock — and it
-- rides inside bout_json under `ring` rather than in a column of its own, so every path that already loads,
-- saves, clears or expires a bout carries it without knowing it exists. There is exactly one bout per member
-- and it is already the thing being read; a second column would be a second thing to remember to clear.
--
-- This migration therefore adds nothing for it. The comment is here because the next person looking for where
-- a half-finished fight lives will look at the schema first, and the answer is "inside the JSON you are
-- already reading".
COMMENT ON COLUMN mkt_arena.skills IS
    'Skill panel allocation: { skillId: [nodeId, ...] }. Present = unlocked. See arena-skills.js.';
