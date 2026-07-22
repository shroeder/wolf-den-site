import "server-only";

import { db } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/settings.js";
import { grantConsumable } from "@/lib/marketplace/consumables.js";
import { addChests } from "@/lib/marketplace/chests.js";
import { bumpQuestProgress } from "@/lib/marketplace/quests.js";
import { syncEarnedBadges } from "@/lib/marketplace/badges.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { awardXp } from "@/lib/marketplace/xp.js";
import { getActiveEvent, getHappyHourState, startHappyHour, invalidateEventCache, RALLY_KEY, RALLY_TRIGGER } from "@/lib/marketplace/happy-hour-core.js";

// Donate action for Happy Hour (imports the item/badge/quest systems, so it lives OUTSIDE happy-hour-core
// which the awardXp path depends on). Personal reward tiers within a live event; the rally that triggers one.
const REWARD_TIERS = [
    { at: 1000, treat: "treat_snack", label: "a Hearty Snack" },
    { at: 5000, chest: "iron", label: "an Iron chest" },
    { at: 15000, chest: "gold", treat: "treat_toy", label: "a Gold chest + Chew Toy" },
];

// Personal reward tiers crossed by going from `before` → `after` cumulative event donation.
async function grantDonationRewards(buyerId, before, after) {
    const granted = [];
    for (const t of REWARD_TIERS) {
        if (before < t.at && after >= t.at) {
            if (t.treat) await grantConsumable(buyerId, t.treat, 1).catch(() => {});
            if (t.chest) await addChests(buyerId, { [t.chest]: 1 }).catch(() => {});
            granted.push(t.label);
        }
    }
    return granted;
}

// A member donates gold. During a live event it raises the multiplier pool + can hit personal reward tiers;
// with no event it feeds the RALLY pool, which auto-triggers a Happy Hour when it fills. Charged atomically;
// every donation counts toward lifetime badges + the daily "rally the pack" quest.
export async function donateToHappyHour(buyerId, amount) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const gold = Math.max(1, Math.floor(Number(amount) || 0));
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2, event_gold_donated = event_gold_donated + $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, gold]).catch(() => null);
    if (!paid) return { ok: false, error: "not_enough_gold" };
    // 1 XP per gold donated — gold is already spent, so award XP only (no gold back).
    await awardXp(buyerId, "donate_event", { points: gold, gold: 0 }).catch(() => {});
    await bumpQuestProgress(buyerId, "donate_event", gold).catch(() => {});
    await trackActivity(buyerId, "happy_hour_donate", { gold }).catch(() => {});
    invalidateEventCache();

    const ev = await getActiveEvent();
    if (ev) {
        const before = Number((await db.queryOne(`SELECT gold FROM mkt_happy_hour_donation WHERE event_id = $1 AND buyer_id = $2`, [ev.id, buyerId]).catch(() => null))?.gold || 0);
        await db.query(`UPDATE mkt_happy_hour SET pool_gold = pool_gold + $2 WHERE id = $1`, [ev.id, gold]).catch(() => {});
        await db.query(`INSERT INTO mkt_happy_hour_donation (event_id, buyer_id, gold) VALUES ($1, $2, $3) ON CONFLICT (event_id, buyer_id) DO UPDATE SET gold = mkt_happy_hour_donation.gold + $3`, [ev.id, buyerId, gold]).catch(() => {});
        const rewards = await grantDonationRewards(buyerId, before, before + gold);
        await syncEarnedBadges(buyerId).catch(() => {});
        return { ok: true, gold: paid.gold, rewards, ...(await getHappyHourState(buyerId)) };
    }
    // No event → build the rally pool; trigger a Happy Hour if it's now full.
    const rally = (Number(await getSetting(RALLY_KEY).catch(() => 0)) || 0) + gold;
    await syncEarnedBadges(buyerId).catch(() => {});
    if (rally >= RALLY_TRIGGER) {
        await setSetting(RALLY_KEY, 0);
        await startHappyHour({ hours: 2, baseMult: 2, startPool: rally }); // launches already boosted
        return { ok: true, gold: paid.gold, triggered: true, ...(await getHappyHourState(buyerId)) };
    }
    await setSetting(RALLY_KEY, rally);
    return { ok: true, gold: paid.gold, ...(await getHappyHourState(buyerId)) };
}
