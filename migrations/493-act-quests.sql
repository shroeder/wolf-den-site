-- ── THE ACT QUEST BOARDS ────────────────────────────────────────────────────────────────────────────────────
-- The ramp that replaces the onboarding guide: a short ordered ladder per act, posted on a board in that act's
-- town, teaching the systems that act just unlocked.
--
-- ⚠️ TWO TABLES, AND NEITHER OF THEM HOLDS PROGRESS. Progress is a COUNT over mkt_activity_event, which the
-- game has been writing for months — mine_trip, ore_smelted, craft_enhance, plant_seed, cooked, fish_caught,
-- delve_clear, arena_win. A counter bumped from twenty call sites is twenty places that can drift; a query
-- over an event log cannot, and adding a quest then touches no game code at all.
--
-- So all that is stored is what a player has CLAIMED, and what that claim paid them.

-- One row per claimed rung. The absence of a row is "not claimed yet" — there is no pending state to keep in
-- step, because the count is always re-derivable.
CREATE TABLE IF NOT EXISTS mkt_act_quest (
    buyer_id    uuid        NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    quest_key   text        NOT NULL,
    act_n       smallint    NOT NULL,
    claimed_at  timestamptz NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, quest_key)
);

-- The perks those claims bought, summed per slot.
--
-- ⚠️ A SLOT, NOT A STAT, AND THAT IS THE WHOLE DESIGN. groveToolPct(buyerId, slot) is already read by arena,
-- boss, cooking, crafting, delves, delve-floors, mining, farm, fishing and sailing. Act perks are summed into
-- that same answer, so every one of those systems picks them up with no new wiring and the game does not grow
-- a fifth per-player stat source for somebody to forget to read.
CREATE TABLE IF NOT EXISTS mkt_act_perk (
    buyer_id uuid NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    slot     text NOT NULL,
    pct      integer NOT NULL DEFAULT 0,
    PRIMARY KEY (buyer_id, slot)
);

COMMENT ON TABLE mkt_act_quest IS 'Claimed act-quest rungs. Progress is counted from mkt_activity_event, never stored.';
COMMENT ON TABLE mkt_act_perk  IS 'Passive per-system percentages bought by act quests. Summed into groveToolPct.';
