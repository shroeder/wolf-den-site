import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";
import { checkTownQuestBadges } from "@/lib/marketplace/town-badges.js";

// Daily TOWN quests handed out by the Quartermaster NPC — bounties that reward playing in the plaza itself
// (fighting raids, being social, funding the town, visiting the tavern). Progress ticks from the town actions;
// claim the reward from the NPC. Modest gold rewards (admin-controlled economy — not a firehose).
export const TOWN_QUESTS = [
    { key: "rally", label: "Rally the Plaza", desc: "Land 15 hits on a town raid", target: 15, gold: 150, emoji: "⚔️" },
    { key: "social", label: "Good Neighbor", desc: "Send 5 chats or emotes in town", target: 5, gold: 80, emoji: "💬" },
    { key: "civic", label: "Civic Duty", desc: "Chip in to the plaza fund", target: 1, gold: 100, emoji: "🏗️" },
    { key: "patron", label: "Tavern Patron", desc: "Grab your daily pint at the tavern", target: 1, gold: 60, emoji: "🍺" },
];
const QUEST_BY_KEY = Object.fromEntries(TOWN_QUESTS.map((q) => [q.key, q]));
const DAY = "(NOW() AT TIME ZONE 'America/Chicago')::date";

// Advance a member's town-quest progress (capped at target). Best-effort; called from the town actions.
export async function bumpTownQuest(buyerId, key, n = 1) {
    const q = QUEST_BY_KEY[key];
    if (!buyerId || !q) return;
    await db.query(
        `INSERT INTO mkt_town_quest (buyer_id, day, key, progress) VALUES ($1, ${DAY}, $2, LEAST($3, $4))
         ON CONFLICT (buyer_id, day, key) DO UPDATE SET progress = LEAST(mkt_town_quest.progress + $3, $4)`,
        [buyerId, key, n, q.target]
    ).catch(() => {});
}

// Today's quests for a member with progress + claim state.
export async function getTownQuests(buyerId) {
    if (!buyerId) return [];
    const rows = await db.query(`SELECT key, progress, claimed FROM mkt_town_quest WHERE buyer_id = $1 AND day = ${DAY}`, [buyerId]).catch(() => []);
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    return TOWN_QUESTS.map((q) => {
        const progress = Math.min(q.target, by[q.key]?.progress || 0);
        return { ...q, progress, claimed: Boolean(by[q.key]?.claimed), done: progress >= q.target };
    });
}

// How many quests are done-and-unclaimed (for the NPC "!" badge).
export async function townQuestsClaimable(buyerId) {
    return (await getTownQuests(buyerId)).filter((q) => q.done && !q.claimed).length;
}

// Claim a completed quest's gold. Atomic flip so it can't be double-claimed.
export async function claimTownQuest(buyerId, key) {
    const q = QUEST_BY_KEY[key];
    if (!buyerId || !q) return { ok: false, error: "unknown" };
    const claimed = await db.queryOne(
        `UPDATE mkt_town_quest SET claimed = TRUE WHERE buyer_id = $1 AND day = ${DAY} AND key = $2 AND progress >= $3 AND claimed = FALSE RETURNING key`,
        [buyerId, key, q.target]
    ).catch(() => null);
    if (!claimed) return { ok: false, error: "not_ready" };
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, q.gold]).catch(() => null);
    await logCoin(buyerId, q.gold, "town_quest", { balanceAfter: paid?.gold, meta: { key } }).catch(() => {});
    checkTownQuestBadges(buyerId).catch(() => {}); // Taskmaster (lifetime claimed quests)
    return { ok: true, gold: Number(paid?.gold || 0), reward: q.gold, label: q.label };
}
