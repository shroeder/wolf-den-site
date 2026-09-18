import "server-only";

import { db } from "@/lib/db";

// ── THE PRISMATIC STONE DROP ─────────────────────────────────────────────────────────────────────────────────
// Luke: "it's like a rare drop from any activity that you can do in the game, but it's very rare. It should be
// something that like only one person from the den would get like every five days."
//
// So this hangs off trackActivity — the one thing every feature in the game already calls — rather than being
// wired into fishing and mining and sailing and the arena one at a time. A feature added next month drops
// stones on the day it ships, without anybody remembering this file exists.
//
// ── WHY THE RATE IS PER MEMBER PER DAY AND NOT PER ACTION ────────────────────────────────────────────────────
// A flat per-action chance is the obvious way to build this and it is the wrong one, measured on 14 days of
// real activity (85,845 events, 53 members):
//
//   · the top five members fire 47% OF ALL ELIGIBLE ACTIONS. Uncapped, they would take roughly half of every
//     stone the Den ever finds, and "one person every five days" would mean the same five people.
//   · the MEDIAN member logs 14 eligible actions per FORTNIGHT. Against a whale at 6,488 that is a 460x
//     difference in odds for the rarest item in the game.
//
// A per-member daily cap fixes both without touching anyone who plays normally. At 25 rolls a day the top
// five drop from 47% of the rolls to 23%, and the median member never comes close to the cap — it is
// invisible to everybody except the grind it exists to stop. The Den-wide rate then tracks HOW MANY PEOPLE
// PLAYED rather than how hard the busiest one ground, which is what Luke's sentence actually describes.
export const ROLLS_PER_DAY = 25;

// 458 capped rolls a day across the Den, measured over 14 days. One stone per five days is one per 2,290
// rolls. Change ROLLS_PER_DAY or the block list below and this number is wrong — re-measure, do not guess.
export const STONE_ODDS = 1 / 2290;

// ── WHAT DOES NOT COUNT AS "AN ACTIVITY YOU CAN DO" ──────────────────────────────────────────────────────────
// A block list rather than an allow list, deliberately: there are 159 event types and new ones land most
// weeks, and the one somebody forgot to add to an allow list would be the feature that silently never drops.
// "Any activity" should mean any activity, so the default is to count.
//
// Three families are excluded, each for its own reason:
//
//   LOOKING IS NOT DOING — page views and the view_* screens. Otherwise refreshing the inventory is the best
//   stone farm in the game, and it is also the one that takes no effort at all.
//
//   ONE DEED IS ONE ROLL — arena_start already logged the fight, so arena_win and arena_loss would pay the
//   same bout twice; the same goes for every start/finish pair (ship_battle/ship_battle_end,
//   delve_start/delve_clear, fish_monster/fish_monster_won, mine_trip/mine_surface). Equipping and
//   rearranging are not deeds either.
//
//   THE CASINO IS A SINK — 6,551 plays in 14 days from 21 members, the single largest non-page-view event in
//   the game and the cheapest to repeat. Counting it would make a slot machine the optimal way to chase the
//   rarest item in the Den. The gold mint excludes the casino for exactly this reason and this follows it.
const NOT_AN_ACTIVITY = new Set([
    // looking
    "page_view", "view_inventory", "view_boss", "view_shop", "view_profile", "view_leaderboard", "view_bounties",
    "view_sets", "view_compendium", "view_creations", "view_vendor", "browse_shop", "shop_search", "shop_filter",
    "inspect_item", "share_location",
    // the casino
    "casino_play", "casino_prize", "casino_perk", "casino_buy", "casino_vip_enter",
    // the other half of a deed already counted
    "arena_win", "arena_loss", "ship_battle_end", "delve_clear", "delve_end", "tavern_gambit_start",
    "fish_monster_won", "fish_missed", "spin_bonus_dupe", "spin_bonus_win", "bounty_win", "bounty_complete",
    "mine_surface", "referral_landed", "referral_attached", "auction_sold", "pet_share_accept", "friend_accept",
    "trade_accept", "captain_broken", "badge_milestone", "pet_level_up",
    // housekeeping
    "equip", "unequip", "arrange_deco", "place_deco", "equip_pet",
    // and the stone's own arrival, which must never be able to pay for itself
    "prismatic_found", "ascend_item",
]);

export const countsForPrismatic = (event) => Boolean(event) && !NOT_AN_ACTIVITY.has(String(event));

/**
 * One roll for a Prismatic Stone, off the back of something the member actually did.
 *
 * Best-effort in every direction — it is called from trackActivity, which must never be able to fail the
 * action it is logging. Returns true only when a stone was actually granted.
 */
export async function rollPrismaticStone(buyerId, event) {
    if (!buyerId || !countsForPrismatic(event)) return false;

    // The day key is the CHICAGO calendar date, not the server's. Written as a stored key rather than compared
    // against a timestamp — the comparison form of this is the one that quietly rolls over at 7pm.
    const row = await db.queryOne(
        `INSERT INTO mkt_prismatic_roll (buyer_id, day, rolls)
         VALUES ($1, (NOW() AT TIME ZONE 'America/Chicago')::date, 1)
         ON CONFLICT (buyer_id, day) DO UPDATE SET rolls = mkt_prismatic_roll.rolls + 1
         RETURNING rolls`,
        [buyerId]
    ).catch(() => null);
    if (!row) return false;
    if (Number(row.rolls) > ROLLS_PER_DAY) return false;

    if (Math.random() >= STONE_ODDS) return false;

    // Granted through the shared consumable path so the stash, the Forge shelf and the stack count all behave
    // exactly as they do for anything else a member holds.
    const { grantConsumable } = await import("@/lib/marketplace/consumables.js");
    await grantConsumable(buyerId, "prismatic_stone", 1);

    await db.query(
        `INSERT INTO mkt_activity_event (buyer_id, event, meta) VALUES ($1, 'prismatic_found', $2)`,
        [buyerId, JSON.stringify({ from: String(event).slice(0, 40) })]
    ).catch(() => {});

    // ── AND THE DEN HEARS ABOUT IT ───────────────────────────────────────────────────────────────────────
    // A drop this rare is worth almost nothing to the game if it happens silently in one person's stash. The
    // whole Den seeing it about once a week is what makes it a thing people want — and it is how anybody
    // learns the stone exists at all, since it is in no shop and no drop table anyone can read.
    const { postSystemChat } = await import("@/lib/marketplace/system-chat.js");
    const me = await db.queryOne(
        `SELECT COALESCE(NULLIF(display_name,''), alias) AS name FROM mkt_buyer WHERE id = $1`, [buyerId]
    ).catch(() => null);
    if (me?.name) {
        await postSystemChat(
            `${me.name} turned up a Prismatic Stone. One piece of their gear is about to become Ascendant.`,
            "milestone"
        ).catch(() => {});
    }
    return true;
}
