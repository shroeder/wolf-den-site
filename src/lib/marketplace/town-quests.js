import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { checkTownQuestBadges } from "@/lib/marketplace/town-badges.js";
import { isOwner } from "@/lib/marketplace/owner.js";

// Daily TOWN quests handed out by the Quartermaster NPC — bounties that reward playing in the plaza itself
// (fighting raids, being social, funding the town, the tavern, the Well, the Merchant). Progress ticks from the
// town actions; claim the reward from the NPC. Modest gold rewards (admin-controlled economy — not a firehose).
//
// The pool is grouped by ACTIVITY. Each activity's `key` is what the town actions bump (town-events raids →
// 'rally', town chat → 'social', plaza fund → 'civic', tavern → 'patron', Wishing Well → 'well', Traveling
// Merchant → 'merchant'). Keys are STABLE so progress rows always line up. Each activity has one or more
// VARIANTS (different target/reward); a rotating handful of activities is FEATURED each day, one variant apiece,
// chosen deterministically from the date so every member sees the same quests, stable for the whole day.
const QUEST_POOL = {
    rally: { emoji: "⚔️", variants: [
        { label: "Rally the Plaza", desc: "Land 15 hits on a town raid", target: 15, gold: 150 },
        { label: "Hold the Line", desc: "Land 30 hits on a town raid", target: 30, gold: 280 },
    ] },
    // NO CHAT QUEST. "Send 5 chats or emotes in town" paid 80 gold for five keystrokes and the Den chat filled
    // up with people posting the same wolf emoji five times in a row to clear it. A daily that rewards VOLUME of
    // talking buys spam, not conversation — there is no target number that doesn't. If social ever comes back it
    // has to reward something you can't grind (being replied to, being thanked), not message count.
    civic: { emoji: "🏗️", variants: [
        { label: "Civic Duty", desc: "Chip in to the plaza fund", target: 1, gold: 100 },
        { label: "Town Benefactor", desc: "Chip in to the plaza fund 3 times", target: 3, gold: 240 },
    ] },
    patron: { emoji: "🍺", variants: [
        { label: "Tavern Patron", desc: "Down your daily pint (or win a dice hand)", target: 1, gold: 60 },
        { label: "Life of the Party", desc: "Enjoy the tavern 3 times today", target: 3, gold: 140 },
    ] },
    well: { emoji: "🪙", variants: [
        { label: "Make a Wish", desc: "Toss a coin in the Wishing Well", target: 1, gold: 70 },
    ] },
    merchant: { emoji: "🧳", variants: [
        { label: "Window Shopping", desc: "Buy a chest from the Traveling Merchant", target: 1, gold: 90 },
    ] },
    harvest: { emoji: "🌾", variants: [
        { label: "Bring in the Sheaves", desc: "Harvest 5 crops on your farm", target: 5, gold: 110 },
        { label: "Full Barn", desc: "Harvest 12 crops on your farm", target: 12, gold: 220 },
    ] },
    angler: { emoji: "🎣", variants: [
        { label: "Something for the Pot", desc: "Land 3 fish", target: 3, gold: 100 },
        { label: "Full Creel", desc: "Land 8 fish", target: 8, gold: 210 },
    ] },
    // Digs are random PROCS during a voyage, not something you can decide to do — so these were written as if
    // they were. Across 207 member-days the best anyone has ever managed is 8, and the average is 1.6, which
    // made "dig 15" literally unachievable and "dig 6" a 95th-percentile day. Retuned to the real curve.
    voyage: { emoji: "⛵", variants: [
        { label: "Weigh Anchor", desc: "Dig 2 times at sea", target: 2, gold: 120 },
        { label: "Deep Water", desc: "Dig 5 times at sea", target: 5, gold: 250 },
    ] },
    slayer: { emoji: "⚔️", variants: [
        { label: "Blood on the Blade", desc: "Strike the weekly boss 3 times", target: 3, gold: 130 },
        { label: "Boss Hunter", desc: "Strike the weekly boss 8 times", target: 8, gold: 260 },
    ] },
    smith: { emoji: "🔨", variants: [
        { label: "Sparks Fly", desc: "Salvage or enhance 2 items at the Forge", target: 2, gold: 120 },
    ] },
    cook: { emoji: "🍳", variants: [
        { label: "Something on the Stove", desc: "Cook 2 dishes", target: 2, gold: 120 },
    ] },
    beastfriend: { emoji: "🐾", variants: [
        { label: "Good Company", desc: "Feed or pet your pets 3 times", target: 3, gold: 100 },
    ] },
    // The mine's three verbs. The Quartermaster could not ask for any of them before — the whole feature was
    // invisible to both quest systems because mining.js never bumped a metric.
    delver: { emoji: "🪜", variants: [
        { label: "Into the Dark", desc: "Take 6 steps down the tunnel", target: 6, gold: 130 },
        { label: "Bottom of the Shaft", desc: "Take 12 steps down the tunnel", target: 12, gold: 280 },
    ] },
    collier: { emoji: "⛏️", variants: [
        { label: "Swing a Pick", desc: "Crack open 2 seams", target: 2, gold: 120 },
        { label: "Day at the Face", desc: "Crack open 5 seams", target: 5, gold: 250 },
    ] },
    founder: { emoji: "🔥", variants: [
        { label: "Fire the Furnace", desc: "Pour 2 smelts", target: 2, gold: 120 },
        { label: "Keep It Roaring", desc: "Pour 5 smelts", target: 5, gold: 240 },
    ] },
    delver_deep: { emoji: "🗝️", variants: [
        { label: "Into the Dungeon", desc: "Clear 6 dungeon floors", target: 6, gold: 150 },
        { label: "All the Way Down", desc: "Clear 15 dungeon floors", target: 15, gold: 300 },
    ] },
    hoarder: { emoji: "🧰", variants: [
        { label: "Crack Them Open", desc: "Open 3 chests", target: 3, gold: 110 },
    ] },
};
const ACTIVITY_KEYS = Object.keys(QUEST_POOL);
const DAILY_COUNT = 5; // how many quests the Quartermaster features each day (of the pool above)
const DAY = "(NOW() AT TIME ZONE 'America/Chicago')::date";

// FNV-1a hash → a stable 32-bit number for a string. Used to seed the daily rotation deterministically.
function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}
// Today in America/Chicago as YYYY-MM-DD — matches the SQL `day` boundary used for progress rows.
function chicagoDay() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date()); }

// The activities featured today + which variant of each, chosen deterministically from the date. Everyone sees
// the same set, and it's stable for the whole Chicago day.
function dailyQuests(day, buyerId = null) {
    const order = ACTIVITY_KEYS
        .filter((k) => !QUEST_POOL[k].ownerOnly || isOwner(buyerId))
        .map((k) => ({ k, r: hashStr(day + ":" + k) }))
        .sort((a, b) => a.r - b.r)
        .map((x) => x.k);
    const chosen = order.slice(0, Math.min(DAILY_COUNT, order.length));
    return chosen.map((key) => {
        const pool = QUEST_POOL[key];
        const variant = pool.variants[hashStr(day + ":v:" + key) % pool.variants.length];
        return { key, emoji: pool.emoji, ...variant };
    });
}
function todayQuestByKey(day, buyerId = null) {
    const by = {};
    for (const q of dailyQuests(day, buyerId)) by[q.key] = q;
    return by;
}

// Advance a member's town-quest progress (capped at today's target). No-op when the activity isn't one of
// today's featured quests. Best-effort; called from the town actions.
export async function bumpTownQuest(buyerId, key, n = 1) {
    if (!buyerId) return;
    const q = todayQuestByKey(chicagoDay(), buyerId)[key];
    if (!q) return; // not featured today — nothing to tick
    await db.query(
        `INSERT INTO mkt_town_quest (buyer_id, day, key, progress) VALUES ($1, ${DAY}, $2, LEAST($3::int, $4::int))
         ON CONFLICT (buyer_id, day, key) DO UPDATE SET progress = LEAST(mkt_town_quest.progress + $3::int, $4::int)`,
        [buyerId, key, n, q.target]
    ).catch(() => {});
}

// Today's quests for a member with progress + claim state.
export async function getTownQuests(buyerId) {
    if (!buyerId) return [];
    const day = chicagoDay();
    const todays = dailyQuests(day, buyerId);
    const rows = await db.query(`SELECT key, progress, claimed FROM mkt_town_quest WHERE buyer_id = $1 AND day = ${DAY}`, [buyerId]).catch(() => []);
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    return todays.map((q) => {
        const progress = Math.min(q.target, by[q.key]?.progress || 0);
        return { ...q, progress, claimed: Boolean(by[q.key]?.claimed), done: progress >= q.target };
    });
}

// How many quests are done-and-unclaimed (for the NPC "!" badge).
export async function townQuestsClaimable(buyerId) {
    return (await getTownQuests(buyerId)).filter((q) => q.done && !q.claimed).length;
}

// Claim a completed quest's gold. Atomic flip so it can't be double-claimed. Reward is TODAY's variant.
export async function claimTownQuest(buyerId, key) {
    if (!buyerId) return { ok: false, error: "unknown" };
    const q = todayQuestByKey(chicagoDay(), buyerId)[key];
    if (!q) return { ok: false, error: "unknown" };
    const claimed = await db.queryOne(
        `UPDATE mkt_town_quest SET claimed = TRUE WHERE buyer_id = $1 AND day = ${DAY} AND key = $2 AND progress >= $3::int AND claimed = FALSE RETURNING key`,
        [buyerId, key, q.target]
    ).catch(() => null);
    if (!claimed) return { ok: false, error: "not_ready" };
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, q.gold]).catch(() => null);
    await logCoin(buyerId, q.gold, "town_quest", { balanceAfter: paid?.gold, meta: { key } }).catch(() => {});
    // The Pathfinder waits on this. Claiming a town quest had no activity event at all, so the guide step for it
    // was hung off `town_merchant` and `tavern_barkeep` — two names inherited from the old onboarding list that
    // NOTHING in the codebase has ever emitted — plus `buy_upgrade`, which is a sailing event.
    await trackActivity(buyerId, "town_quest", { key, gold: q.gold }).catch(() => {});
    checkTownQuestBadges(buyerId).catch(() => {}); // Taskmaster (lifetime claimed quests)
    return { ok: true, gold: Number(paid?.gold || 0), reward: q.gold, label: q.label };
}
