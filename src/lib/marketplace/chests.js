import "server-only";

import { db } from "@/lib/db";
import { RARITIES } from "@/lib/marketplace/rarity.js";
import { grantItem } from "@/lib/marketplace/inventory.js";
import { ITEMS } from "@/lib/marketplace/items.js";
import { CONSUMABLES, grantConsumable } from "@/lib/marketplace/consumables.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { maybeGrantChestPet } from "@/lib/marketplace/pet-drops.js";
import { signatureFor } from "@/lib/marketplace/signatures.js";
import { levelForXp } from "@/lib/marketplace/xp.js";
import { getChestArt } from "@/lib/marketplace/chest-art.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { hasPower, oneIn, claimPowerUse } from "@/lib/marketplace/ascension-powers.js";
import { mint } from "@/lib/marketplace/gold-rate.js";

// Loot chests: opened for random gear. Every tier is a SPREAD that shifts its odds toward better gear as
// you go up — but NONE guarantee a rarity, so even the top chest can under-roll and even a wooden chest has
// a sliver of a shot at something great. Ascendant/Eternal only appear in the top few tiers' spreads.
// How often a chest's contents ARE a recipe, by tier. Sits with the chest's other odds because that is what
// it is now — part of what a chest pays out, not a lottery running beside it.
// CUT HARD. A recipe should be a thing you remember, not something that turns up every few chests. Roughly a
// third of the first pass, and the low tiers cut most — a wooden chest coughing one up 3% of the time made the
// commonest chest in the game a reliable recipe source.
const RECIPE_CHANCE = { wooden: 0.008, iron: 0.014, gold: 0.025, mythic: 0.045, ascendant: 0.060, eternal: 0.075 };
// ── AND A HANDFUL OF SEEDS, AS ONE OF THE THINGS A CHEST CONTAINS ────────────────────────────────────────────
// Sits in the same chain as the recipe and the gem: the chest either gives you seeds or it doesn't, drawn
// like every other outcome. It is deliberately commoner than either — seeds are a supply, not a find — and
// banded by tier, so a wooden chest cannot hold a Star Fruit however many you open.
//
// The old seed table listed all three chest tiers with tuned odds and nothing ever called them.
const SEED_CHANCE = { wooden: 0.10, iron: 0.13, gold: 0.16, mythic: 0.18, ascendant: 0.20, eternal: 0.22 };
const SEED_COUNT = { wooden: 2, iron: 2, gold: 3, mythic: 3, ascendant: 4, eternal: 4 };

// How often a chest gives a GEM instead of its ordinary contents. Deliberately in the same order of
// magnitude as the recipe chance above — a gem should feel like a find, and gear is still what a chest is
// FOR. Measured, not guessed: 2,037 chests were opened across the Den in the last 7 days (207 in the last
// 24h), so at these rates this is very roughly 4-6 gems a day into a bench that has seen 28 gems TOTAL. Enough
// to make the Jewelcutter a place you visit; nowhere near enough to make gear feel like the consolation.
// Celestial and primordial were missing, so the two RAREST chests in the game were the only two that could
// never produce a gem — `|| 0` at the read site made that silent. They continue the same gentle curve.
const GEM_CHEST_CHANCE = { wooden: 0.010, iron: 0.018, gold: 0.030, mythic: 0.045, ascendant: 0.055, eternal: 0.065,
    celestial: 0.075, primordial: 0.085 };

// The recipe_nose companion perk, read once per open.
async function recipeLuckFor(buyerId) {
    try {
        const { recipeLuck } = await import("@/lib/marketplace/cooking.js");
        return await recipeLuck(buyerId);
    } catch { return 1; }
}

export const CHEST_TIERS = {
    wooden: { label: "Wooden Chest", emoji: "📦", color: "#b08a52", weights: { common: 72, rare: 25, epic: 3 } },
    iron: { label: "Iron Chest", emoji: "🧰", color: "#9fb3c8", weights: { common: 44, rare: 40, epic: 14, legendary: 2 } },
    gold: { label: "Gold Chest", emoji: "💰", color: "#ffd75e", weights: { rare: 40, epic: 42, legendary: 16, mythic: 2 } },
    // Top tiers span 5 rarities each, with the curve ANCHORED to the low end — most drops are the ordinary
    // gear in range and the top rarities are a rare thrill. Higher chests just nudge more weight upward.
    mythic: { label: "Mythic Chest", emoji: "💎", color: "#5affaf", weights: { rare: 10, epic: 42, legendary: 34, mythic: 14 } },
    ascendant: { label: "Ascendant Chest", emoji: "🌟", color: "#ff7a3c", weights: { epic: 34, legendary: 36, mythic: 22, ascendant: 7, eternal: 1 } },
    eternal: { label: "Eternal Chest", emoji: "👑", color: "#ff5cc8", weights: { epic: 30, legendary: 34, mythic: 24, ascendant: 9, eternal: 3 } },
    // ── THE TWO RAREST CHESTS ARE THE ONLY ROUTE TO THE TWO RAREST TIERS ─────────────────────────────────
    // 55 items — every celestial and every primordial piece — could not be obtained by anything at all: no
    // chest's table listed those rarities, so the top of the ladder was decoration. These are the numbers Luke
    // set, and they are literal percentages: every weights map here sums to exactly 100, so a weight of 2 is
    // 2% and the tables can be read straight off the page rather than worked out.
    //
    //   Celestial chest  -> 2% celestial, 0.3% primordial
    //   Primordial chest -> 6% celestial, 1% primordial
    //
    // The other five rarities keep their existing SHAPE — the remainder is scaled down in proportion — so the
    // only thing that has changed about these chests is that a sliver came off the ordinary end to pay for the
    // new tail. Deliberately tiny: with a primordial chest itself meant to be a once-a-year object, a 1% tail
    // on it is the rarest thing in the game by an order of magnitude, and that is the intent.
    celestial: { label: "Celestial Chest", emoji: "🌌", color: "#7c5cff",
        weights: { epic: 23.4, legendary: 31.3, mythic: 27.4, ascendant: 11.7, eternal: 3.9, celestial: 2, primordial: 0.3 } },
    primordial: { label: "Primordial Chest", emoji: "☀️", color: "#ffe9b0",
        weights: { epic: 16.7, legendary: 27.9, mythic: 27.9, ascendant: 14.9, eternal: 5.6, celestial: 6, primordial: 1 } },
};
export const CHEST_ORDER = ["wooden", "iron", "gold", "mythic", "ascendant", "eternal", "celestial", "primordial"];

// Gold consolation ("dust") when you already own every eligible item of the rolled rarity.
const DUST = { common: 25, rare: 60, epic: 140, legendary: 350, mythic: 900, ascendant: 3000, eternal: 8000, celestial: 15000, primordial: 40000 };

// Items a chest can produce (all non-charged loot gear). Charged/perk + level/shop items stay off the table.
const CHEST_POOL = ITEMS.filter((i) => (i.source === "chest" || i.source === "boss_drop") && !i.charged);
// Elite pool — the Ascendant/Eternal gear (charged, so it's excluded from the normal pool above). Only
// reachable by opening an elite chest.
const ELITE_POOL = ITEMS.filter((i) => i.source === "elite");
const ELITE_TIERS = new Set(["ascendant", "eternal", "celestial", "primordial"]);

// Chance a high-tier chest yields a CONSUMABLE instead of gear (+ which pool). The ultra relics
// (Elixir of Renewal / Sands of Time) only appear from Eternal chests and up.
// Forge-scroll drop chance by chest tier (a Power Scroll usually, rarely an Enchantment Scroll — see openChest).
const SCROLL_CHEST_CHANCE = { gold: 0.04, mythic: 0.08, ascendant: 0.12, eternal: 0.16, celestial: 0.20, primordial: 0.26 };
const CHEST_CONSUMABLES = {
    wooden: { chance: 0.06, pool: ["treat_bone", "treat_wild"] },
    iron: { chance: 0.08, pool: ["treat_wild", "treat_bone", "treat_snack", "farm_fertilizer_haul"] },
    gold: { chance: 0.1, pool: ["treat_wild", "treat_marrow", "treat_snack", "spin_rewind", "farm_fertilizer_haul"] },
    mythic: { chance: 0.12, pool: ["pot_berserker", "stone_ember", "pot_secondwind", "treat_marrow", "treat_mythic", "spin_golden_ticket"] },
    ascendant: { chance: 0.2, pool: ["pot_fury", "pot_berserker", "stone_storm", "scroll_ancient", "treat_mythic", "spin_golden_ticket"] },
    eternal: { chance: 0.32, pool: ["pot_fury", "scroll_ancient", "elixir_renewal", "sands_of_time", "treat_mythic", "treat_ambrosia", "spin_golden_ticket"] },
    celestial: { chance: 0.55, pool: ["elixir_renewal", "sands_of_time", "pot_fury", "scroll_ancient", "treat_ambrosia"] },
    primordial: { chance: 0.75, pool: ["elixir_renewal", "sands_of_time", "treat_ambrosia"] },
};

// Level-up chests are deliberately CAPPED at Gold (never Mythic) and reach the higher tiers later, so
// leveling doesn't firehose legendary/mythic gear. Rarer loot comes from OPENING those chests, the boss,
// and elite grants — not from the level-up cadence itself.
function tierForLevel(level) {
    if (level >= 35) return "gold"; // cap — no Mythic chests from level-ups
    if (level >= 15) return "iron";
    return "wooden";
}

// Elite-chest lottery: a rare BONUS roll on each MILESTONE level-up (every tenth, from L20). Ordered
// rarest-first and stops at the first hit, so you get at most one elite chest per milestone and the tiers get
// exponentially harder to see — the last three especially. This is how Ascendant→Primordial chests are earned
// purely through play. The odds below are per ROLL; see syncLevelChests for how often a roll happens.
const ELITE_CHEST_LOTTERY = [
    { tier: "primordial", chance: 0.00015 }, // ~1 in 6,700 level-ups
    { tier: "celestial", chance: 0.0012 }, //  ~1 in 830
    { tier: "eternal", chance: 0.006 }, //     ~1 in 165
    { tier: "ascendant", chance: 0.025 }, //   ~1 in 40
];

function rollRarity(weights) {
    const total = Object.values(weights).reduce((s, w) => s + w, 0);
    let r = Math.random() * total;
    for (const [rarity, w] of Object.entries(weights)) { r -= w; if (r <= 0) return rarity; }
    return Object.keys(weights)[0];
}

// Grant chests. `ctx` = { source, meta } records WHERE each chest came from in the audit log (mkt_chest_grant),
// so "where did this member get that chest?" is always answerable. Logging is best-effort — never blocks a grant.
export async function addChests(buyerId, tally, { source = "unknown", meta = null } = {}) {
    for (const [t, n] of Object.entries(tally)) {
        if (!n) continue;
        await db.query(
            `INSERT INTO mkt_user_chest (buyer_id, tier, count) VALUES ($1, $2, $3)
             ON CONFLICT (buyer_id, tier) DO UPDATE SET count = mkt_user_chest.count + $3`,
            [buyerId, t, n]
        ).catch(() => {});
        await db.query(
            `INSERT INTO mkt_chest_grant (buyer_id, tier, count, source, meta) VALUES ($1, $2, $3, $4, $5::jsonb)`,
            [buyerId, t, n, String(source || "unknown").slice(0, 40), JSON.stringify(meta || {})]
        ).catch(() => {});
    }
}

// Read a member's chest-grant history (newest first) — what they got, where from, when.
export async function chestGrantHistory(buyerId, { limit = 100 } = {}) {
    if (!buyerId) return [];
    const rows = await db.query(
        `SELECT tier, count, source, meta, created_at FROM mkt_chest_grant WHERE buyer_id = $1 ORDER BY created_at DESC LIMIT $2`,
        [buyerId, Math.min(500, Math.max(1, limit))]
    ).catch(() => []);
    return rows.map((r) => ({ tier: r.tier, count: Number(r.count), source: r.source, meta: r.meta || {}, at: r.created_at }));
}

// Grant loot chests for level-ups.
//
// THE CADENCE IS EVERY TENTH LEVEL, and the Rewards Track is the contract: it prints "💰 Gold Chest" on levels
// 10, 20, 30… and prints nothing on the nine levels in between (track.js — `L % 10 === 0`). This used to hand
// out a chest on EVERY level as well, so the track advertised one chest per ten and the game paid eleven. That
// made level-ups the second-largest chest faucet in the whole economy behind the daily cards, on a cadence
// nobody was ever promised.
//
// Nothing is clawed back. Chests already opened stay opened, and everyone keeps what they were given under the
// old rule — the leak was ours, and members budgeted around what they had. This only stops the bleed going
// forward.
export async function syncLevelChests(buyerId) {
    if (!buyerId) return {};
    const row = await db.queryOne(`SELECT COALESCE(xp,0) AS xp, COALESCE(chest_level,0) AS chest_level FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    if (!row) return {};
    const level = levelForXp(row.xp).level;

    // First encounter: seed to current level, one welcome chest, NO back-fill. Kept deliberately even though
    // the track does not print it — it is a one-time hello, not a cadence, and it is the difference between a
    // new member's chest panel having something in it and being an empty box with a note about level 10.
    if (row.chest_level === 0) {
        const tally = { [tierForLevel(level)]: 1 };
        await addChests(buyerId, tally, { source: "level_up", meta: { level, welcome: true } });
        await db.query(`UPDATE mkt_buyer SET chest_level = $2 WHERE id = $1`, [buyerId, level]).catch(() => {});
        return tally;
    }

    if (level <= row.chest_level) return {};
    const tally = {};
    for (let L = row.chest_level + 1; L <= level; L++) {
        // The milestone, and the ONLY level-up chest: a Gold Chest every tenth level, exactly as the track
        // says. The loop still walks every level so that gaining several at once (which happens constantly
        // from a big raid) cannot skip a milestone it passed through.
        if (L % 10 !== 0) continue;
        tally.gold = (tally.gold || 0) + 1;
        // Elite lottery: a tiny shot at an Ascendant→Primordial chest riding ON the milestone. It used to roll
        // on every level from 20, which is ten rolls per advertised chest — the same leak wearing a different
        // hat, and the reason three Ascendants are already out. Odds per roll are untouched; only the number
        // of rolls changes, so an elite chest stays a real thing that happens, just at the promised cadence.
        if (L >= 20) {
            for (const e of ELITE_CHEST_LOTTERY) { if (Math.random() < e.chance) { tally[e.tier] = (tally[e.tier] || 0) + 1; break; } }
        }
    }
    // A run of levels that crossed no milestone grants nothing — don't write an empty grant row.
    if (!Object.keys(tally).length) {
        await db.query(`UPDATE mkt_buyer SET chest_level = $2 WHERE id = $1`, [buyerId, level]).catch(() => {});
        return {};
    }
    await addChests(buyerId, tally, { source: "level_up", meta: { level } });
    await db.query(`UPDATE mkt_buyer SET chest_level = $2 WHERE id = $1`, [buyerId, level]).catch(() => {});
    return tally;
}

// Current chest counts by tier (syncs owed chests first).
export async function getChests(buyerId) {
    if (!buyerId) return [];
    await syncLevelChests(buyerId).catch(() => {});
    const [rows, art] = await Promise.all([
        db.query(`SELECT tier, count FROM mkt_user_chest WHERE buyer_id = $1 AND count > 0`, [buyerId]).catch(() => []),
        getChestArt().catch(() => ({})),
    ]);
    const counts = Object.fromEntries(rows.map((r) => [r.tier, r.count]));
    return CHEST_ORDER.filter((t) => counts[t]).map((t) => ({ tier: t, count: counts[t], ...CHEST_TIERS[t], image: art[t] || null }));
}

// ── OPENING A PILE OF THEM ───────────────────────────────────────────────────────────────────────────────────
// Twenty-eight chests is twenty-eight taps, twenty-eight one-and-a-half-second shakes and twenty-eight
// full-screen celebrations to dismiss. The celebration is right for ONE chest and it is the reason nobody
// opens a backlog.
//
// This is a loop over openChest and NOTHING ELSE — every roll, every power, every promotion and every atomic
// decrement is the single-open path, unchanged. A second implementation of what a chest contains is exactly
// the kind of thing that drifts and starts paying different odds through a different button.
//
// CAPPED PER CALL, and the cap is a real one: a single open costs the better part of a dozen queries once the
// recipe, seed, pet, gem, scroll and consumable rolls have each had their turn, so an uncapped "open 200"
// would be a request that runs until the platform kills it halfway through — chests debited, loot half
// granted. `more` is what is left, so the screen can go round again and show progress instead.
export const BULK_OPEN_CAP = 10;

/**
 * Open up to `max` chests, either of one tier or across every tier you hold (richest first — a pile opened
 * top-down ends on your best chest rather than your worst).
 */
export async function openChests(buyerId, { tier = null, max = BULK_OPEN_CAP } = {}) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    if (tier && !CHEST_TIERS[tier]) return { ok: false, error: "unknown_tier" };
    const limit = Math.max(1, Math.min(BULK_OPEN_CAP, Number(max) || BULK_OPEN_CAP));

    // Richest first. CHEST_ORDER runs wooden→primordial, so this walks it backwards.
    const order = tier ? [tier] : [...CHEST_ORDER].reverse();
    const opens = [];
    for (const t of order) {
        while (opens.length < limit) {
            // eslint-disable-next-line no-await-in-loop
            const one = await openChest(buyerId, t);
            // `no_chest` is the ordinary end of a tier, not a failure — the guarded decrement inside openChest
            // is what tells us the stack is empty, which is also what makes this safe against a second tab.
            if (!one?.ok) break;
            opens.push({ ...one, tier: t });
        }
        if (opens.length >= limit) break;
    }
    if (!opens.length) return { ok: false, error: "no_chest", chests: await getChests(buyerId) };

    const chests = await getChests(buyerId);
    return {
        ok: true,
        bulk: true,
        opened: opens.length,
        opens,
        chests,
        // What is still sitting there. Zero means the pile is gone; anything else is the screen's cue to
        // offer another round rather than leaving somebody wondering why 28 became 18.
        more: chests.reduce((n, c) => n + (tier ? (c.tier === tier ? c.count : 0) : c.count), 0),
    };
}

// Open one chest of a tier: roll a rarity, grant a random un-owned item of it (or gold dust if you own
// them all). Returns the reveal for the animation.
export async function openChest(buyerId, tier) {
    const def = CHEST_TIERS[tier];
    if (!def) return { ok: false, error: "unknown_tier" };
    const dec = await db.queryOne(`UPDATE mkt_user_chest SET count = count - 1 WHERE buyer_id = $1 AND tier = $2 AND count > 0 RETURNING count`, [buyerId, tier]).catch(() => null);
    if (!dec) return { ok: false, error: "no_chest" };
    // ── THE BURN SIDE OF THE LEDGER ──────────────────────────────────────────────────────────────────────
    // The decrement above was the only record that a chest ever left circulation, and a decrement is not a
    // record — it is the absence of one. Every question worth asking about the chest economy needs this row:
    // how many are opened against how many are handed out, whether the pile is growing, what the sink rate
    // is. mkt_chest_grant has always had the mint half; this is the other one.
    //
    // Written immediately after the guarded UPDATE that proves a chest was actually taken, so a row can never
    // claim an open that did not happen. Best-effort like the grant side: an analytics write must never be
    // the reason somebody loses a chest they have already spent.
    await db.query(
        `INSERT INTO mkt_chest_open (buyer_id, tier, count, source) VALUES ($1, $2, 1, $3)`,
        [buyerId, tier, "open"],
    ).catch(() => {});
    await trackActivity(buyerId, "open_chest", { tier });
    // Chest opens can also drop a farming seed (tier scales rarity). Dynamic import avoids a chests↔farm-crops
    // static import cycle (farm-crops pulls in quests/xp, which pull in chests).
    // A RECIPE IS ONE OF THE THINGS A CHEST CAN CONTAIN — rolled here, in the chest's own priority chain,
    // and returned as the chest's contents. It used to be a separate hidden roll made BEFORE the chest decided
    // anything, then stapled to whatever else came out as a side field: you opened a chest, got a sword, and a
    // recipe also happened. Now the chest either gives you a recipe or it doesn't, like every other outcome.
    //
    // Banded by tier: a wooden chest can never produce a Legendary recipe however many you open. Deferred
    // import — chests.js is pulled in by cooking.js, and a static edge back would be a cycle.
    const band = tier === "wooden" ? "chest_wooden" : tier === "iron" ? "chest_iron" : tier === "gold" ? "chest_gold" : "chest_high";
    if (Math.random() < (RECIPE_CHANCE[tier] || 0) * await recipeLuckFor(buyerId)) {
        const { grantRecipeReward } = await import("@/lib/marketplace/cooking.js");
        const rec = await grantRecipeReward(buyerId, band).catch(() => null);
        // Null means they already know every recipe in this band — fall through to the ordinary loot rather
        // than paying out nothing, which is what a silent side-roll would have done.
        if (rec) return { ok: true, remaining: dec.count, recipe: rec };
    }

    if (Math.random() < (SEED_CHANCE[tier] || 0)) {
        const { grantSeedFromBand } = await import("@/lib/marketplace/farm-crops.js");
        const seedBand = tier === "wooden" ? "chest_wooden" : tier === "iron" ? "chest_iron" : "chest_gold";
        const got = [];
        for (let i = 0, n = SEED_COUNT[tier] || 2; i < n; i += 1) {
            const one = await grantSeedFromBand(buyerId, seedBand).catch(() => null);
            if (one) got.push(one);
        }
        if (got.length) return { ok: true, remaining: dec.count, seeds: got };
    }

    // A chance at a companion PET from this chest tier — the standout reveal.
    const petDrop = await maybeGrantChestPet(buyerId, tier).catch(() => null);
    if (petDrop) return { ok: true, remaining: dec.count, pet: petDrop };

    // ── A GEM, LOW TIERS ONLY ────────────────────────────────────────────────────────────────────────────
    // Gems had no real path into the game. Mining dropped them, the wheel had a wedge, the Armoury sold one —
    // and that was it. 28 gems had entered the world in total, against a bench of five kinds x five tiers
    // plus the Wolf's Eye. Chests are the one reward object every system already pays in (digging, delves,
    // the mine, raids, quests, dailies, the merchant), so this is the change that gives the Jewelcutter a
    // supply without inventing a new drop anywhere.
    //
    // TIER 1-2 ONLY, deliberately. The top of the gem ladder should stay something you FUSE toward at the
    // bench rather than something a chest hands you — that is the whole reason gems are tiered. A richer
    // chest raises the CHANCE, never the tier.
    const gChance = GEM_CHEST_CHANCE[tier] || 0;
    if (gChance && Math.random() < gChance) {
        const { GEM_KINDS, gemId } = await import("@/lib/marketplace/gems.js");
        const { grantGem } = await import("@/lib/marketplace/jeweller.js");
        const kind = GEM_KINDS[Math.floor(Math.random() * GEM_KINDS.length)];
        // Tier 2 only from gold and up, and never more than that.
        const gTier = (tier === "wooden" || tier === "iron") ? 1 : (Math.random() < 0.25 ? 2 : 1);
        const got = await grantGem(buyerId, gemId(kind.id, gTier), 1, "chest").catch(() => null);
        if (got?.ok) return { ok: true, remaining: dec.count, gem: got.gem };
        // A gem that failed to grant falls through to ordinary loot rather than eating the chest.
    }

    // FORGE SCROLLS — Gold+ chests can drop a Power Scroll (a free Forge enhance); RARELY an Enchantment Scroll
    // (permanently add an elemental affinity) instead.
    const sChance = SCROLL_CHEST_CHANCE[tier] || 0;
    if (sChance && Math.random() < sChance) {
        const cid = Math.random() < 0.12 ? "forge_enchant_scroll" : "forge_power_scroll";
        await grantConsumable(buyerId, cid);
        const c = CONSUMABLES[cid];
        return { ok: true, remaining: dec.count, consumable: { id: cid, name: c.name, emoji: c.emoji, kind: c.kind, desc: c.desc } };
    }

    // High-tier chests can cough up a consumable instead of gear (this is the main way to get relics).
    const cc = CHEST_CONSUMABLES[tier];
    if (cc && Math.random() < cc.chance) {
        const cid = cc.pool[Math.floor(Math.random() * cc.pool.length)];
        await grantConsumable(buyerId, cid);
        const c = CONSUMABLES[cid];
        return { ok: true, remaining: dec.count, consumable: { id: cid, name: c.name, emoji: c.emoji, kind: c.kind, desc: c.desc } };
    }

    const ownedRows = await db.query(`SELECT item_id FROM mkt_user_item WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    const owned = new Set(ownedRows.map((r) => r.item_id));
    // A chest-luck companion can promote the roll one rarity band up — stated exactly on the pet card.
    const RARITY_LADDER = RARITIES;   // shared ladder — it now runs two tiers past eternal
    let rarity = rollRarity(def.weights);
    // ── THE CHEST POWERS ─────────────────────────────────────────────────────────────────────────────────
    // The Locksmith promotes one chest in three, on top of whatever chest_luck rolls below. AFTER the roll,
    // obviously — the first pass put it above the `let` and lint:undef caught the temporal dead zone.
    // Twin Hinges is a once-a-day double, claimed atomically so two taps cannot both take it.
    const twinHinges = await claimPowerUse(buyerId, "twin_hinges");
    const masterKey = await hasPower(buyerId, "master_key") && oneIn(3);
    if (await hasPower(buyerId, "locksmith") && oneIn(3)) {
        const li = RARITY_LADDER.indexOf(rarity);
        if (li >= 0 && li < RARITY_LADDER.length - 1) rarity = RARITY_LADDER[li + 1];
    }
    try {
        const { getPetSystemPerk } = await import("@/lib/marketplace/pet-combat.js");
        const luck = await getPetSystemPerk(buyerId, "chest_luck");
        if (luck > 0 && Math.random() < luck / 100) {
            const i = RARITY_LADDER.indexOf(rarity);
            if (i >= 0 && i < RARITY_LADDER.length - 1) rarity = RARITY_LADDER[i + 1];
        }
    } catch { /* no companion, no promotion */ }
    // Pick the pool by the ROLLED rarity, not the chest tier: Ascendant/Eternal are elite (charged) gear;
    // everything common→mythic comes from the normal loot pool. This lets a chest's spread span both tiers
    // (e.g. an Ascendant chest that under-rolls to mythic still grants a real mythic item).
    // ── READ THE SET, NOT TWO OF ITS FOUR MEMBERS ────────────────────────────────────────────────────────
    // This was `rarity === "ascendant" || rarity === "eternal"` while ELITE_TIERS — which lists all four —
    // sat above it declared and read by nothing. Harmless while no table could roll the top two; the moment
    // the celestial and primordial chests could, a rolled celestial would have failed this test, fallen
    // through to CHEST_POOL (which contains no celestial item), found no candidate at its own rarity, and
    // quietly handed out a random ordinary piece instead. The rarest roll in the game paying out a common.
    const isEliteRarity = ELITE_TIERS.has(rarity);
    // The four Corsair trophies come out of chests and used to be in CHEST_POOL because they were items. They
    // are their own table now, so a chest has to ask for them explicitly or the set becomes unobtainable.
    // Rolled at the same rarity, uncommonly, and never a duplicate.
    if (!isEliteRarity) {
        const { rollPieceDrop } = await import("@/lib/marketplace/collection-owned.js");
        const trophy = await rollPieceDrop(buyerId, { source: "chest", rarity, chance: 0.12 }).catch(() => null);
        if (trophy) {
            return { ok: true, remaining: dec.count, piece: true,
                item: { id: trophy.id, name: trophy.name, rarity: trophy.rarity, slot: null, icon: trophy.icon, stats: null, reqLevel: null, signature: null, charged: false, chargeReward: null } };
        }
    }
    const pool = isEliteRarity ? ELITE_POOL : CHEST_POOL;
    let candidates = pool.filter((i) => i.rarity === rarity && !owned.has(i.id));
    // ── IF YOU OWN THEM ALL, GO DOWN THE LADDER — NEVER UP ───────────────────────────────────────────────
    // This was `pool.filter((i) => !owned.has(i.id))`: own every un-owned item at the rolled rarity and the
    // chest handed you a uniformly random un-owned item from the WHOLE pool. It reads like a kindness ("do
    // not pay dust") and it is the biggest hole in the economy, because of WHO it fires for.
    //
    // A heavy opener owns every common and rare within a fortnight. From then on their wooden chests — whose
    // table caps at EPIC and cannot roll higher — roll "common", find nothing un-owned at that rarity, and
    // draw uniformly from what is left, which by then is almost entirely legendary and mythic. Measured:
    // Mr.Wakey pulled 8 mythics out of 77 chests that were overwhelmingly wooden and iron, with no chest-luck
    // companion and no Locksmith. The rarity roll had become decoration for exactly the players who open the
    // most chests.
    //
    // Widening DOWNWARD keeps the intent — a chest should try to give you an item before it gives you dust —
    // while making the rolled rarity a CEILING rather than a suggestion. Going up is still possible, but only
    // through The Sorting Table below, which is a primordial-tier power and is supposed to be the thing that
    // does this.
    if (!candidates.length) {
        for (let i = RARITY_LADDER.indexOf(rarity) - 1; i >= 0 && !candidates.length; i -= 1) {
            candidates = pool.filter((x) => x.rarity === RARITY_LADDER[i] && !owned.has(x.id));
        }
    }
    if (candidates.length) {
        const item = candidates[Math.floor(Math.random() * candidates.length)];
        await grantItem(buyerId, item.id, isEliteRarity ? "elite" : "chest");
        // Twin Hinges pays the chest twice: a SECOND un-owned item of the same rarity, not the same one again.
        let second = null;
        if (twinHinges) {
            const rest = candidates.filter((c) => c.id !== item.id);
            if (rest.length) {
                second = rest[Math.floor(Math.random() * rest.length)];
                await grantItem(buyerId, second.id, isEliteRarity ? "elite" : "chest");
            }
        }
        // The Master Key also hands you the chest one tier BELOW, unopened, so you get to open it yourself.
        if (masterKey) {
            const below = CHEST_ORDER[Math.max(0, CHEST_ORDER.indexOf(tier) - 1)];
            if (below && below !== tier) await addChests(buyerId, { [below]: 1 }, { source: "master_key" }).catch(() => {});
        }
        return { ok: true, remaining: dec.count, second: second ? { id: second.id, name: second.name, rarity: second.rarity } : null, item: { id: item.id, name: item.name, rarity: item.rarity, slot: item.slot, icon: item.icon, stats: item.stats, reqLevel: item.reqLevel, signature: signatureFor(item.id), charged: Boolean(item.charged), chargeReward: item.chargeRewardLabel || null } };
    }
    // THE SORTING TABLE. Dust is what a chest pays when you already own every item of the rolled rarity, so
    // this is the exact moment the power exists for: widen a rarity instead of paying out consolation gold.
    // One retry only — if you own the tier above as well, the dust stands rather than walking the whole ladder.
    if (await hasPower(buyerId, "sorting_table")) {
        const up = RARITY_LADDER[Math.min(RARITY_LADDER.length - 1, RARITY_LADDER.indexOf(rarity) + 1)];
        const wider = pool.filter((i) => i.rarity === up && !owned.has(i.id));
        if (wider.length) {
            const item = wider[Math.floor(Math.random() * wider.length)];
            await grantItem(buyerId, item.id, "chest");
            return { ok: true, remaining: dec.count, item: { id: item.id, name: item.name, rarity: item.rarity, slot: item.slot, icon: item.icon, stats: item.stats, reqLevel: item.reqLevel, signature: signatureFor(item.id), charged: Boolean(item.charged), chargeReward: item.chargeRewardLabel || null }, sorted: true };
        }
    }
    // ── A CHEST MUST NEVER BE WORTH NOTHING ──────────────────────────────────────────────────────────────
    // Widening goes DOWNWARD only, deliberately (see the note above — upward widening was the biggest hole in
    // the economy). But downward has a floor, and a completionist hits it: Kaishiern owns every common in the
    // pool, 36 of 36, and every rare, 35 of 35. His wooden and iron chests can therefore never pay an item
    // again — a common roll finds nothing, walks down to nothing, and hands over 25 gold. He opened three in a
    // row and said so in the plaza.
    //
    // Gold is the wrong consolation because it is the one currency that says "there was nothing here for
    // you". FORGE PARTS are the right one: they have no ownership ceiling, so they cannot run out the way the
    // gear pool does, and they feed the Forge, which is where the gear he already owns gets better. Paid ON
    // TOP of the dust rather than instead of it, scaled by the CHEST's tier rather than by the rolled rarity,
    // because the chest is the thing that was earned.
    // Minted AFTER the Twin Hinges doubling so the perk still doubles what you actually get.
    let gold = mint((DUST[rarity] || 25) * (twinHinges ? 2 : 1), "chest_reward");
    await db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [buyerId, gold]).catch(() => {});
    await logCoin(buyerId, gold, "chest_reward", { meta: { tier } }).catch(() => {});
    // Tier of part follows the chest, capped at the top of the ladder; the count follows it too, so a
    // primordial chest that finds nothing is still a primordial chest.
    const partTier = Math.max(1, Math.min(5, CHEST_ORDER.indexOf(tier) + 1));
    const partQty = Math.max(2, (CHEST_ORDER.indexOf(tier) + 1) * 2) * (twinHinges ? 2 : 1);
    let parts = null;
    try {
        const { addParts } = await import("@/lib/marketplace/crafting.js");
        await addParts(buyerId, partTier, partQty);
        const { partName, partSprite } = await import("@/lib/marketplace/forge-parts.js");
        parts = { tier: partTier, n: partQty, name: partName(partTier), sprite: partSprite(partTier) };
    } catch { /* the Forge is optional — a chest never fails for it */ }
    return { ok: true, remaining: dec.count, gold, rarity, parts, doubled: twinHinges };
}
