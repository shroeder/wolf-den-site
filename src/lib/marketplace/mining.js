import "server-only";

import { db } from "@/lib/db";
import { awardXp } from "@/lib/marketplace/xp.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { bandTable, GRADE_RANK } from "@/lib/marketplace/timing.js";
import { SMELT_GRADES, SMELT_MISS, SMELT_PHASES, smeltGrade } from "@/lib/marketplace/smelt-heat.js";
import { addChests } from "@/lib/marketplace/chests.js";
import { grantEventBadge } from "@/lib/marketplace/badges.js";

// ── MINING (owner-gated, phase 1) ────────────────────────────────────────────────────────────────────────────
// You PROSPECT — one button surfaces a random live seam — then swing at it on
// the SAME timing bar as the Forge anvil and the Treasure Golem — identical grade bands, so the skill a member
// already has transfers instead of being re-learned. Chip a node's HP to zero and its ore is yours.
//
// Ore smelts into FORGE PARTS (crafting.js PART_TIERS 1..5), so mining feeds the Forge that already exists
// rather than minting a parallel currency. Ore tier maps straight onto part tier — that's the whole
// "depending on the ore" rule, kept deliberately legible.
//
// OWNER-GATED. Every read and every write goes through MINING_UNLOCKED. Flip that one function to open it.

export const MINING_UNLOCKED = (buyerId) => Boolean(buyerId) && isOwner(buyerId);

// ── ORE TIERS ────────────────────────────────────────────────────────────────────────────────────────────────
// Named for the rock, coloured up the usual rarity ladder. `part` is the forge part tier it smelts into, which
// is 1:1 on purpose — a member should be able to look at a lump of ore and know what it becomes.
// `weight` is the spawn share at lantern 0; `hp` is how much chipping the node takes.
// `hp` is the ONLY thing that ends a seam now, so it is really "how long is this hand". Sized against base
// swing power of 18: decent play cracks tier 1 in about nine swings, sloppy play takes nearly twenty, and a
// maxed Pickaxe roughly halves it — which is exactly what that upgrade promises. Richer rock takes longer.
//
// These were 60 / 110 / 190 / 320 / 520, tuned back when a hand was capped at eight swings and HP was just a
// race the cap would win. It didn't: a single PERFECT strike does 90, so a 60 HP Coal seam died on tap one.
// `name` is the SEAM — a place in the rock. `ore` is the material you carry out of it.
//
// There was only ever `name`, so a pile of ore was labelled with the name of the hole it came from: breaking a
// Coal Seam paid out "Iron Vein ×6", which reads as six veins rather than six lumps of iron. Two different
// nouns doing one job.
export const ORE_TIERS = {
    1: { tier: 1, id: "coal", name: "Coal Seam", ore: "Coal", color: "#8b8f96", part: 1, weight: 44, hp: 460, xp: 6, gold: 5 },
    2: { tier: 2, id: "iron", name: "Iron Vein", ore: "Iron Ore", color: "#cfd6dd", part: 2, weight: 30, hp: 520, xp: 12, gold: 11 },
    3: { tier: 3, id: "silver", name: "Silver Lode", ore: "Silver Ore", color: "#6fb0e6", part: 3, weight: 17, hp: 580, xp: 24, gold: 22 },
    4: { tier: 4, id: "mythril", name: "Mythril Seam", ore: "Mythril Ore", color: "#b98cff", part: 4, weight: 7, hp: 640, xp: 48, gold: 44 },
    5: { tier: 5, id: "emberheart", name: "Emberheart Geode", ore: "Emberheart Crystal", color: "#ffb020", part: 5, weight: 2, hp: 700, xp: 96, gold: 90 },
};
export const oreTier = (t) => ORE_TIERS[t] || ORE_TIERS[1];

// The ORE LADDER is gone. It promised a fixed ore payout per standard of digging — "Rough dig ×5, Flawless
// ×17" — and the seam stopped paying that way when the draw came in: claimNode pulls tickets out of a BAG,
// and the bag can hand you a chest, a piece of gear or a consumable that no ore multiplier could describe.
// The panel outlived the mechanic and was telling players a rule the code no longer implemented, which is the
// exact trap the Kitchen's reward lottery fell into. What replaces it is RUN_RANKS, below: your rank buys more
// pulls and better tickets, and what comes out stays a surprise.
export const oreArt = (t) => `/images/mining/ore-${oreTier(t).id}.png`;


// ── THE DESCENT ──────────────────────────────────────────────────────────────────────────────────────────────
// Push-your-luck. Each step down the tunnel flips a card; the deeper you are the better the cards AND the
// likelier the roof comes in. Bail whenever you want and everything you are carrying is yours; push once too
// far and the haul is gone.
//
// A COLLAPSE COSTS YOU THE HAUL AND THE TRIP — everything you were carrying is under the rock, and the depth
// you'd worked up to is gone. But you still walk out with a seam to swing at: the WORST one there is, tier 1
// Coal, regardless of how rich the vein had become before the roof went.
//
// That is the sharp part. A run that reached a Mythril seam and then collapsed doesn't hand you nothing, it
// hands you Coal — so what the roof actually takes is the DIFFERENCE, which is the thing you were pushing for.
// A dead-empty rock face was cleaner as a rule and worse as a game: it ended the session rather than the run,
// and "you get no minigame today" is a punishment aimed at the player instead of at the gamble.
export const TRIPS_PER_DAY = 3;

// ── BUYING ANOTHER TRIP ──────────────────────────────────────────────────────────────────────────────────────
// Out of trips used to be a dead end — "back tomorrow", with a full purse and nothing to press. Fishing already
// answers this (buy another cast, doubling price, daily cap), so mining uses the same shape rather than
// inventing a second one.
//
// A trip is worth far more than a cast — a whole descent plus the seam it hands you — so it starts at 500 and
// doubles: 500 → 1,000 → 2,000 is 3,500 gold to double your day. The doubling is what limits this, not the
// entry price: the first is an easy yes, the third is a real decision, and a big balance buys sharply less
// than it looks like it should.
export const TRIP_RECHARGE_BASE = 500;
export const TRIP_RECHARGE_MAX_PER_DAY = 3;
export const tripRechargeCost = (bought = 0) => TRIP_RECHARGE_BASE * (2 ** Math.max(0, bought));
const tripsBoughtToday = (row) => Number(row?.trips_bought) || 0;
// The whole day's allowance: the free three plus anything paid for.
export const tripsAllowed = (row) => TRIPS_PER_DAY + tripsBoughtToday(row);
// What the roof leaves you. Deliberately the bottom of ORE_TIERS: you still get to play the timing game, and
// the bag it pays from is the poorest one in the mine.
const COLLAPSE_SEAM_TIER = 1;
// THE ROOF, in two independent parts — which is the whole reason there are two upgrades for it.
//
//   WHERE the risk starts   → Shoring. Below your safe depth the roof simply cannot come in.
//   HOW FAST it climbs      → Buttress. Past that depth, how much each further step adds.
//
// Shoring on its own hit a wall: once you were past your safe depth every extra level of it was worth exactly
// nothing, and the run still ended within a few steps because the climb was a fixed 7.5% a step no matter what
// you had bought. Splitting the two means deep runs are something you can actually build toward — "start
// later" AND "grow slower" — while the cap below still guarantees the gamble never becomes a formality.
const COLLAPSE_FREE_DEPTH = 2;      // the first steps are safe, so there is always a reason to start
export const safeDepthFor = (shoringLevel = 0) => COLLAPSE_FREE_DEPTH + Math.floor(Math.max(0, shoringLevel) / 3); // Shoring buys more
const COLLAPSE_PER_DEPTH = 0.075;   // and then it climbs, this much per step...
const COLLAPSE_SLOW_PER = 0.05;     // ...less 5% of that per Buttress level...
const COLLAPSE_SLOW_CAP = 0.50;     // ...to a floor of half the base rate.
export const braceSlow = (braceLevel = 0) => Math.min(COLLAPSE_SLOW_CAP, Math.max(0, Number(braceLevel) || 0) * COLLAPSE_SLOW_PER);
export const perDepthFor = (braceLevel = 0) => COLLAPSE_PER_DEPTH * (1 - braceSlow(braceLevel));
// A HARD CEILING regardless of either track. However well you have built the tunnel out, a deep enough step is
// always a coin flip you can lose — otherwise the push-your-luck stops being a gamble at all.
const COLLAPSE_CAP = 0.55;
export const collapseChanceAt = (depth, shoringLevel = 0, braceLevel = 0) =>
    Math.min(COLLAPSE_CAP, Math.max(0, depth - safeDepthFor(shoringLevel)) * perDepthFor(braceLevel));

// What the tunnel can turn up. Weights shift with depth — shallow rock is mostly ore and rubble, deep rock is
// where the gear and the strongboxes are. A `seam` card raises the tier of what you end up mining.
// A four-step descent was turning up two consumables, a piece of gear and a purse. The tunnel should mostly be
// TUNNEL — rock, a better seam, the occasional purse — with an actual object as the thing you remember.
//
// So the object cards are cut hard and the ordinary ones raised. Depth still tilts it: pushing deep is how you
// find things, and that is the entire point of the risk.
const CARD_TABLE = [
    { key: "seam", label: "A seam in the wall", w: (d) => 26 + d * 2 },
    { key: "ore", label: "Loose ore", w: () => 24 },
    { key: "gold", label: "A dropped purse", w: () => 18 },
    { key: "consumable", label: "An old cache", w: (d) => 3 + d * 0.6 },
    { key: "gear", label: "Something buried", w: (d) => 1 + d * 0.9 },
    { key: "chest", label: "A strongbox", w: (d) => 0.6 + d * 0.55 },
    { key: "encounter", label: "Something down here", w: (d) => 8 + d },
    { key: "nothing", label: "Bare rock", w: () => 26 },
];
const drawCard = (depth) => {
    const rolled = CARD_TABLE.map((c) => ({ ...c, weight: c.w(depth) }));
    const total = rolled.reduce((s, c) => s + c.weight, 0) || 1;
    let r = Math.random() * total;
    for (const c of rolled) { r -= c.weight; if (r <= 0) return c; }
    return rolled[rolled.length - 1];
};

// Encounters — flavour with teeth. Each one lands an immediate consequence rather than opening another menu.
const ENCOUNTERS = [
    { key: "bats", title: "Bats!", body: "They boil out of the dark and knock the wind out of you.", effect: "none" },
    { key: "gas", title: "Firedamp", body: "The lamp gutters. The air down here has gone bad.", effect: "risk" },
    { key: "pool", title: "A still black pool", body: "Something glitters at the bottom of it.", effect: "ore" },
    { key: "shaft", title: "An older shaft", body: "Someone cut this before you. Their tools are still here.", effect: "consumable" },
    { key: "vein", title: "The vein widens", body: "The rock ahead is threaded with colour.", effect: "seam" },
];

function rollFind(card, depth, packBonus = 0) {
    const tierCeil = Math.min(5, 1 + Math.floor(depth / 2));
    const pickTier = () => Math.max(1, Math.min(5, tierCeil - (Math.random() < 0.45 ? 1 : 0)));
    switch (card.key) {
        case "seam": {
            // A seam is a PLACE — you cannot carry a vein in your pocket, and a card that read like a pickup
            // ("Silver Lode" as a thing you got) never made sense. So it does two honest things: it upgrades
            // the rock you'll work at the face, AND you chip some ore off it there and then, which is the
            // part that actually goes in the bag.
            const t = pickTier();
            const o = oreTier(t);
            const n = Math.max(1, Math.round((2 + Math.floor(Math.random() * 3)) * (1 + packBonus)));
            return { kind: "seam", tier: t, name: o.name, oreName: o.ore, n, color: o.color, art: oreArt(t) };
        }
        case "ore": {
            const t = pickTier();
            const o = oreTier(t);
            return { kind: "ore", tier: t, n: Math.max(1, Math.round((1 + Math.floor(Math.random() * 2)) * (1 + packBonus))), name: o.ore, color: o.color, art: oreArt(t) };
        }
        case "gold": return { kind: "gold", n: Math.round((20 + Math.floor(Math.random() * (18 * depth + 20))) * (1 + packBonus)) };
        case "consumable": return { kind: "consumable" };
        case "gear": return { kind: "gear", depth };
        case "chest": {
            const ladder = ["wooden", "wooden", "iron", "iron", "gold", "gold", "mythic"];
            return { kind: "chest", tier: ladder[Math.min(ladder.length - 1, depth - 1)] || "wooden" };
        }
        case "encounter": {
            const e = ENCOUNTERS[Math.floor(Math.random() * ENCOUNTERS.length)];
            const t = e.effect === "seam" || e.effect === "ore" ? pickTier() : null;
            const o = t ? oreTier(t) : null;
            return { kind: "encounter", key: e.key, title: e.title, body: e.body, effect: e.effect, tier: t, name: o?.name || null, color: o?.color || null, art: t ? oreArt(t) : null };
        }
        default: return { kind: "nothing" };
    }
}

// Start a descent. Costs one of the day's trips.
export async function startTrip(buyerId) {
    if (!MINING_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    const row = await minerRow(buyerId);
    if (row?.run_json && !row.run_json.over) return { ok: false, error: "run_in_progress", ...(await getMiningState(buyerId)) };
    const allowed = tripsAllowed(row);
    if ((Number(row?.trips_used) || 0) >= allowed) return { ok: false, error: "no_trips", ...(await getMiningState(buyerId)) };
    const spent = await db.queryOne(
        `UPDATE mkt_mining SET trips_used = trips_used + 1, updated_at = NOW()
          WHERE buyer_id = $1 AND trips_day = ${DAY} AND trips_used < $2 RETURNING trips_used`,
        [buyerId, allowed]
    ).catch(() => null);
    if (!spent) return { ok: false, error: "no_trips", ...(await getMiningState(buyerId)) };
    const run = { depth: 0, haul: [], seamTier: 1, over: false, collapsed: false, last: null };
    await db.query(`UPDATE mkt_mining SET run_json = $2::jsonb, current_node_id = NULL WHERE buyer_id = $1`, [buyerId, JSON.stringify(run)]).catch(() => {});
    await trackActivity(buyerId, "mine_trip", {}).catch(() => {});
    return { ok: true, ...(await getMiningState(buyerId)) };
}

// One step deeper.
/** Buy one more descent today. Mirrors fishing's buyRecharge, down to the conditional spend. */
export async function buyTrip(buyerId) {
    if (!MINING_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    const row = await minerRow(buyerId);
    const used = Number(row?.trips_used) || 0;
    if (used < tripsAllowed(row)) return { ok: false, error: "still_have_trips", ...(await getMiningState(buyerId)) };
    const bought = tripsBoughtToday(row);
    if (bought >= TRIP_RECHARGE_MAX_PER_DAY) return { ok: false, error: "recharge_maxed", ...(await getMiningState(buyerId)) };

    const cost = tripRechargeCost(bought);
    // Conditional spend: the WHERE clause IS the balance check, so two taps can't both succeed on one balance.
    const paid = await db.queryOne(
        `UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND COALESCE(gold, 0) >= $2 RETURNING gold`,
        [buyerId, cost]
    ).catch(() => null);
    if (!paid) return { ok: false, error: "not_enough_gold", ...(await getMiningState(buyerId)) };
    await logCoin(buyerId, -cost, "mining_trip", { balanceAfter: paid.gold, meta: { bought: bought + 1 } }).catch(() => {});

    // Guarded the same way, and only for TODAY's row — a day rollover between the read and this write must not
    // hand out a trip against yesterday's counter.
    const got = await db.queryOne(
        `UPDATE mkt_mining SET trips_bought = trips_bought + 1, updated_at = NOW()
          WHERE buyer_id = $1 AND trips_day = ${DAY} AND trips_bought = $2 RETURNING trips_bought`,
        [buyerId, bought]
    ).catch(() => null);
    if (!got) {
        // Refund rather than take the gold for nothing.
        await db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [buyerId, cost]).catch(() => {});
        return { ok: false, error: "try_again", ...(await getMiningState(buyerId)) };
    }
    await trackActivity(buyerId, "mine_trip_bought", { cost, bought: bought + 1 }).catch(() => {});
    return { ok: true, bought: bought + 1, cost, ...(await getMiningState(buyerId)) };
}

export async function descend(buyerId) {
    if (!MINING_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    const row = await minerRow(buyerId);
    const run = row?.run_json;
    if (!run || run.over) return { ok: false, error: "no_run" };
    const depth = (Number(run.depth) || 0) + 1;

    // THE ROOF. Rolled before the card, so a collapse is the tunnel deciding rather than a reward being shown
    // to you and then snatched back.
    if (Math.random() < collapseChanceAt(depth, row?.assay_level, row?.brace_level)) {
        const lost = (run.haul || []).length;
        const hadTier = Number(run.seamTier) || 1;
        const next = { ...run, depth, over: true, collapsed: true, haul: [], last: { kind: "collapse" } };
        await db.query(`UPDATE mkt_mining SET run_json = $2::jsonb WHERE buyer_id = $1`, [buyerId, JSON.stringify(next)]).catch(() => {});
        // You crawl out with what you could reach on the way, which is the poorest rock in the mine. The vein
        // you'd actually found stays buried — `lostTier` is only for the wrap-up to show you what it cost.
        const seam = await cutSeam(buyerId, COLLAPSE_SEAM_TIER);
        await trackActivity(buyerId, "mine_collapse", { depth, lost, hadTier }).catch(() => {});
        return {
            ok: true, collapsed: true, depth, lost, seam,
            lostTier: hadTier > COLLAPSE_SEAM_TIER ? { tier: hadTier, name: oreTier(hadTier).name, color: oreTier(hadTier).color, art: oreArt(hadTier) } : null,
            ...(await getMiningState(buyerId)),
        };
    }

    const card = drawCard(depth + Math.round(surveyValue("lantern", row?.lantern_level) * 10)); // Lantern reads the tunnel as deeper than it is
    const found = rollFind(card, depth, surveyValue("pack", row?.face_level));
    const haul = [...(run.haul || [])];
    let seamTier = Number(run.seamTier) || 1;
    if (found.kind === "seam") {
        seamTier = Math.max(seamTier, found.tier);
        // The ore you chipped off it goes in the bag like any other find; the seam itself is not an item.
        haul.push({ kind: "ore", tier: found.tier, n: found.n, name: found.oreName, color: found.color, art: found.art });
    }
    else if (found.kind === "encounter") {
        if (found.effect === "seam") seamTier = Math.max(seamTier, found.tier || 1);
        else if (found.effect === "ore") haul.push({ kind: "ore", tier: found.tier, n: 2, name: found.name, color: found.color, art: found.art });
        else if (found.effect === "consumable") haul.push({ kind: "consumable" });
    } else if (found.kind !== "nothing") haul.push(found);

    if (depth >= 12) await grantEventBadge(buyerId, "mine_deep").catch(() => {});

    const next = { ...run, depth, haul, seamTier, last: { kind: found.kind, label: card.label } };
    await db.query(`UPDATE mkt_mining SET run_json = $2::jsonb WHERE buyer_id = $1`, [buyerId, JSON.stringify(next)]).catch(() => {});
    return { ok: true, card: { key: card.key, label: card.label }, found, depth, ...(await getMiningState(buyerId)) };
}

// Climb out with everything you are carrying, and take the seam to the rock face.
export async function surfaceRun(buyerId) {
    if (!MINING_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    const row = await minerRow(buyerId);
    const run = row?.run_json;
    if (!run || run.over) return { ok: false, error: "no_run" };

    // Everything banked pays out NOW. The haul was only ever a promise until you climbed out with it.
    const paid = [];
    for (const item of run.haul || []) {
        if (item.kind === "ore") {
            await db.query(`INSERT INTO mkt_ore (buyer_id, tier, qty) VALUES ($1,$2,$3) ON CONFLICT (buyer_id, tier) DO UPDATE SET qty = mkt_ore.qty + EXCLUDED.qty`, [buyerId, item.tier, item.n]).catch(() => {});
            paid.push(item);
        } else if (item.kind === "gold") {
            const g = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, item.n]).catch(() => null);
            await logCoin(buyerId, item.n, "mining", { balanceAfter: g?.gold, meta: { kind: "descent" } }).catch(() => {});
            paid.push(item);
        } else if (item.kind === "chest") {
            await addChests(buyerId, { [item.tier]: 1 }, { source: "mining" }).catch(() => {});
            paid.push(item);
        } else if (item.kind === "gear") {
            const got = await grantMiningGear(buyerId, item.depth);
            if (got) paid.push({ ...item, ...got });
        } else if (item.kind === "consumable") {
            const got = await grantMiningConsumable(buyerId);
            if (got) paid.push({ ...item, ...got });
        }
    }
    const next = { ...run, over: true, collapsed: false };
    await db.query(`UPDATE mkt_mining SET run_json = $2::jsonb WHERE buyer_id = $1`, [buyerId, JSON.stringify(next)]).catch(() => {});
    const seam = await cutSeam(buyerId, Number(run.seamTier) || 1);
    // NERVE OF IRON — went deep AND got out with it. Collapsing at depth 9 earns nothing; knowing when to stop
    // is the whole game the descent is playing.
    if ((Number(run.depth) || 0) >= 10 && paid.length) await grantEventBadge(buyerId, "mine_nerve").catch(() => {});
    await trackActivity(buyerId, "mine_surface", { depth: run.depth, haul: paid.length }).catch(() => {});
    return { ok: true, surfaced: true, paid, seam, ...(await getMiningState(buyerId)) };
}

// The seam you walked out with becomes the rock you mine.
async function cutSeam(buyerId, tier) {
    const o = oreTier(Math.max(1, Math.min(5, tier)));
    const made = await db.queryOne(
        `INSERT INTO mkt_ore_node (tier, x, y, hp, hp_max, expires_at)
         VALUES ($1, 50, 70, $2, $2, NOW() + INTERVAL '12 hours') RETURNING id`,
        [o.tier, o.hp]
    ).catch(() => null);
    if (made?.id) await db.query(`UPDATE mkt_mining SET current_node_id = $2 WHERE buyer_id = $1`, [buyerId, made.id]).catch(() => {});
    return made?.id ? { tier: o.tier, name: o.name, color: o.color, art: oreArt(o.tier) } : null;
}

// A piece of gear out of the dark. Deeper digs reach higher rarities; never a duplicate.
// What the rock can be carrying, by how deep you were when you found it.
//
// This was a fallback CHAIN — ["epic","rare","common"], take the first rarity with anything left in it — which
// is not a rarity roll at all: past depth 5 every single gear drop was an Epic, because there is always an
// unowned Epic. It read like a weighted table and behaved like a guarantee.
//
// Now it rolls, and the chain is only what it always should have been: where to look if the rolled rarity has
// nothing left to give you.
// And WHAT it is when it comes. An Epic out of a depth-5 descent was a 12% roll, which is not rare enough for
// the best thing in a haul — you were getting purple often enough that purple stopped meaning anything.
//
// Legendary is now a deep-run prize and Epic is genuinely uncommon. Common carries the weight it should: most
// buried gear is somebody's old kit, not a warbanner.
const GEAR_ODDS = [
    { min: 8, roll: [["legendary", 4], ["epic", 14], ["rare", 34], ["common", 48]] },
    { min: 5, roll: [["epic", 5], ["rare", 22], ["common", 73]] },
    { min: 0, roll: [["rare", 9], ["common", 91]] },
];
function rollGearRarity(depth) {
    const band = GEAR_ODDS.find((b) => depth >= b.min) || GEAR_ODDS[GEAR_ODDS.length - 1];
    const total = band.roll.reduce((n, [, w]) => n + w, 0);
    let r = Math.random() * total;
    for (const [rarity, w] of band.roll) { r -= w; if (r <= 0) return { rarity, order: band.roll.map(([x]) => x) }; }
    const last = band.roll[band.roll.length - 1][0];
    return { rarity: last, order: band.roll.map(([x]) => x) };
}

async function grantMiningGear(buyerId, depth) {
    const { rarity, order } = rollGearRarity(depth);
    // Try what you rolled first, then walk the rest of the band as a fallback for an exhausted pool.
    const ladder = [rarity, ...order.filter((x) => x !== rarity)];
    const [{ randomDropPool }, { grantItem }] = await Promise.all([
        import("@/lib/marketplace/items.js"),
        import("@/lib/marketplace/inventory.js"),
    ]);
    const owned = new Set((await db.query(`SELECT item_id FROM mkt_user_item WHERE buyer_id = $1`, [buyerId]).catch(() => [])).map((r) => r.item_id));
    for (const rarity of ladder) {
        const pool = randomDropPool((i) => i.rarity === rarity && !owned.has(i.id));
        if (!pool.length) continue;
        const it = pool[Math.floor(Math.random() * pool.length)];
        await grantItem(buyerId, it.id, "mining").catch(() => {});
        // Hand back the WHOLE item. A gear drop is the best thing the mine can give you, and showing it as a
        // generic icon with a name throws away the one moment the art was made for.
        return {
            id: it.id, name: it.name, rarity: it.rarity, icon: it.icon || null,
            slot: it.slot || null, stats: it.stats || null,
        };
    }
    return null;
}

const MINE_CONSUMABLES = ["treat_bone", "farm_growth_tonic", "pot_adrenaline", "farm_fertilizer_crate", "sail_lucky_lure"];
async function grantMiningConsumable(buyerId) {
    const { grantConsumable, CONSUMABLES } = await import("@/lib/marketplace/consumables.js");
    const id = MINE_CONSUMABLES[Math.floor(Math.random() * MINE_CONSUMABLES.length)];
    await grantConsumable(buyerId, id, 1).catch(() => {});
    // Every consumable has its OWN painted sprite in mkt_consumable_sprite. Returning just {id,name} meant the
    // client had nothing to draw and fell back to the generic potion — so a Pet Treat and a Lucky Lure came out
    // of the dark looking like the same bottle. Hand back the art with the thing.
    const art = await db.queryOne(`SELECT url FROM mkt_consumable_sprite WHERE consumable_id = $1`, [id]).catch(() => null);
    return { id, name: CONSUMABLES[id]?.name || id, art: art?.url || null };
}

// ── THE SWING ────────────────────────────────────────────────────────────────────────────────────────────────
// Widths come from lib/marketplace/timing.js — the same cut-points the forge, the kitchen and the raid grade
// against, so a PERFECT is the same act of skill in the mine as anywhere else. The MULTIPLIERS and the names
// are ours: what that skill is worth down a tunnel is a mining decision, and a raid rebalance must never
// silently reprice ore.
const SWING_GRADES = bandTable({
    pixel: { mult: 5.0, label: "PERFECT STRIKE" },
    perfect: { mult: 3.6, label: "CLEAN HIT" },
    great: { mult: 2.6, label: "SOLID" },
    good: { mult: 1.6, label: "GLANCING" },
});
const SWING_MISS = { key: "miss", mult: 0.5, label: "CHIP" };
const gradeForDist = (dist, widen = 0) => SWING_GRADES.find((g) => dist <= g.max + widen) || SWING_MISS;
// Re-arm by grade, same ladder as the raid. The client owns the cadence and shows it; this is what it re-arms on.
export const SWING_COOLDOWN_MS = { pixel: 700, perfect: 850, great: 1050, good: 1300, miss: 1600 };
// Kept only as the FLOOR the client paces itself to. There is no per-grade cooldown any more — the swing
// button is always live, like the kitchen's.
// Pure double-tap floor, kept comfortably UNDER the fastest grade cooldown so a legitimately re-armed swing is
// never rejected. (The raid learned this the hard way: a floor above the fastest cooldown silently eats swings.)
const SWING_THROTTLE_MS = 300;

const COMBO_STEP = 0.10;
const COMBO_MAX = 2.0;
const COMBO_MIN_GRADE = "good";

// ── DAILY ALLOWANCE + UPGRADES ───────────────────────────────────────────────────────────────────────────────
// A seam gives you a FIXED number of swings and then it's spent. You are not chipping a health bar down —
// you are playing a hand of N swings and being RANKED on it, which is the shape every other timing game here
// uses and the only one that gives the last swing any weight.
// SWINGS ARE NOT METERED. The trip is the budget — three descents a day — and capping swings on top was a
// second gate on the same activity, which is what made a seam end before it had been played. You swing until
// the rock breaks; timing decides how fast that happens and how well it scores.
//
// ENDURANCE bought extra swings, then briefly a shorter cooldown — and then the cooldown went too, because a
// swing button that locks you out is the opposite of how the kitchen's plays. So it buys a STEADIER HAND: every
// timing band gets wider, exactly the allowance the forge's steady-hand perk uses. It is the one upgrade that
// makes you better at the game rather than making the game hand you more.
const ENDURANCE_PER = 0.0022;
const ENDURANCE_CAP = 0.022;   // at max, every band is a full PIXEL-width more forgiving
export const steadyHand = (lvl = 0) => Math.min(ENDURANCE_CAP, Math.max(0, Number(lvl) || 0) * ENDURANCE_PER);
// Score per grade. The spread is wide on purpose: a run of PIXELs should rank somewhere a run of GOODs cannot.
export const HIT_SCORE = { pixel: 10, perfect: 7, great: 4, good: 2, miss: 0 };
// Where a run lands. Scored as a % of the perfect score for that many swings.
// WHAT A RANK IS WORTH. Modelled on the farm, deliberately: a harvest is guaranteed gold and XP, and only
// about 5% of the time does it ALSO turn up one extra thing. That is a shape people already understand.
//
// The seam used to hand out DRAWS from a ticket bag — six pulls off one Coal seam, which is how a single
// swing-session produced three chests, a piece of gear and two piles of ore. Ore is the reward now. Your rank
// multiplies it, and buys a chance at ONE bonus on top. Never a list.
export const RUN_RANKS = [
    { key: "s", label: "MASTERWORK", min: 0.88, oreMult: 2.4, bonus: 0.30, color: "#ffd75e" },
    { key: "a", label: "SHARP", min: 0.70, oreMult: 1.9, bonus: 0.18, color: "#8fe3ff" },
    { key: "b", label: "STEADY", min: 0.48, oreMult: 1.5, bonus: 0.10, color: "#8fe39a" },
    { key: "c", label: "ROUGH", min: 0.25, oreMult: 1.2, bonus: 0.05, color: "#d7c48a" },
    { key: "d", label: "BUTCHERED", min: 0, oreMult: 1.0, bonus: 0.02, color: "#ff8f9a" },
];
// Base ore in a seam before the rank multiplier and the Haul track.
export const baseOre = (tier) => 3 + tier * 2;
export const rankFor = (pct) => RUN_RANKS.find((r) => pct >= r.min) || RUN_RANKS[RUN_RANKS.length - 1];
const SWINGS_PER_DAY = 60;          // legacy, unused — trips are the budget now
const DAY = "(NOW() AT TIME ZONE 'America/Chicago')::date";

// `icon` is a SPRITE PATH. Not an emoji (the OS's artwork, not ours) and not a glyph NAME either — shipping
// "GiWarPick" as data got it printed as literal text across the card title, because the card renders what it
// is given. Data carries a picture; the card shows the picture.
// Four tracks, each buying a different KIND of mining rather than just "more of it" — same design rule as the
// fishing rail, so they don't collapse into one obvious purchase order.
export const MINE_TRACKS = {
    pick: { max: 10, per: 0.12, cap: 1.2, kind: "mult", name: "Pickaxe", icon: "/images/mining/pick-iron.png", col: "pick_level",
        desc: "Harder swings — fewer to crack a seam.", effect: "Swing power" },
    haul: { max: 10, per: 0.10, cap: 1.0, kind: "mult", name: "Haul", icon: "/images/mining/track-pack.png", col: "haul_level",
        desc: "More ore out of every seam you crack.", effect: "Ore per seam" },
    vigor: { max: 10, per: ENDURANCE_PER, cap: ENDURANCE_CAP, kind: "raw", name: "Endurance", icon: "/images/mining/track-vigor.png", col: "vigor_level",
        desc: "A steadier hand. Every timing band on the bar gets wider — the same swing scores better.", effect: "Band width" },
};

// SURVEY tracks. The Lantern lives here, not in mining: it buys test-strikes and tilts which seams surface,
// and both of those are about FINDING rock rather than breaking it. It kept its column, so no levels are lost.
export const SURVEY_TRACKS = {
    lantern: { max: 10, per: 0.04, cap: 0.40, kind: "pct", name: "Lantern", icon: "/images/mining/lantern-2.png", col: "lantern_level",
        desc: "Light reaches further — the tunnel gives up better things the deeper you get.", effect: "Find quality" },
    shoring: { max: 10, per: 1, cap: 10, kind: "count", name: "Shoring", icon: "/images/mining/track-shoring.png", col: "assay_level",
        desc: "Timbered walls. The roof holds for longer before the risk starts climbing.", effect: "Safe depth" },
    buttress: { max: 10, per: COLLAPSE_SLOW_PER, cap: COLLAPSE_SLOW_CAP, kind: "pct", name: "Buttress", icon: "/images/mining/track-buttress.png", col: "brace_level",
        desc: "Arched stone set as you go. The risk still starts where Shoring says — it just climbs far more slowly from there.", effect: "Risk climb" },
    pack: { max: 10, per: 0.08, cap: 0.80, kind: "pct", name: "Pack", icon: "/images/mining/track-pack.png", col: "face_level",
        desc: "A deeper pack — every purse and pocket of ore you find is bigger.", effect: "Haul size" },
};
export const surveyValue = (t, lvl) => Math.min(SURVEY_TRACKS[t].cap, Math.max(0, Number(lvl) || 0) * SURVEY_TRACKS[t].per);
// Spots on the face, and test-strikes to spend on them. Both stay well under "sound out everything", because
// the game is choosing what NOT to look at.
export const trackValue = (t, lvl) => Math.min(MINE_TRACKS[t].cap, Math.max(0, Number(lvl) || 0) * MINE_TRACKS[t].per);
// Cost curve mirrors the boat/rail tracks: each level costs more than the last.
export const trackCost = (level) => 300 + Math.round(Math.pow(Math.max(0, level), 1.6) * 140);

// SMELTING tracks. Its own half of the feature, so it gets its own levers rather than riding the pickaxe's.
export const SMELT_TRACKS = {
    bellows: { max: 10, per: 0.03, cap: 0.30, kind: "pct", name: "Bellows", icon: "/images/mining/track-bellows.png", col: "bellows_level",
        desc: "A hotter burn sometimes yields an extra part.", effect: "Bonus part chance" },
    crucible: { max: 10, per: 1, cap: 10, kind: "count", name: "Crucible", icon: "/images/mining/track-crucible.png", col: "crucible_level",
        desc: "A bigger pot needs less ore for the same part.", effect: "Ore per part" },
    flux: { max: 10, per: 0.02, cap: 0.20, kind: "pct", name: "Flux", icon: "/images/mining/track-flux.png", col: "flux_level",
        desc: "A purer melt sometimes lifts a part a whole tier.", effect: "Tier-up chance" },
};
export const smeltValue = (t, lvl) => Math.min(SMELT_TRACKS[t].cap, Math.max(0, Number(lvl) || 0) * SMELT_TRACKS[t].per);
// Ore per part. The Crucible buys this down twice over its ten levels — a visible, discrete win rather than a
// fraction that never quite changes the number on screen.
export const SMELT_BASE_COST = 3;
export const smeltCostFor = (crucibleLevel = 0) => Math.max(1, SMELT_BASE_COST - Math.floor(Math.max(0, crucibleLevel) / 4));

// FURNACE FORMS — the smelting equivalent of the pickaxe ladder. Total smelting levels (0..30) decide which
// furnace you're feeding, and it's the one you see in the smelt animation, so investment is visible at the
// exact moment it pays off.
const FURNACE_FORMS = [
    { at: 0, id: 1, name: "Stone Hearth" },
    { at: 4, id: 2, name: "Banded Forge" },
    { at: 10, id: 3, name: "Brick Smelter" },
    { at: 17, id: 4, name: "Runed Crucible" },
    { at: 25, id: 5, name: "Emberheart Furnace" },
];
export function furnaceForm(totalSmeltLevels) {
    let form = FURNACE_FORMS[0];
    for (const f of FURNACE_FORMS) if (totalSmeltLevels >= f.at) form = f;
    const next = FURNACE_FORMS.find((f) => f.at > totalSmeltLevels) || null;
    return { ...form, sprite: `/images/mining/furnace-${form.id}.png`, nextAt: next?.at ?? null, nextName: next?.name ?? null };
}

// LANTERN FORMS — the surveying tool ladder, so all three tabs show a tool that visibly improves.
// Thresholds are a share of the TOTAL descent levels available, which Buttress just took from 30 to 40. Left
// alone, every lantern form would arrive a third earlier than it was tuned to. Rescaled to the same 0 / 13 /
// 33 / 57 / 83 percent of the maximum, so the ladder paces exactly as it did before the fourth track existed.
const LANTERN_FORMS = [
    { at: 0, id: 1, name: "Tallow Candle" },
    { at: 5, id: 2, name: "Tin Lantern" },
    { at: 13, id: 3, name: "Brass Lamp" },
    { at: 23, id: 4, name: "Runed Lantern" },
    { at: 33, id: 5, name: "Emberheart Lamp" },
];
export function lanternForm(totalSurvey) {
    let form = LANTERN_FORMS[0];
    for (const f of LANTERN_FORMS) if (totalSurvey >= f.at) form = f;
    const next = LANTERN_FORMS.find((f) => f.at > totalSurvey) || null;
    return { ...form, sprite: `/images/mining/lantern-${form.id}.png`, nextAt: next?.at ?? null, nextName: next?.name ?? null };
}

// PICKAXE FORMS. Total upgrade levels across all four tracks (0..40) decide which pickaxe you're swinging, so
// every purchase moves you toward a visibly better tool — the boat-form trick, which is the single best
// "my upgrades are real" signal in the game.
const PICK_FORMS = [
    { at: 0, id: "worn", name: "Worn Pick" },
    { at: 6, id: "iron", name: "Iron Pick" },
    { at: 13, id: "steel", name: "Steel Pick" },
    { at: 21, id: "mythril", name: "Mythril Pick" },
    { at: 30, id: "emberheart", name: "Emberheart Pick" },
];
export function pickForm(totalLevels) {
    let form = PICK_FORMS[0];
    for (const f of PICK_FORMS) if (totalLevels >= f.at) form = f;
    const next = PICK_FORMS.find((f) => f.at > totalLevels) || null;
    return { ...form, sprite: `/images/mining/pick-${form.id}.png`, nextAt: next?.at ?? null, nextName: next?.name ?? null };
}

// ── CAVE + SPAWNING ──────────────────────────────────────────────────────────────────────────────────────────
// Nodes live for a while and are replaced as they're mined or expire, so the cave is never empty and never a
// wall of ore. Spawning is lazy — it runs on read, so there's no cron to keep alive.
const MAX_ACTIVE_NODES = 7;
const NODE_TTL_MIN = 90;
// A node still stores an x/y. Nothing renders it since the walk-around came out, but it costs nothing and a
// later "cave map" view would want it back — a spawn without a position is harder to add than to keep.
const CAVE_X = [8, 92];
const CAVE_Y = [62, 88];

const randBetween = (a, b) => a + Math.random() * (b - a);
function rollOreTier(lanternPct = 0) {
    // Lantern shifts weight off the bottom tier and onto everything above it — the same "tilt, don't gate"
    // approach fishing uses, so a new miner still sees the whole table, just less often.
    const entries = Object.values(ORE_TIERS).map((o) => ({
        tier: o.tier,
        w: o.tier === 1 ? o.weight * (1 - Math.min(0.6, lanternPct)) : o.weight * (1 + lanternPct * 2),
    }));
    const total = entries.reduce((s, e) => s + e.w, 0) || 1;
    let r = Math.random() * total;
    for (const e of entries) { r -= e.w; if (r <= 0) return e.tier; }
    return 1;
}

// Retire what's finished and top the cave back up. Safe to call on every read.
async function refreshNodes(lanternPct = 0) {
    await db.query(`UPDATE mkt_ore_node SET status = 'expired' WHERE status = 'active' AND expires_at <= NOW()`).catch(() => {});
    const live = await db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_ore_node WHERE status = 'active'`).catch(() => null);
    const missing = Math.max(0, MAX_ACTIVE_NODES - (live?.n || 0));
    for (let i = 0; i < missing; i += 1) {
        const tier = rollOreTier(lanternPct);
        const o = oreTier(tier);
        await db.query(
            `INSERT INTO mkt_ore_node (tier, x, y, hp, hp_max, expires_at)
             VALUES ($1, $2, $3, $4, $4, NOW() + ($5 || ' minutes')::interval)`,
            [tier, Math.round(randBetween(...CAVE_X) * 10) / 10, Math.round(randBetween(...CAVE_Y) * 10) / 10, o.hp, String(NODE_TTL_MIN)]
        ).catch(() => {});
    }
}

// ── STATE ────────────────────────────────────────────────────────────────────────────────────────────────────
async function minerRow(buyerId) {
    await db.query(`INSERT INTO mkt_mining (buyer_id) VALUES ($1) ON CONFLICT (buyer_id) DO NOTHING`, [buyerId]).catch(() => {});
    return db
        .queryOne(
            `UPDATE mkt_mining
                SET trips_used = CASE WHEN trips_day = ${DAY} THEN trips_used ELSE 0 END,
                    trips_bought = CASE WHEN trips_day = ${DAY} THEN trips_bought ELSE 0 END,
                    trips_day = ${DAY},
                    swing_used = CASE WHEN swing_day = ${DAY} THEN swing_used ELSE 0 END,
                    swing_bonus = CASE WHEN swing_day = ${DAY} THEN swing_bonus ELSE 0 END,
                    swing_day = ${DAY}
              WHERE buyer_id = $1
              RETURNING *`,
            [buyerId]
        )
        .catch(() => null);
}

const totalLevels = (row) => Object.values(MINE_TRACKS).reduce((n, t) => n + (Number(row?.[t.col]) || 0), 0);
const totalSurveyLevels = (row) => Object.values(SURVEY_TRACKS).reduce((n, t) => n + (Number(row?.[t.col]) || 0), 0);
const totalSmeltLevels = (row) => Object.values(SMELT_TRACKS).reduce((n, t) => n + (Number(row?.[t.col]) || 0), 0);
// One shape for an upgrade card, so the mining and smelting lists render through the same component.
const trackCards = (defs, row, valueFn, costFn, fmt) => Object.entries(defs).map(([key, t]) => {
    const level = Number(row?.[t.col]) || 0;
    return {
        key, name: t.name, icon: t.icon, desc: t.desc, effect: t.effect, level, max: t.max, kind: t.kind,
        now: fmt(key, level), next: level >= t.max ? null : fmt(key, level + 1),
        maxed: level >= t.max, cost: level >= t.max ? null : costFn(level),
    };
});

export async function getMiningState(buyerId) {
    if (!MINING_UNLOCKED(buyerId)) return { unlocked: false };
    const row = await minerRow(buyerId);
    // Only retire what's finished; seams are cut on demand by the descent rather than kept stocked.
    await db.query(`UPDATE mkt_ore_node SET status = 'expired' WHERE status = 'active' AND expires_at <= NOW()`).catch(() => {});

    const [current, ore, goldRow] = await Promise.all([
        row?.current_node_id
            ? db.queryOne(
                `SELECT n.id, n.tier, n.hp, n.hp_max, COALESCE(h.damage, 0) AS my_damage, COALESCE(h.swings, 0) AS my_swings,
                        COALESCE(h.grade_sum, 0) AS my_grade_sum
                   FROM mkt_ore_node n
                   LEFT JOIN mkt_ore_node_hit h ON h.node_id = n.id AND h.buyer_id = $1
                  WHERE n.id = $2 AND n.status = 'active'`,
                [buyerId, row.current_node_id]
            ).catch(() => null)
            : Promise.resolve(null),
        db.query(`SELECT tier, qty FROM mkt_ore WHERE buyer_id = $1 AND qty > 0 ORDER BY tier`, [buyerId]).catch(() => []),
        db.queryOne(`SELECT COALESCE(gold,0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
    ]);

    const lvls = totalLevels(row);
    const tripsUsed = Number(row?.trips_used) || 0;
    const run = row?.run_json && !row.run_json.over ? row.run_json : null;
    return {
        unlocked: true,

        pick: pickForm(lvls),
        trips: {
            used: tripsUsed,
            max: tripsAllowed(row),
            left: Math.max(0, tripsAllowed(row) - tripsUsed),
            free: TRIPS_PER_DAY,
            bought: tripsBoughtToday(row),
            // Offered only once the day's trips are gone — buying while you still have one would just be a
            // worse way to spend gold, and reads as a trap.
            recharge: {
                available: tripsUsed >= tripsAllowed(row) && tripsBoughtToday(row) < TRIP_RECHARGE_MAX_PER_DAY,
                cost: tripRechargeCost(tripsBoughtToday(row)),
                boughtLeft: Math.max(0, TRIP_RECHARGE_MAX_PER_DAY - tripsBoughtToday(row)),
            },
        },
        // The descent in progress, if there is one. Depth, what you are carrying, and how bad the next step is.
        run: run ? {
            depth: Number(run.depth) || 0,
            seamTier: Number(run.seamTier) || 1,
            seamName: oreTier(Number(run.seamTier) || 1).name,
            seamColor: oreTier(Number(run.seamTier) || 1).color,
            seamArt: oreArt(Number(run.seamTier) || 1),
            haul: run.haul || [],
            last: run.last || null,
            risk: Math.round(collapseChanceAt((Number(run.depth) || 0) + 1, row?.assay_level, row?.brace_level) * 100),
        } : null,
        // How the last descent ended, so the client can show the wrap-up once.
        lastRun: row?.run_json?.over ? { collapsed: Boolean(row.run_json.collapsed), depth: Number(row.run_json.depth) || 0 } : null,
        tracks: trackCards(MINE_TRACKS, row, trackValue, trackCost, (key, lvl) => {
            const v = trackValue(key, lvl);
            if (key === "vigor") return lvl ? `+${Math.round(steadyHand(lvl) * 2000) / 10}% wider` : "standard";
            if (key === "lantern") return `+${Math.round(v * 100)}% rich`;
            return `×${(1 + v).toFixed(2)}`;
        }),
        lantern: lanternForm(totalSurveyLevels(row)),
        surveyLevels: totalSurveyLevels(row),
        surveyTracks: trackCards(SURVEY_TRACKS, row, surveyValue, trackCost, (key, lvl) => {
            if (key === "shoring") return `${safeDepthFor(lvl)} safe`;
            // Buttress reads as the actual per-step risk rather than a percentage OF a percentage — "7.5% a
            // step" going to "7.1% a step" is a number you can feel; "+5% risk climb" is a riddle.
            if (key === "buttress") return `${(perDepthFor(lvl) * 100).toFixed(1)}% a step`;
            return `+${Math.round(surveyValue(key, lvl) * 100)}%`;
        }),
        furnace: furnaceForm(totalSmeltLevels(row)),
        smeltLevels: totalSmeltLevels(row),
        smeltTracks: trackCards(SMELT_TRACKS, row, smeltValue, trackCost, (key, lvl) => {
            if (key === "crucible") return `${smeltCostFor(lvl)} ore → 1`;
            return `${Math.round(smeltValue(key, lvl) * 100)}%`;
        }),
        // The ONE seam you're working, or null until you prospect.
        node: current ? (() => {
            const o = oreTier(current.tier);
            const haulMult = 1 + trackValue("haul", row?.haul_level);
            const sw = Number(current.my_swings) || 0;
            return {
                id: Number(current.id), tier: current.tier, name: o.name, color: o.color, art: oreArt(current.tier),
                partTier: o.part, gold: o.gold, xp: o.xp,
                hp: Number(current.hp), hpMax: Number(current.hp_max),
                mySwings: sw,
                // How much wider Endurance has made every band, so the bar can DRAW what it grades.
                widen: steadyHand(row?.vigor_level),
                // Back to the rock itself: there is no swing budget to count down, so what you want to know is
                // how much seam is left. Seam HP is sized for a real hand now, so this moves at a readable pace
                // instead of emptying on the first good hit.
                pct: current.hp_max ? Math.max(0, Math.round((current.hp / current.hp_max) * 100)) : 0,
                // WHAT YOUR RANK BUYS — the honest version of the old ladder. It describes the DRAW (how many
                // pulls, how loaded the bag) and never the prize, because the prize is the surprise. Sent
                // best-first so the screen reads as something to climb toward.
                ranks: RUN_RANKS.map((r) => ({
                    key: r.key, label: r.label, color: r.color,
                    from: Math.round(r.min * 100),
                    ore: Math.max(1, Math.round(baseOre(current.tier) * r.oreMult * haulMult)),
                    bonus: Math.round(r.bonus * 100),
                })),
                // One extra pull sometimes, from the Haul track — worth saying, since it's a thing you bought.
                haulExtra: Math.round(haulMult * 100 - 100),
            };
        })() : null,
        ore: (ore || []).map((r) => {
            const o = oreTier(r.tier);
            const cost = smeltCostFor(row?.crucible_level);
            const qty = Number(r.qty);
            return { tier: r.tier, name: o.ore, color: o.color, art: oreArt(r.tier), qty, partTier: o.part,
                smeltCost: cost, canSmelt: Math.floor(qty / cost) };
        }),
        oreTotal: (ore || []).reduce((s, r) => s + Number(r.qty), 0),
        // What you could smelt RIGHT NOW, in parts. The tab badge counted raw ore, so 2 Iron Ore — three short
        // of a single Iron Filing — lit a red "2" that promised something to do and then said "Not enough".
        partsReady: (ore || []).reduce((s, r) => {
            const cost = smeltCostFor(row?.crucible_level);
            return s + Math.floor(Number(r.qty) / Math.max(1, cost));
        }, 0),
        gold: Number(goldRow?.gold) || 0,
        stats: {
            nodesMined: Number(row?.nodes_mined) || 0,
            oreTotal: Number(row?.ore_total) || 0,
            bestCombo: Number(row?.best_combo) || 0,
            upgradeLevels: lvls,
        },
    };
}

// How hard one swing lands, before the timing grade. Pickaxe track is the whole of it for now; the mining gear
// stat and the mining set plug in here in phase 3.
function swingPower(row) {
    const base = 18;
    return Math.max(1, Math.round(base * (1 + trackValue("pick", row?.pick_level))));
}

// ── THE SWING ────────────────────────────────────────────────────────────────────────────────────────────────
// `dist` is the client's distance-from-centre off the timing bar. Graded HERE and clamped, so a tampered client
// can't claim a perfect strike every time.
export async function swingAtNode(buyerId, nodeId, dist = null) {
    if (!MINING_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    const arrivedAt = new Date(); // stamped on ARRIVAL — our latency is not the player's cadence
    const row = await minerRow(buyerId);
    if (!row) return { ok: false, error: "no_miner" };

    // Swings are NOT metered any more. You paid for the trip; the seam is yours to break. Metering both was
    // two budgets guarding one activity, and the second one only ever stopped people mid-rock.

    const node = await db.queryOne(`SELECT id, tier, hp, hp_max, x, y FROM mkt_ore_node WHERE id = $1 AND status = 'active'`, [nodeId]).catch(() => null);
    if (!node) return { ok: false, error: "node_gone" };

    // swings and grade_sum MUST be in this SELECT. They weren't, so `prior.swings` and `prior.grade_sum` were
    // both undefined on every swing — which meant hitsSoFar was permanently 1 (the hand never ran out) and the
    // score handed to claimNode was only ever the LAST swing's, so a flawless eight-swing run was ranked as a
    // single hit out of eight and came back BUTCHERED. The columns were being written correctly the whole time;
    // nothing ever read them back.
    const prior = await db.queryOne(
        `SELECT combo, last_swing_at, swings, grade_sum FROM mkt_ore_node_hit WHERE node_id = $1 AND buyer_id = $2`,
        [nodeId, buyerId]
    ).catch(() => null);
    if (prior?.last_swing_at && Date.now() - new Date(prior.last_swing_at).getTime() < SWING_THROTTLE_MS) {
        return { ok: false, error: "too_fast" };
    }

    // A distance of exactly 0 is the BEST swing in the game — test for null, never for falsiness. (The raid
    // shipped `|| 0.5` here and graded dead-centre hits as the worst possible outcome.)
    const clamped = dist == null || Number.isNaN(Number(dist)) ? 0.5 : Math.min(0.5, Math.max(0, Number(dist)));
    const grade = gradeForDist(clamped, steadyHand(row?.vigor_level));

    // SEEDING THE POOL. A good swing does not make a known reward bigger — it drops a rarer TICKET into the
    // bag you will draw from when the seam breaks. So timing raises what is POSSIBLE, and the haul is still a
    // surprise. That is the whole difference between "you earned 7 ore" and "what did I get?".
    const seeded = grade.key === "pixel" ? ["rare", "rare"] : grade.key === "perfect" ? ["rare"]
        : grade.key === "great" ? ["good"] : [];

    const kept = (GRADE_RANK[grade.key] ?? 0) >= GRADE_RANK[COMBO_MIN_GRADE];
    const combo = kept ? (Number(prior?.combo) || 0) + 1 : 0;
    const comboMult = Math.min(COMBO_MAX, 1 + Math.max(0, combo - 1) * COMBO_STEP);

    const damage = Math.max(1, Math.round(swingPower(row) * grade.mult * comboMult));
    const hitsSoFar = (Number(prior?.swings) || 0) + 1;
    const score = (Number(prior?.grade_sum) || 0) + (HIT_SCORE[grade.key] || 0);

    await db.query(`UPDATE mkt_mining SET swing_used = swing_used + 1, updated_at = NOW() WHERE buyer_id = $1`, [buyerId]).catch(() => {});

    const after = await db.queryOne(
        `UPDATE mkt_ore_node SET hp = GREATEST(0, hp - $2) WHERE id = $1 AND status = 'active' RETURNING hp`,
        [nodeId, damage]
    ).catch(() => null);
    await db.query(
        `INSERT INTO mkt_ore_node_hit (node_id, buyer_id, damage, swings, combo, last_swing_at, grade_sum, pool_json) VALUES ($1, $2, $3, 1, $4, $5, $6, $7::jsonb)
         ON CONFLICT (node_id, buyer_id) DO UPDATE SET damage = mkt_ore_node_hit.damage + $3,
             swings = mkt_ore_node_hit.swings + 1, combo = $4, last_swing_at = $5,
             grade_sum = mkt_ore_node_hit.grade_sum + $6,
             pool_json = COALESCE(mkt_ore_node_hit.pool_json, '[]'::jsonb) || $7::jsonb`,
        [nodeId, buyerId, damage, combo, arrivedAt, HIT_SCORE[grade.key] || 0, JSON.stringify(seeded)]
    ).catch(() => {});
    if (combo > (Number(row.best_combo) || 0)) {
        await db.query(`UPDATE mkt_mining SET best_combo = $2 WHERE buyer_id = $1`, [buyerId, combo]).catch(() => {});
    }

    // THE ROCK BREAKING IS THE ENDING. Swing as long as you like; the seam is spent when its HP is gone.
    const hp = after?.hp ?? node.hp;
    const spent = hp <= 0;
    let cracked = null;
    if (spent) cracked = await claimNode(buyerId, node, row, { score, hits: hitsSoFar });

    return {
        ok: true,
        damage, grade: grade.key, gradeLabel: grade.label,
        combo, comboMult: Math.round(comboMult * 100) / 100, comboBroken: !kept && (Number(prior?.combo) || 0) >= 3,
        cooldownMs: SWING_THROTTLE_MS,
        nodeId: Number(nodeId), hp, hpMax: Number(node.hp_max),
        pct: node.hp_max ? Math.max(0, Math.round((hp / node.hp_max) * 100)) : 0,
        hits: hitsSoFar,
        // Your running AVERAGE swing quality, 0..100 — the thing the rank is actually read off, so the HUD can
        // show where you'd land if the rock broke on this swing.
        quality: Math.round((score / Math.max(1, hitsSoFar * HIT_SCORE.pixel)) * 100),
        cracked,

    };
}

// The seam broke. WHAT IT HELD IS A DRAW, not a sum.
//
// The bag always holds ordinary rock. Every clean swing you landed dropped a better ticket in. Then you pull
// three times and find out. Nothing is decided until the seam opens, which is the point — a fixed payout you
// could compute on the way in is not a reward, it is an invoice.
async function claimNode(buyerId, node, row, run = {}) {
    const won = await db
        .queryOne(`UPDATE mkt_ore_node SET status = 'mined', mined_by = $2, mined_at = NOW() WHERE id = $1 AND status = 'active' RETURNING tier`, [node.id, buyerId])
        .catch(() => null);
    if (!won) return null; // someone else's swing landed first

    const mine = await db.queryOne(`SELECT swings, pool_json FROM mkt_ore_node_hit WHERE node_id = $1 AND buyer_id = $2`, [node.id, buyerId]).catch(() => null);
    const seeds = Array.isArray(mine?.pool_json) ? mine.pool_json : [];
    const o = oreTier(node.tier);
    const haulBonus = trackValue("haul", row?.haul_level);

    // THE RANK. Your AVERAGE swing quality across however many swings it took — not a share of a fixed hand,
    // because there is no fixed hand any more. Averaging is what keeps a long sloppy grind from out-ranking a
    // short clean one: taking twenty swings to break a seam cannot buy you a better rank than taking six.
    const hits = Math.max(1, Number(run.hits) || 1);
    const pct = Math.max(0, Math.min(1, (run.score || 0) / (hits * HIT_SCORE.pixel)));
    const rank = rankFor(pct);

    // ── WHAT THE SEAM PAYS ───────────────────────────────────────────────────────────────────────────────
    // Ore, gold and XP — always. Then ONE bonus, sometimes. Exactly the farm's shape, because the bag of
    // tickets it replaces was handing out six things at once off a single Coal seam and none of them felt
    // like anything.
    const ore = Math.max(1, Math.round(baseOre(node.tier) * rank.oreMult * (1 + haulBonus)));
    await db.query(
        `INSERT INTO mkt_ore (buyer_id, tier, qty) VALUES ($1,$2,$3)
         ON CONFLICT (buyer_id, tier) DO UPDATE SET qty = mkt_ore.qty + EXCLUDED.qty`,
        [buyerId, node.tier, ore]
    ).catch(() => {});

    const gold = Math.round(o.gold * (1 + pct) * (1 + haulBonus));
    const goldRow = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, gold]).catch(() => null);
    await logCoin(buyerId, gold, "mining", { balanceAfter: goldRow?.gold, meta: { kind: "seam", tier: node.tier } }).catch(() => {});

    // THE BONUS. One roll, one thing. Your rank is most of it; clean swings nudge it (the same tickets as
    // before, worth a little luck each instead of being a currency you spend on pulls).
    const luck = Math.min(0.22, seeds.filter((x) => x === "rare").length * 0.02 + seeds.filter((x) => x !== "rare").length * 0.008);
    let bonus = null;
    if (Math.random() < rank.bonus + luck) {
        const roll = Math.random();
        const lift = rank.key === "s" ? 1 : 0;
        const ladder = ["wooden", "iron", "gold", "mythic", "ascendant"];
        if (roll < 0.34) {
            const t = ladder[Math.min(ladder.length - 1, Math.max(0, node.tier - 2 + lift))] || "wooden";
            await addChests(buyerId, { [t]: 1 }, { source: "mining" }).catch(() => {});
            bonus = { kind: "chest", tier: t, name: `${t[0].toUpperCase()}${t.slice(1)} chest` };
        } else if (roll < 0.62) {
            const got = await grantMiningGear(buyerId, 3 + node.tier);
            if (got) bonus = { kind: "gear", ...got };
        } else if (roll < 0.90) {
            const got = await grantMiningConsumable(buyerId);
            if (got) bonus = { kind: "consumable", ...got };
        } else {
            const { grantRecipeReward } = await import("@/lib/marketplace/cooking.js");
            const rec = await grantRecipeReward(buyerId, node.tier >= 4 ? "seam_deep" : "seam").catch(() => null);
            if (rec) bonus = { kind: "recipe", name: rec.name, tier: rec.tier, art: "/images/cooking/dish.png" };
        }
        // Every branch can come up empty (you own all the gear, you know all the recipes). Pay ore rather than
        // showing a bonus slot with nothing in it.
        if (!bonus) {
            const extra = Math.max(2, Math.round(baseOre(node.tier) * 0.5));
            await db.query(`UPDATE mkt_ore SET qty = qty + $3 WHERE buyer_id = $1 AND tier = $2`, [buyerId, node.tier, extra]).catch(() => {});
            bonus = { kind: "ore", tier: node.tier, n: extra, name: o.ore, color: o.color, art: oreArt(node.tier) };
        }
    }

    const oreTotal = ore + (bonus?.kind === "ore" ? bonus.n : 0);
    await db.query(`UPDATE mkt_mining SET nodes_mined = nodes_mined + 1, ore_total = ore_total + $2, current_node_id = NULL, updated_at = NOW() WHERE buyer_id = $1`, [buyerId, oreTotal]).catch(() => {});
    // gold: 0 — awardXp pays gold 1:1 with points otherwise, and this is repeatable.
    await awardXp(buyerId, "mining", { points: Math.round(o.xp * (1 + pct)), gold: 0 }).catch(() => {});
    // Kept apart because they are worth different amounts of luck above: a PERFECT or PIXEL is a rare ticket,
    // a GREAT is a good one.
    const rareSeeds = seeds.filter((x) => x === "rare").length;
    const goodSeeds = seeds.length - rareSeeds;
    await trackActivity(buyerId, "ore_mined", { tier: node.tier, ore: oreTotal, rank: rank.key, bonus: bonus?.kind || null, rare: rareSeeds, good: goodSeeds }).catch(() => {});

    // BADGES. Granted at the moment they're earned, like fishing's and digging's — the counters live on
    // mkt_mining, not in getMemberMetrics, so an auto-rule sweep would need a second source of truth.
    //
    // All COUNTERS now, not "you did it once". A badge for cracking your first seam fired on the tutorial tap;
    // these want weeks. At three trips a day, 50 seams is a couple of weeks of actually turning up, 25
    // MASTERWORK runs is far longer because you have to keep playing well, and 10 Emberhearts means finding
    // the rarest rock in the mine ten separate times.
    const counts = await db.queryOne(
        `UPDATE mkt_mining
            SET masterwork_runs = masterwork_runs + $2,
                emberheart_cracked = emberheart_cracked + $3
          WHERE buyer_id = $1
          RETURNING nodes_mined, masterwork_runs, emberheart_cracked`,
        [buyerId, rank.key === "s" ? 1 : 0, node.tier >= 5 ? 1 : 0]
    ).catch(() => null);
    if ((Number(counts?.nodes_mined) || 0) >= 50) await grantEventBadge(buyerId, "mine_masterwork").catch(() => {});
    if ((Number(counts?.masterwork_runs) || 0) >= 25) await grantEventBadge(buyerId, "mine_masterhand").catch(() => {});
    if ((Number(counts?.emberheart_cracked) || 0) >= 10) await grantEventBadge(buyerId, "mine_emberheart").catch(() => {});

    return {
        tier: node.tier, name: o.name, oreName: o.ore, color: o.color, art: oreArt(node.tier),
        ore, gold, bonus, seeded: seeds.length, rareSeeds, goodSeeds, xp: Math.round(o.xp * (1 + pct)),
        rank: rank.key, rankLabel: rank.label, rankColor: rank.color,
        score: run.score || 0, scoreMax: hits * HIT_SCORE.pixel, pct: Math.round(pct * 100), hits,
    };
}

// ── THE SMELT ────────────────────────────────────────────────────────────────────────────────────────────────
// A minigame, not a button. You feed ore in and work the heat: the furnace climbs, and you have to pull the
// pour at the right moment. Too cold and the melt is dirty; too hot and you burn some of it off.
//
// What comes out is a DRAW, same principle as the seam. Heat quality seeds better tickets into the bag; the
// bag decides. So a perfect pour raises what's possible without ever making the result knowable in advance —
// and the ore tier sets the floor, so good rock still matters.
// Bands live in lib/marketplace/smelt-heat.js — the bar you watch and the grade you're paid for read the same
// numbers, so the lit "PERFECT" zone cannot drift away from the one that pays.

// Smelt a stack. `heat` is 0..1+ from the client's heat bar — graded HERE and clamped, so a tampered client
// can't claim a perfect pour every time.
export async function smeltOre(buyerId, tier, dists = null) {
    if (!MINING_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    const t = Number(tier);
    if (!ORE_TIERS[t]) return { ok: false, error: "bad_tier" };
    const row = await minerRow(buyerId);
    const cost = smeltCostFor(row?.crucible_level);

    // ONE BATCH PER SMELT. It used to melt the entire stack in a single tap — twenty-four ore, one heat
    // reading, eight parts — which is why the minigame did not matter: you played it once a day. A smelt is
    // now exactly what the row says it is: `cost` ore in, one part out, one hand of the game played.
    const spend = cost;

    // Atomic guarded spend — the WHERE is what stops a double-tap smelting ore you no longer have.
    const spent = await db
        .queryOne(`UPDATE mkt_ore SET qty = qty - $3 WHERE buyer_id = $1 AND tier = $2 AND qty >= $3 RETURNING qty`, [buyerId, t, spend])
        .catch(() => null);
    if (!spent) return { ok: false, error: "not_enough_ore" };

    const o = oreTier(t);
    // THREE POURS on the real timing bar. The client sends its distance-from-centre for each phase; every one
    // is graded HERE and clamped, so a tampered client cannot claim three flawless pours.
    //
    // A missing reading is treated as merely SERVICEABLE rather than punished — never make someone worse off
    // for a bug on our side.
    const raw = Array.isArray(dists) ? dists : [dists];
    const readings = raw
        .slice(0, SMELT_PHASES)
        .map((x) => (x == null || Number.isNaN(Number(x)) ? 0.12 : Math.min(0.5, Math.max(0, Number(x)))));
    while (readings.length < SMELT_PHASES) readings.push(0.12);
    const bands = readings.map((x) => smeltGrade(x));
    // The WORST pour counts double. A smelt is a chain — a spilled first pour is not redeemed by nailing the
    // last one — and a plain average let one fumble hide behind two good reads.
    const worst = bands.reduce((a, b) => (b.mult < a.mult ? b : a), bands[0]);
    const avgMult = (bands.reduce((n2, b) => n2 + b.mult, 0) + worst.mult) / (bands.length + 1);
    // The band reported back is whichever best describes the run as a whole.
    const band = [...SMELT_GRADES, SMELT_MISS]
        .reduce((a, b) => (Math.abs(b.mult - avgMult) < Math.abs(a.mult - avgMult) ? b : a), SMELT_GRADES[0]);
    const n = 1;

    // THE BAG. Ordinary parts always; the pour and your upgrades seed the better tickets.
    const bellows = smeltValue("bellows", row?.bellows_level);
    const flux = smeltValue("flux", row?.flux_level);
    const bag = [];
    for (let i = 0; i < 10; i += 1) bag.push("part");
    // Heat quality is the biggest lever on the bag — that's what makes the pour worth playing.
    const heatTickets = band.key === "pixel" ? 7 : band.key === "perfect" ? 5 : band.key === "great" ? 2 : 0;
    for (let i = 0; i < heatTickets; i += 1) bag.push(Math.random() < 0.5 ? "up" : "extra");
    for (let i = 0; i < Math.round(flux * 12); i += 1) bag.push("up");
    for (let i = 0; i < Math.round(bellows * 12); i += 1) bag.push("extra");
    // Only a genuinely good pour can turn up a curio — the fun stuff that isn't a part at all.
    if (band.key === "pixel") bag.push("curio", "curio");
    else if (band.key === "perfect") bag.push("curio");

    // Draws scale with how the WHOLE run went, not one lucky pour. A single batch, so this is 1-2 draws.
    const draws = Math.max(1, Math.round(avgMult));
    const made = {};
    let extras = 0, ups = 0;
    const curios = [];
    const add = (pt, count) => { made[pt] = (made[pt] || 0) + count; };
    for (let i = 0; i < draws; i += 1) {
        const ticket = bag[Math.floor(Math.random() * bag.length)] || "part";
        if (ticket === "up" && o.part < 5) { add(o.part + 1, 1); ups += 1; }
        else if (ticket === "extra") { add(o.part, 2); extras += 1; }
        else if (ticket === "curio") curios.push(Math.random() < 0.5 ? "chest" : Math.random() < 0.6 ? "consumable" : "gear");
        else add(o.part, 1);
    }

    const { addParts } = await import("@/lib/marketplace/crafting.js");
    for (const [partTier, count] of Object.entries(made)) await addParts(buyerId, Number(partTier), count).catch(() => {});

    // Curios — the reason to care about a perfect pour beyond the part count.
    const bonus = [];
    for (const c of curios) {
        if (c === "chest") {
            const chestTier = t >= 4 ? "gold" : t >= 2 ? "iron" : "wooden";
            await addChests(buyerId, { [chestTier]: 1 }, { source: "mining" }).catch(() => {});
            bonus.push({ kind: "chest", tier: chestTier });
        } else if (c === "gear") {
            const got = await grantMiningGear(buyerId, 3 + t);
            if (got) bonus.push({ kind: "gear", ...got });
        } else {
            const got = await grantMiningConsumable(buyerId);
            if (got) bonus.push({ kind: "consumable", ...got });
        }
    }

    const totalParts = Object.values(made).reduce((a, b) => a + b, 0);
    const melted = await db.queryOne(`UPDATE mkt_mining SET ore_smelted = COALESCE(ore_smelted, 0) + $2 WHERE buyer_id = $1 RETURNING ore_smelted`, [buyerId, spend]).catch(() => null);
    if ((Number(melted?.ore_smelted) || 0) >= 1000) await grantEventBadge(buyerId, "mine_forgefed").catch(() => {});
    await trackActivity(buyerId, "ore_smelted", { tier: t, ore: spend, parts: totalParts, band: band.key, ups, extras, bonus: bonus.length }).catch(() => {});
    return {
        ok: true,
        smelted: {
            oreTier: t, oreName: o.ore, oreSpent: spend, partTier: o.part,
            phases: bands.map((b) => ({ key: b.key, label: b.label, mult: b.mult })),
            band: band.key, bandLabel: band.label, bandBlurb: null,
            parts: totalParts, ups, extras, bonus,
            byTier: Object.entries(made).map(([pt, count]) => ({ partTier: Number(pt), count, lifted: Number(pt) > o.part })).sort((a, b) => a.partTier - b.partTier),
        },
        ...(await getMiningState(buyerId)),
    };
}

// ── UPGRADES ─────────────────────────────────────────────────────────────────────────────────────────────────
export async function upgradeMining(buyerId, track) {
    if (!MINING_UNLOCKED(buyerId)) return { ok: false, error: "locked" };
    const t = MINE_TRACKS[track] || SURVEY_TRACKS[track] || SMELT_TRACKS[track];
    if (!t) return { ok: false, error: "bad_track" };
    const row = await minerRow(buyerId);
    const level = Number(row?.[t.col]) || 0;
    if (level >= t.max) return { ok: false, error: "maxed" };
    const cost = trackCost(level);

    const paid = await db
        .queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, cost])
        .catch(() => null);
    if (!paid) return { ok: false, error: "not_enough_gold" };
    await logCoin(buyerId, -cost, "mining_upgrade", { balanceAfter: paid.gold, meta: { track } }).catch(() => {});
    await db.query(`UPDATE mkt_mining SET ${t.col} = ${t.col} + 1, updated_at = NOW() WHERE buyer_id = $1`, [buyerId]).catch(() => {});
    await trackActivity(buyerId, "mining_upgrade", { track, to: level + 1 }).catch(() => {});
    return { ok: true, ...(await getMiningState(buyerId)) };
}
