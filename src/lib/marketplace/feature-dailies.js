import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";
// ── A CLAIM DOES NOT PAY A CHEST ─────────────────────────────────────────────────────────────────────────────
// Luke's rule, and the measurement that forced it: 130 chests a day were going out, and against the 37 members
// who actually play on a given day that is 3.5 EACH, with the heaviest taking six to twelve. Two thirds of
// them wooden. A chest stopped being a thing you found and became the wallpaper.
//
// The line is the one already drawn for the windfall: a chest comes off something you DUG UP or PUT DOWN — a
// seam, a crop, a raider, a dungeon floor, a forge you spent shards at. A daily card, a check-in streak, a
// quest tick and a guide chapter are CLAIMS: you press a button that hands you something you had already
// earned by doing the thing the reward is for. Those pay gold, which is what a claim has always been for.
import { addChests } from "@/lib/marketplace/chests.js";
import { awardXp } from "@/lib/marketplace/xp.js";
import { isOwner } from "@/lib/marketplace/owner.js";

// ── Per-feature daily quests (farm + sailing) ───────────────────────────────────────────────────────────────
// A dedicated, always-present set of 3 daily bounties shown on each feature's own screen (like the Forge's).
// Each task's `metric` is one the central quest pump (bumpQuestProgress) already bumps, so tracking is free.

const DAY = "(NOW() AT TIME ZONE 'America/Chicago')::date";

export const FEATURE_DAILIES = {
    // THE FARM'S FIVE. The first three are things you do alone on your own patch, and for a long time they
    // were the whole list — which meant the farm's two SOCIAL loops, rating a neighbour and petting their
    // pets, were the only rewarding things on the feature that no bounty ever asked for. "Pet 2 companions"
    // could be finished without leaving home, because the metric it counts fires on your own pets too.
    //
    // The last two are the fix, and they are deliberately the ones that pay a chest: visiting somebody is
    // worth more than watering your own crops, both to the Den and to the person being visited (their pet
    // gains the XP, their farm gains the vote). Neither pays more PER ACTION — those awards were trimmed once
    // already for being 5.5% of all XP in the game — the pull is the bounty on top.
    farm: [
        { key: "farm_harvest3", label: "Harvest 3 crops", metric: "harvest_crop", need: 3, reward: { gold: 75 }, rewardLabel: "+75 gold" },
        { key: "farm_plant2", label: "Plant 2 seeds", metric: "plant_seed", need: 2, reward: { gold: 45 }, rewardLabel: "+45 gold" },
        { key: "farm_pet2", label: "Pet 2 companions", metric: "pet_animal", need: 2, reward: { gold: 60 }, rewardLabel: "+60 gold" },
        // The chest moves to the visiting bounty rather than being minted twice: a full farm day still pays
        // exactly ONE chest, it is just no longer claimable without leaving your own patch. The petting one
        // pays the biggest gold on the card because it asks the most — you have to be on someone else's farm.
        { key: "farm_rate2", label: "Rate 2 neighbours' farms", metric: "farm_rate", need: 2, reward: { gold: 100 }, rewardLabel: "+100 gold" },
        { key: "farm_petother2", label: "Pet 2 of a neighbour's pets", metric: "pet_other", need: 2, reward: { gold: 100 }, rewardLabel: "+100 gold" },
    ],
    sailing: [
        { key: "sail_voyage1", label: "Set sail on a voyage", metric: "voyage_start", need: 1, reward: { gold: 60 }, rewardLabel: "+60 gold" },
        { key: "sail_dig1", label: "Dig up buried treasure", metric: "dig_done", need: 1, reward: { gold: 70 }, rewardLabel: "+70 gold" },
        // ONE BOUNTY FOR ONE BUTTON. These were two — "Raid a passing ship" (raid_do) and "Fight the fleet"
        // (ship_battle) — from the days when the yard listed opponents and you picked one. It does not any
        // more: there is a single Battle button and matchOpponent decides whether you meet a fleet ship or a
        // rival captain. So one of the two ticked and the other did not, at random, and neither told you why.
        // `ship_battle` is bumped by BOTH paths now, and `sail_raid1` keeps its key so today's rows survive.
        { key: "sail_raid1", label: "Win a ship battle", metric: "ship_battle", need: 1, reward: { gold: 110 }, rewardLabel: "+110 gold" },
        // Fishing is the thing to do DURING a voyage, so its bounty asks for a few catches rather than one — it's
        // the one task you can finish without waiting on a four-hour timer.
        { key: "sail_fish3", label: "Land 3 fish", metric: "fish", need: 3, reward: { gold: 55 }, rewardLabel: "+55 gold" },
    ],
    // The Kitchen's three. Deliberately one of each SHAPE so a day in the kitchen isn't three of the same
    // action: cook a few dishes (volume), prep ingredients (the chain that feeds them), and land a clean run
    // (skill at the timing bar).
    cooking: [
        { key: "cook_dish3", label: "Cook 3 dishes", metric: "cook_dish", need: 3, reward: { gold: 75 }, rewardLabel: "+75 gold" },
        { key: "cook_prep2", label: "Prep 2 ingredients", metric: "cook_prep", need: 2, reward: { gold: 55 }, rewardLabel: "+55 gold" },
        { key: "cook_clean1", label: "Cook a dish with a clean run", metric: "cook_clean", need: 1, reward: { gold: 100 }, rewardLabel: "+100 gold" },
    ],
    // THE CASINO'S THREE. The floor is a gold SINK, which makes its bounties a different problem from every
    // other card here: paying people to gamble is paying them to lose, and a card that hands back more than
    // the house takes turns the machines into a way of farming the card.
    //
    // So the three are deliberately cheap — 380 gold for a day of it, against a floor that keeps 10% of
    // every stake — and two of the three ask you to SIT DOWN rather than to win. The one that pays for a win
    // pays the least per unit of luck involved, because rewarding luck is how a bounty stops meaning
    // anything: you either got it or you did not, and nothing you chose changed it.
    casino: [
        { key: "cas_play5", label: "Play 5 times on the floor", metric: "casino_play", need: 5, reward: { gold: 75 }, rewardLabel: "+75 gold" },
        // Was "take a spin on the wheel" until the wheel was removed. Keno is the shared round now, and it
        // is the same ask: put a ticket on a timed draw with other people rather than pull a lever alone.
        { key: "cas_keno1", label: "Buy a keno ticket", metric: "casino_keno", need: 1, reward: { gold: 55 }, rewardLabel: "+55 gold" },
        { key: "cas_win1", label: "Win on any machine", metric: "casino_win", need: 1, reward: { gold: 60 }, rewardLabel: "+60 gold" },
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
