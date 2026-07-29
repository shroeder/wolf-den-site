import "server-only";

import { db } from "@/lib/db";
import { grantEventBadge } from "@/lib/marketplace/badges.js";

// ── TOWN & RAID BADGES ──────────────────────────────────────────────────────────────────────────────────────
// Hard-to-earn SECRET achievement badges spanning every Town system: live raids, the Golem boss, the tavern
// (pints + dice), civic Town Development, the Wishing Well, the Traveling Merchant, and daily Town quests.
// All are granted imperatively here — each check reads the member's cumulative counter and grants any newly
// cleared threshold. grantEventBadge is idempotent (ON CONFLICT DO NOTHING) and only pays out on a genuinely
// new grant, so these are safe to call as often as we like (e.g. every raid, every claim).

const num = (v) => Number(v) || 0;

// RAIDS — raids joined, blows landed, total damage dealt, and Golem boss kills you took part in. On a boss KILL,
// pass topDamagerOnKill for the single member who topped the damage board to hand them the prestige badge.
export async function checkTownRaidBadges(buyerId, { topDamagerOnKill = false } = {}) {
    if (!buyerId) return;
    const agg = await db.queryOne(
        `SELECT COUNT(*)::int AS raids, COALESCE(SUM(hits),0)::int AS blows, COALESCE(SUM(damage),0)::bigint AS dmg
           FROM mkt_town_event_hit WHERE buyer_id = $1`, [buyerId]
    ).catch(() => null);
    const raids = num(agg?.raids), blows = num(agg?.blows), dmg = num(agg?.dmg);
    if (raids >= 5) await grantEventBadge(buyerId, "town_raider").catch(() => {});
    if (raids >= 25) await grantEventBadge(buyerId, "town_veteran").catch(() => {});
    if (raids >= 75) await grantEventBadge(buyerId, "town_warlord").catch(() => {});
    if (blows >= 100) await grantEventBadge(buyerId, "town_brawler").catch(() => {});
    if (blows >= 500) await grantEventBadge(buyerId, "town_berserker").catch(() => {});
    if (dmg >= 100000) await grantEventBadge(buyerId, "town_juggernaut").catch(() => {});
    const bossKills = num((await db.queryOne(
        `SELECT COUNT(*)::int AS n FROM mkt_town_event e JOIN mkt_town_event_hit h ON h.event_id = e.id
          WHERE h.buyer_id = $1 AND e.status = 'defeated' AND (e.meta->>'boss') = 'true'`, [buyerId]
    ).catch(() => null))?.n);
    if (bossKills >= 1) await grantEventBadge(buyerId, "golem_slayer").catch(() => {});
    if (bossKills >= 5) await grantEventBadge(buyerId, "golem_bane").catch(() => {});
    if (topDamagerOnKill) await grantEventBadge(buyerId, "town_topdog").catch(() => {});
}

// TAVERN — pints downed at the bar + dice hands played.
export async function checkTavernBadges(buyerId) {
    if (!buyerId) return;
    const row = await db.queryOne(`SELECT drinks, dice_rolls FROM mkt_tavern WHERE buyer_id = $1`, [buyerId]).catch(() => null);
    const drinks = num(row?.drinks), rolls = num(row?.dice_rolls);
    if (drinks >= 30) await grantEventBadge(buyerId, "tavern_regular").catch(() => {});
    if (rolls >= 100) await grantEventBadge(buyerId, "dice_devil").catch(() => {});
    if (rolls >= 500) await grantEventBadge(buyerId, "dice_king").catch(() => {});
}

// CIVIC — total gold poured into Town Development projects.
export async function checkTownContribBadges(buyerId) {
    if (!buyerId) return;
    const total = num((await db.queryOne(`SELECT COALESCE(SUM(amount),0)::bigint AS g FROM mkt_town_project_gift WHERE buyer_id = $1`, [buyerId]).catch(() => null))?.g);
    if (total >= 10000) await grantEventBadge(buyerId, "town_patron").catch(() => {});
    if (total >= 100000) await grantEventBadge(buyerId, "town_benefactor").catch(() => {});
}

// WISHING WELL — daily claims (each logs a `wishing_well` coin event).
export async function checkWellBadges(buyerId) {
    if (!buyerId) return;
    const n = num((await db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_coin_event WHERE buyer_id = $1 AND reason = 'wishing_well'`, [buyerId]).catch(() => null))?.n);
    if (n >= 25) await grantEventBadge(buyerId, "well_wisher").catch(() => {});
    if (n >= 100) await grantEventBadge(buyerId, "fountain_faithful").catch(() => {});
}

// TRAVELING MERCHANT — high-roller gambles + a legendary jackpot (pass jackpot on a Tier-4 win).
export async function checkMerchantBadges(buyerId, { jackpot = false } = {}) {
    if (!buyerId) return;
    const n = num((await db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_coin_event WHERE buyer_id = $1 AND reason = 'merchant_gamble'`, [buyerId]).catch(() => null))?.n);
    if (n >= 50) await grantEventBadge(buyerId, "high_stakes").catch(() => {});
    if (jackpot) await grantEventBadge(buyerId, "merchant_jackpot").catch(() => {});
}

// DAILY TOWN QUESTS — lifetime claimed count.
export async function checkTownQuestBadges(buyerId) {
    if (!buyerId) return;
    const n = num((await db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_town_quest WHERE buyer_id = $1 AND claimed = TRUE`, [buyerId]).catch(() => null))?.n);
    if (n >= 50) await grantEventBadge(buyerId, "town_taskmaster").catch(() => {});
}
