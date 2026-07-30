import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";
import { addChests } from "@/lib/marketplace/chests.js";
import { awardXp } from "@/lib/marketplace/xp.js";
import { isOwner } from "@/lib/marketplace/owner.js";

// ── Per-feature daily quests (farm + sailing) ───────────────────────────────────────────────────────────────
// A dedicated, always-present set of 3 daily bounties shown on each feature's own screen (like the Forge's).
// Each task's `metric` is one the central quest pump (bumpQuestProgress) already bumps, so tracking is free.

const DAY = "(NOW() AT TIME ZONE 'America/Chicago')::date";

export const FEATURE_DAILIES = {
    farm: [
        { key: "farm_harvest3", label: "Harvest 3 crops", metric: "harvest_crop", need: 3, reward: { gold: 150 }, rewardLabel: "+150 gold" },
        { key: "farm_plant2", label: "Plant 2 seeds", metric: "plant_seed", need: 2, reward: { gold: 90 }, rewardLabel: "+90 gold" },
        { key: "farm_pet2", label: "Pet 2 companions", metric: "pet_animal", need: 2, reward: { chest: "wooden" }, rewardLabel: "Wooden chest" },
    ],
    sailing: [
        { key: "sail_voyage1", label: "Set sail on a voyage", metric: "voyage_start", need: 1, reward: { gold: 120 }, rewardLabel: "+120 gold" },
        { key: "sail_dig1", label: "Dig up buried treasure", metric: "dig_done", need: 1, reward: { gold: 140 }, rewardLabel: "+140 gold" },
        { key: "sail_raid1", label: "Raid a passing ship", metric: "raid_do", need: 1, reward: { chest: "wooden" }, rewardLabel: "Wooden chest" },
        // Fishing is the thing to do DURING a voyage, so its bounty asks for a few catches rather than one — it's
        // the one task you can finish without waiting on a four-hour timer.
        // ownerOnly while fishing is unreleased: without it every member would be handed a bounty they cannot
        // start, which both advertises the feature and permanently parks their sailing card at 3/4 complete.
        { key: "sail_fish3", label: "Land 3 fish", metric: "fish", need: 3, reward: { gold: 110 }, rewardLabel: "+110 gold", ownerOnly: true },
    ],
};

// metric → feature, so the central quest pump can also feed these dailies with a single hook.
export const FEATURE_BY_METRIC = {};
for (const [feature, tasks] of Object.entries(FEATURE_DAILIES)) for (const t of tasks) FEATURE_BY_METRIC[t.metric] = feature;

const parseJson = (raw, fallback) => { try { return typeof raw === "string" ? JSON.parse(raw) : (raw ?? fallback); } catch { return fallback; } };

// Called from bumpQuestProgress — increments the metric counter in today's row for the owning feature.
export async function bumpFeatureDaily(buyerId, metric, amount = 1) {
    const feature = FEATURE_BY_METRIC[metric];
    if (!buyerId || !feature || amount <= 0) return;
    await db.query(`INSERT INTO mkt_feature_daily (buyer_id, feature, day) VALUES ($1,$2,${DAY}) ON CONFLICT (buyer_id, feature, day) DO NOTHING`, [buyerId, feature]).catch(() => {});
    await db.query(
        `UPDATE mkt_feature_daily SET progress = jsonb_set(progress, ARRAY[$3], to_jsonb(COALESCE((progress->>$3)::int, 0) + $4)) WHERE buyer_id = $1 AND feature = $2 AND day = ${DAY}`,
        [buyerId, feature, metric, amount]
    ).catch(() => {});
}

// Tasks belonging to a feature that hasn't shipped yet are filtered out per-member, so an unreleased system
// never leaks through the daily card. Applied to BOTH the card list and the nav claim count — a bounty that
// is invisible but still counted would light up the attention badge with nothing behind it.
const visibleTasks = (tasks, buyerId) => (tasks || []).filter((t) => !t.ownerOnly || isOwner(buyerId));

export async function getFeatureDailies(buyerId, feature) {
    const tasks = visibleTasks(FEATURE_DAILIES[feature], buyerId);
    if (!buyerId || !tasks.length) return [];
    const row = await db.queryOne(`SELECT progress, claimed FROM mkt_feature_daily WHERE buyer_id = $1 AND feature = $2 AND day = ${DAY}`, [buyerId, feature]).catch(() => null);
    const progress = parseJson(row?.progress, {});
    const claimed = new Set(parseJson(row?.claimed, []));
    return tasks.map((t) => {
        const p = Math.min(Number(progress[t.metric] || 0), t.need);
        return { key: t.key, label: t.label, need: t.need, progress: p, done: p >= t.need, claimed: claimed.has(t.key), rewardLabel: t.rewardLabel };
    });
}

// Claimable (done-but-unclaimed) task counts per feature, in ONE query — for the nav/tab attention badges.
export async function getFeatureClaimCounts(buyerId) {
    const out = {};
    for (const f of Object.keys(FEATURE_DAILIES)) out[f] = 0;
    if (!buyerId) return out;
    const rows = await db.query(`SELECT feature, progress, claimed FROM mkt_feature_daily WHERE buyer_id = $1 AND day = ${DAY}`, [buyerId]).catch(() => []);
    for (const row of rows) {
        const tasks = visibleTasks(FEATURE_DAILIES[row.feature], buyerId);
        if (!tasks.length) continue;
        const progress = parseJson(row.progress, {});
        const claimed = new Set(parseJson(row.claimed, []));
        out[row.feature] = tasks.filter((t) => Math.min(Number(progress[t.metric] || 0), t.need) >= t.need && !claimed.has(t.key)).length;
    }
    // The Forge runs its own daily system (not FEATURE_DAILIES) — fold its claimable count in for the nav badge.
    try { const { forgeDailyClaimable } = await import("@/lib/marketplace/crafting.js"); out.forge = await forgeDailyClaimable(buyerId); } catch { out.forge = 0; }
    return out;
}

export async function claimFeatureDaily(buyerId, feature, key) {
    // visibleTasks, not the raw pool — an unreleased task must be unclaimable by hand-rolled POST, not merely hidden.
    const t = visibleTasks(FEATURE_DAILIES[feature], buyerId).find((x) => x.key === key);
    if (!buyerId || !t) return { ok: false, error: "bad_task" };
    const row = await db.queryOne(`SELECT progress, claimed FROM mkt_feature_daily WHERE buyer_id = $1 AND feature = $2 AND day = ${DAY}`, [buyerId, feature]).catch(() => null);
    const progress = parseJson(row?.progress, {});
    const claimed = new Set(parseJson(row?.claimed, []));
    if (Number(progress[t.metric] || 0) < t.need) return { ok: false, error: "not_done" };
    if (claimed.has(key)) return { ok: false, error: "claimed" };
    claimed.add(key);
    await db.query(
        `INSERT INTO mkt_feature_daily (buyer_id, feature, day, claimed) VALUES ($1,$2,${DAY},$3::jsonb) ON CONFLICT (buyer_id, feature, day) DO UPDATE SET claimed = $3::jsonb`,
        [buyerId, feature, JSON.stringify([...claimed])]
    ).catch(() => {});
    if (t.reward.gold) { const p = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, t.reward.gold]).catch(() => null); await logCoin(buyerId, t.reward.gold, `${feature}_daily`, { balanceAfter: p?.gold, meta: { key } }).catch(() => {}); }
    if (t.reward.chest) await addChests(buyerId, { [t.reward.chest]: 1 }, { source: "feature_daily", meta: { key: t.key } }).catch(() => {});
    await awardXp(buyerId, `${feature}_daily`, { points: 20, gold: 0 }).catch(() => {});
    return { ok: true, reward: t.reward, dailies: await getFeatureDailies(buyerId, feature) };
}
