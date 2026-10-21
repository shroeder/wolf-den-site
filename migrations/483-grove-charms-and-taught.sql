-- ── CHARMS, AND A RECIPE A BOSS HAS TO TEACH YOU ─────────────────────────────────────────────────────────────
-- Luke, asked whether Grove crafting still lacks "variety, excitement, engagement, suprise, wonder, fun,
-- progression, meaningfulness": the honest read was that three of every four crafts rolled nothing at all,
-- and that no NEW KIND of object is ever introduced after map one. Packs, vaults, plots and decorations are
-- all capped and all authored in map one; everything after it is the same twelve tools in a new vocabulary.
--
-- Two things land here. Both are deliberately Grove-internal: nothing below can touch a combat stat, because
-- stat ceilings are still an open question in the design doc and a twelfth ladder that adds damage would
-- have to be priced against a ceiling nobody has set.

-- ── THE CHARMS A PLAYER IS HOLDING ───────────────────────────────────────────────────────────────────────────
-- A charm is CONSUMED, which is the whole point of it: the bench has never had a reason to be visited twice
-- for the same recipe, and a one-time climb cannot be a loop. One per map, crafted from that map's parts.
--
-- ⚠️ THE BAND IS PART OF THE KEY, NOT A COLUMN ON A STACK. Two charms rolled Rough and Pristine are not
-- interchangeable and must not merge into one pile of two -- the roll is the reason to craft another one.
--
-- ⚠️ AND THE KEY IS THE BAND, NOT THE 0-100 SCORE. The first cut keyed on the raw roll, which looked more
-- faithful and was worse: charmValue multiplies by the BAND and nothing else, so a 73 and an 80 are both
-- Fine and both pay +12.2%. Keyed on the score, a player holding two of them saw two separate rows,
-- identical in name, in word and in number, and had to choose between them. Fragmentation with no
-- difference behind it -- and after a season of crafting, forty rows of one charm.
--
-- The same rule the rework card already follows: "improved means the band moved, not the score". The exact
-- roll is not lost either way; mkt_grove_craft_log keeps every one of them.
CREATE TABLE IF NOT EXISTS mkt_grove_charm (
    buyer_id    uuid    NOT NULL,
    charm_id    text    NOT NULL,
    band        text    NOT NULL,
    qty         int     NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, charm_id, band)
);

-- ── THE ONE BURNING RIGHT NOW ────────────────────────────────────────────────────────────────────────────────
-- ⚠️ SPENT AT THE MOUTH OF A ZONE AND GOOD FOR THAT RUN, NOT FOR N KILLS. The drop roll runs on BOTH sides --
-- the scene rolls it live so the player watches the part fall, the server replays it at settle -- off one
-- bonus bundle handed over at enter. A charm that expired mid-session would change that bundle underneath a
-- client already holding the old one, and the two streams would diverge: a drop watched and never received.
-- Tying it to the session makes divergence structurally impossible, and makes the charm a decision taken at
-- the door rather than a buff ticking down in a corner.
ALTER TABLE mkt_grove_player ADD COLUMN IF NOT EXISTS charm_id   text;
ALTER TABLE mkt_grove_player ADD COLUMN IF NOT EXISTS charm_band text;

-- ── WHAT A BOSS TAUGHT YOU ───────────────────────────────────────────────────────────────────────────────────
-- The discovery gate was retired on 2026-10-18 ("I think we should see all recipes instead of the silly find
-- all to unlock"), which was right -- it hid the thing a crafting screen is for. But it also removed the last
-- way the bench could ever surprise anybody: every row is visible for ever, so nothing there can be found.
--
-- A taught recipe is the narrow version that keeps both. The bench still shows everything you can reach; a
-- charm recipe is simply not reachable until that map's boss hands it over. One kind of row, earned one way,
-- against 208 that are always visible.
--
-- An ARRAY on the player, like packs_built and plots_built beside it, rather than a table: it is a small set
-- of ids read on every state load and written a dozen times in a player's life.
ALTER TABLE mkt_grove_player ADD COLUMN IF NOT EXISTS taught text[] NOT NULL DEFAULT '{}';
