import "server-only";

import { db } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/settings.js";
import { grantConsumable } from "@/lib/marketplace/consumables.js";
import { addChests } from "@/lib/marketplace/chests.js";
import { bumpQuestProgress } from "@/lib/marketplace/quests.js";
import { syncEarnedBadges } from "@/lib/marketplace/badges.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { awardXp } from "@/lib/marketplace/xp.js";
import { getHappyHourState, startHappyHour, invalidateEventCache, RALLY_KEY, RALLY_SINCE_KEY, RALLY_TRIGGER } from "@/lib/marketplace/happy-hour-core.js";
import { logCoin } from "@/lib/marketplace/coins.js";

// Donate action for Happy Hour (imports the item/badge/quest systems, so it lives OUTSIDE happy-hour-core
// which the awardXp path depends on). The rally that summons an event, and the donor's personal reward tiers.
const REWARD_TIERS = [
    { at: 1000, treat: "treat_snack", label: "a Hearty Snack" },
    { at: 5000, chest: "iron", label: "an Iron chest" },
    { at: 15000, chest: "gold", treat: "treat_toy", label: "a Gold chest + Chew Toy" },
];

// Personal reward tiers crossed by going from `before` → `after` cumulative donation in this rally cycle.
async function grantDonationRewards(buyerId, before, after) {
    const granted = [];
    for (const t of REWARD_TIERS) {
        if (before < t.at && after >= t.at) {
            if (t.treat) await grantConsumable(buyerId, t.treat, 1).catch(() => {});
            if (t.chest) await addChests(buyerId, { [t.chest]: 1 }, { source: "happy_hour" }).catch(() => {});
            granted.push(t.label);
        }
    }
    return granted;
}

// When the current rally cycle began. Everything donated since then is what summons the next Happy Hour.
async function rallySince() {
    const raw = await getSetting(RALLY_SINCE_KEY).catch(() => null);
    const t = raw ? new Date(raw) : null;
    if (t && !Number.isNaN(t.getTime())) return t.toISOString();
    // First run (or a wiped setting): fall back to the last event, so a fresh cycle cannot sweep up months of
    // history and hand somebody a Gold chest for gold they put into an event that already happened.
    const last = await db.queryOne(`SELECT started_at FROM mkt_happy_hour ORDER BY started_at DESC LIMIT 1`).catch(() => null);
    return new Date(last?.started_at || Date.now() - 30 * 86400000).toISOString();
}

// What this member has put into the CURRENT rally cycle. Read back off the coin ledger rather than kept in a
// table of its own — the ledger already records every donation, and one source of truth beats two that can
// drift apart.
async function myRallyGold(buyerId, since) {
    const row = await db.queryOne(
        `SELECT COALESCE(SUM(-delta), 0) AS gold FROM mkt_coin_event
          WHERE buyer_id = $1 AND reason = 'happy_hour' AND delta < 0 AND created_at > $2`,
        [buyerId, since]
    ).catch(() => null);
    return Number(row?.gold || 0);
}

// CREDIT THE MEMBERS WHO SUMMONED IT. Donation rows used to be written only while an event was already live,
// which meant a rally-triggered Happy Hour — the only kind there is now — listed no donors at all: the recap
// read "the pack donated 15,000 to summon it" above an empty list, and the members who actually spent eight
// days filling the meter got no mention on the event they paid for. Rebuilt from the ledger at the moment the
// event is born.
async function creditRallyDonors(eventId, since) {
    await db.query(
        `INSERT INTO mkt_happy_hour_donation (event_id, buyer_id, gold)
         SELECT $1, buyer_id, SUM(-delta) FROM mkt_coin_event
          WHERE reason = 'happy_hour' AND delta < 0 AND created_at > $2
          GROUP BY buyer_id
         ON CONFLICT (event_id, buyer_id) DO UPDATE SET gold = EXCLUDED.gold`,
        [eventId, since]
    ).catch(() => {});
}

// A member donates gold into the rally. When the rally fills it summons a x2 Happy Hour for the whole server,
// and that is the only thing donating ever does. Donations made while an event is live roll into the NEXT
// rally — there is nothing to raise on a live one — so the gold is never wasted. Charged atomically; every
// donation counts toward lifetime badges, the personal reward tiers, and the daily "rally the pack" quest.
export async function donateToHappyHour(buyerId, amount) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const gold = Math.max(1, Math.floor(Number(amount) || 0));
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2, event_gold_donated = event_gold_donated + $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, gold]).catch(() => null);
    if (!paid) return { ok: false, error: "not_enough_gold" };

    const since = await rallySince();
    const before = await myRallyGold(buyerId, since);
    await logCoin(buyerId, -gold, "happy_hour", { balanceAfter: paid.gold }).catch(() => {});
    // 1 XP per 4 gold donated (quartered — it was too rich, esp. since it also rides the Happy Hour
    // multiplier). Gold is already spent, so award XP only (no gold back).
    await awardXp(buyerId, "donate_event", { points: Math.round(gold / 4), gold: 0 }).catch(() => {});
    await bumpQuestProgress(buyerId, "donate_event", gold).catch(() => {});
    await trackActivity(buyerId, "happy_hour_donate", { gold }).catch(() => {});
    const rewards = await grantDonationRewards(buyerId, before, before + gold);
    await syncEarnedBadges(buyerId).catch(() => {});
    invalidateEventCache();

    const rally = (Number(await getSetting(RALLY_KEY).catch(() => 0)) || 0) + gold;
    if (rally >= RALLY_TRIGGER) {
        const started = await startHappyHour({ startPool: rally });
        if (started?.event?.id) {
            await creditRallyDonors(started.event.id, since);
            // Reset only once the event actually exists — a failed insert must not swallow the pack's gold.
            await setSetting(RALLY_KEY, 0);
            await setSetting(RALLY_SINCE_KEY, new Date().toISOString());
            return { ok: true, gold: paid.gold, rewards, triggered: true, ...(await getHappyHourState(buyerId)) };
        }
    }
    await setSetting(RALLY_KEY, rally);
    return { ok: true, gold: paid.gold, rewards, ...(await getHappyHourState(buyerId)) };
}
