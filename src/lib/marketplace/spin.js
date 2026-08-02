import "server-only";

import { db } from "@/lib/db";
import { dropSeedFrom, grantSeed, SEEDS } from "@/lib/marketplace/farm-crops.js";
import { awardXp, levelForXp } from "@/lib/marketplace/xp.js";
import { addChests, CHEST_TIERS } from "@/lib/marketplace/chests.js";
import { grantConsumable, CONSUMABLES } from "@/lib/marketplace/consumables.js";
import { grantItem, getEquippedIds } from "@/lib/marketplace/inventory.js";
import { itemById, describeStats } from "@/lib/marketplace/items.js";
import { setWheelBonus, setWheelRespinChance } from "@/lib/marketplace/sets.js";
import { bumpQuestProgress } from "@/lib/marketplace/quests.js";
import { syncEarnedBadges } from "@/lib/marketplace/badges.js";
import { activeXpMultiplier } from "@/lib/marketplace/happy-hour-core.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { isOwner } from "@/lib/marketplace/owner.js";

// DAILY SPIN — one free spin a day + a spin-token economy. Tokens come from quests, boss kills, streaks, or
// gold. Your level unlocks better wheels. A pity counter guarantees a rare prize every PITY spins. Gold
// prizes ride the Happy Hour multiplier. The wheel's prize list is ordered + stable so the UI can rotate to
// the winning index.

export const SPIN_TOKEN_COST = 400; // gold to buy one extra spin
const PITY = 20; // guaranteed rare within this many spins
// Wheelwarden set "Lucky Spin" proc payout (the set only grants a CHANCE at this per spin, not every spin).
const LUCKY_CHARGE = 3;   // bonus Lucky Charge on a Lucky Spin
const LUCKY_GOLD_PCT = 25; // % bonus gold when a Lucky Spin lands on a gold prize

// The wheel carries a MINI JACKPOT + a grand JACKPOT, both weighted tiny so they're a rare thrill
// (jackpot ≈ 0.8%, mini ≈ 2.5%). `tier` drives the wheel/legend styling client-side. Single wheel for
// everyone (the old bronze/silver/gold tiers were collapsed to one). The 🌱 Common Seed wedge is live now
// that the farm is public (grantSeed/SEEDS handler wired below).
// Prize sprite path (real AI art, no emoji) — public/images/spin/prizes/<name>.png. An absolute path passes
// straight through, so a wedge can borrow art from another feature (e.g. the sailing fragment sprites).
const P = (name) => (name?.startsWith("/") ? name : `/images/spin/prizes/${name}.png`);
// The shard tier the wheel hands out. Wedge label, sprite and grant all read from this one place so they can
// never drift apart — bump it here if the wheel should ever pay better shards.
const FRAGMENT_PRIZE_TIER = "wooden";
const fragSprite = (tier) => `/images/sailing/fragment-${tier}.png`;
const fragName = (tier) => (CHEST_TIERS[tier]?.label || tier).replace(" Chest", "");

// One-line explainer for a wheel prize — powers the "tap a reward to inspect it" card in the legend.
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
function prizeDesc(p) {
    switch (p.kind) {
        case "gold": return p.mini
            ? `The MINI JACKPOT — instantly bank ${(p.amount || 0).toLocaleString()} gold.`
            : `Instantly bank ${(p.amount || 0).toLocaleString()} gold.`;
        case "xp": return `Gain ${(p.amount || 0).toLocaleString()} XP toward your next level.`;
        case "consumable": return CONSUMABLES[p.consumable]?.desc || p.label;
        case "seed": return "A random farm seed to plant and grow in your pasture.";
        case "fragment": return `${p.n || 1} ${fragName(p.tierId || FRAGMENT_PRIZE_TIER)} chest fragments — collect enough of a kind to forge that chest at the docks.`;
        case "chest": return `A ${cap(p.tierId)} loot chest — open it for gear, gold and more.`;
        case "mini_wheel": return "Spin a bonus Mini Wheel for a second prize on top.";
        case "respin": return "A free bonus spin — spin again on the house.";
        case "bonus_game": return "Play a pick-a-box match-3 round to win wheel-exclusive gear.";
        case "major_jackpot": return "The progressive community jackpot — win the entire pot.";
        default: return p.label;
    }
}

// Progressive jackpot tuning (shared community pot).
const JACKPOT_BASE = 5000;      // pot reseeds to this when won
const JACKPOT_CONTRIB = 15;     // every spin adds this to the pot
const MINI_JACKPOT_AMT = 1000;  // the fixed MINI JACKPOT wedge

// TWENTY wedges — one prize each, shown on the wheel with real sprites. Regular prizes + four special wedges
// (MINI/MAJOR jackpot, MINI WHEEL bonus round, BONUS GAME gear pick).
const WHEELS = [
    {
        id: "wheel", name: "Prize Wheel", minLevel: 1,
        prizes: [
            { label: "50 gold", sprite: "coins-small", weight: 16, kind: "gold", amount: 50 },
            { label: "60 XP", sprite: "xp-orb", weight: 12, kind: "xp", amount: 60 },
            { label: "75 gold", sprite: "coins-small", weight: 15, kind: "gold", amount: 75 },
            { label: "Pet Treat", sprite: "pet-treat", weight: 10, kind: "consumable", consumable: "treat_bone", n: 1 },
            { label: "Farm Seed", sprite: "seed-pouch", weight: 9, kind: "seed" },
            { label: "150 gold", sprite: "coins-big", weight: 12, kind: "gold", amount: 150 },
            { label: "5 Fertilizer", sprite: "fertilizer", weight: 8, kind: "consumable", consumable: "farm_fertilizer_crate", n: 1 },
            { label: `3 ${fragName(FRAGMENT_PRIZE_TIER)} Fragments`, sprite: fragSprite(FRAGMENT_PRIZE_TIER), weight: 8, kind: "fragment", n: 3, tierId: FRAGMENT_PRIZE_TIER },
            { label: "MINI WHEEL", sprite: "mini-wheel", weight: 5, tier: "bonus", kind: "mini_wheel" },
            { label: "250 gold", sprite: "coins-big", weight: 8, kind: "gold", amount: 250 },
            { label: "150 XP", sprite: "xp-orb", weight: 6, kind: "xp", amount: 150 },
            { label: "Adrenaline Vial", sprite: "potion-red", weight: 6, kind: "consumable", consumable: "pot_adrenaline", n: 1 },
            { label: "BONUS SPIN", sprite: "bonus-spin", weight: 7, tier: "bonus", kind: "respin" },
            { label: "Wooden Chest", sprite: "chest-wood", weight: 6, rare: true, tier: "rare", kind: "chest", tierId: "wooden" },
            { label: "BONUS GAME", sprite: "mystery-box", weight: 4, tier: "bonus", kind: "bonus_game" },
            { label: "375 gold", sprite: "coins-big", weight: 5, rare: true, tier: "rare", kind: "gold", amount: 375 },
            { label: "Berserker's Brew", sprite: "potion-brew", weight: 3, rare: true, tier: "rare", kind: "consumable", consumable: "pot_berserker", n: 1 },
            { label: "Gold Chest", sprite: "chest-gold", weight: 2, rare: true, tier: "rare", kind: "chest", tierId: "gold" },
            { label: "MINI JACKPOT", sprite: "coin-burst", weight: 3, rare: true, mini: true, tier: "mini", kind: "gold", amount: MINI_JACKPOT_AMT },
            { label: "MAJOR JACKPOT", sprite: "gem-jackpot", weight: 1, rare: true, jackpot: true, tier: "jackpot", kind: "major_jackpot" },
        ],
    },
];

// The MINI WHEEL bonus round — a small secondary wheel of solid prizes.
const MINI_WHEEL_PRIZES = [
    { label: "225 gold", sprite: "coins-small", weight: 20, kind: "gold", amount: 225 },
    { label: "150 XP", sprite: "xp-orb", weight: 14, kind: "xp", amount: 150 },
    { label: "Hearty Snack", sprite: "pet-treat", weight: 12, kind: "consumable", consumable: "treat_snack", n: 1 },
    { label: `5 ${fragName(FRAGMENT_PRIZE_TIER)} Fragments`, sprite: fragSprite(FRAGMENT_PRIZE_TIER), weight: 12, kind: "fragment", n: 5, tierId: FRAGMENT_PRIZE_TIER },
    { label: "450 gold", sprite: "coins-big", weight: 12, kind: "gold", amount: 450 },
    { label: "Wooden Chest", sprite: "chest-wood", weight: 10, kind: "chest", tierId: "wooden" },
    { label: "Adrenaline Vial", sprite: "potion-red", weight: 10, kind: "consumable", consumable: "pot_adrenaline", n: 1 },
    { label: "750 gold", sprite: "coins-big", weight: 6, rare: true, tier: "rare", kind: "gold", amount: 750 },
];

// Wheel-exclusive gear the BONUS GAME awards (ids match items.js + mkt_item_sprite). All RARE; the match-3
// board draws BOARD_ITEMS of these at random, three tiles each.
const WHEEL_GEAR = ["wg_helm", "wg_shield", "wg_ring", "wg_cloak", "wg_amulet", "wg_blade", "wg_chest", "wg_belt", "wg_boots", "wg_axe"];
const BOARD_ITEMS = 6; // distinct gear on the board (× 3 tiles each = 18 tiles → big, readable match-3)

function wheelForLevel(level) {
    let w = WHEELS[0];
    for (const cand of WHEELS) if (level >= cand.minLevel) w = cand;
    return w;
}

// Generic weighted pick → the chosen list ITEM (not index).
function pickWeighted(list, rand = Math.random) {
    const total = list.reduce((s, x) => s + (x.weight || 1), 0) || 1;
    let r = rand() * total;
    for (const x of list) { r -= x.weight || 1; if (r < 0) return x; }
    return list[list.length - 1];
}

// ── Shared progressive jackpot pot ──
export async function getJackpotPot() {
    const r = await db.queryOne(`SELECT pot FROM mkt_progressive_jackpot WHERE id = 1`).catch(() => null);
    return r?.pot != null ? Number(r.pot) : JACKPOT_BASE;
}
async function bumpJackpotPot(n) {
    await db.query(`INSERT INTO mkt_progressive_jackpot (id, pot) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET pot = mkt_progressive_jackpot.pot + $1, updated_at = NOW()`, [n]).catch(() => {});
}
// Atomically award the whole pot to the winner and reseed. Returns the amount won.
async function winJackpotPot(buyerId) {
    const r = await db
        .queryOne(
            `WITH cur AS (SELECT pot FROM mkt_progressive_jackpot WHERE id = 1 FOR UPDATE)
             UPDATE mkt_progressive_jackpot m SET pot = $2, last_winner = $1, last_won_at = NOW(), updated_at = NOW()
               FROM cur WHERE m.id = 1 RETURNING cur.pot AS won`,
            [buyerId, JACKPOT_BASE]
        )
        .catch(() => null);
    return r?.won != null ? Number(r.won) : JACKPOT_BASE;
}

// The MINI WHEEL bonus round: roll a prize on the small wheel, grant it, and return the wheel + winning index
// so the client can animate it.
async function rollMiniWheel(buyerId) {
    const idx = (() => { const pick = pickWeighted(MINI_WHEEL_PRIZES); return MINI_WHEEL_PRIZES.indexOf(pick); })();
    const prize = MINI_WHEEL_PRIZES[idx];
    const display = await grantPrize(buyerId, prize);
    return {
        prizes: MINI_WHEEL_PRIZES.map((p) => ({ label: p.label, sprite: P(p.sprite), tier: p.tier || (p.rare ? "rare" : "normal") })),
        index: idx,
        prize: { ...display, tier: prize.tier || (prize.rare ? "rare" : "normal") },
    };
}

const gearSprite = (id) => `/images/spin/gear/${id === "wg_ring" ? "wg-gauntlet" : id.replace("_", "-")}.png`;
const gearCard = (id) => { const it = itemById(id); return { id, name: it?.name || "Wheel Gear", rarity: it?.rarity || "rare", sprite: gearSprite(id), slot: it?.slot || null, stats: it?.stats ? describeStats(it.stats) : "" }; };
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// The BONUS GAME is a MATCH-3: a board of face-down tiles, THREE of every gear on it (so the end reveal is
// honest — every piece really is there three times). The player flips tiles until they get three of a kind;
// the FIRST gear to reach three (by their own flip order) is what they win. The board is kept SERVER-SIDE so
// tiles stay hidden — the client flips one at a time via `bonusFlip`, and the win is granted there.
async function rollBonusGame(buyerId) {
    const chosen = shuffle([...WHEEL_GEAR]).slice(0, BOARD_ITEMS);
    const tiles = shuffle(chosen.flatMap((id) => [id, id, id]));
    await db.query(`UPDATE mkt_buyer SET spin_bonus = $2::jsonb WHERE id = $1`, [buyerId, JSON.stringify({ board: tiles, flipped: [], done: false, need: 3 })]).catch(() => {});
    return { size: tiles.length, need: 3, roster: chosen.map(gearCard) };
}

// Flip one tile of the active match-3 board. Reveals its gear; when the player reaches three of a kind, grants
// that piece and returns the FULL board so the client can reveal everything.
export async function bonusFlip(buyerId, index) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const row = await db.queryOne(`SELECT spin_bonus FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const g = row?.spin_bonus;
    if (!g || !Array.isArray(g.board)) return { ok: false, error: "no_game" };
    if (g.done) return { ok: false, error: "done" };
    const i = Number(index);
    if (!(i >= 0 && i < g.board.length) || g.flipped.includes(i)) return { ok: false, error: "bad_flip" };
    g.flipped.push(i);
    const revealedId = g.board[i];
    const count = g.flipped.filter((fi) => g.board[fi] === revealedId).length;
    let winner = null; let fullBoard = null;
    if (count >= (g.need || 3)) {
        g.done = true;
        await grantItem(buyerId, revealedId, "wheel_bonus").catch(() => {});
        await trackActivity(buyerId, "spin_bonus_win", { item: revealedId }).catch(() => {});
        winner = gearCard(revealedId);
        fullBoard = g.board.map(gearCard);
    }
    await db.query(`UPDATE mkt_buyer SET spin_bonus = $2::jsonb WHERE id = $1`, [buyerId, JSON.stringify(g)]).catch(() => {});
    return { ok: true, index: i, tile: gearCard(revealedId), done: Boolean(winner), winner, board: fullBoard };
}

// Weighted pick of a prize INDEX. forceRare restricts to rare segments (pity).
function pickIndex(wheel, forceRare, rand = Math.random) {
    const pool = wheel.prizes.map((p, i) => ({ i, w: forceRare ? (p.rare ? p.weight : 0) : p.weight }));
    const total = pool.reduce((s, x) => s + x.w, 0);
    if (total <= 0) return 0;
    let r = rand() * total;
    for (const x of pool) { r -= x.w; if (r < 0) return x.i; }
    return pool[pool.length - 1].i;
}

// Deliver a prize; returns display { sprite, text }. (MINI WHEEL / BONUS GAME are handled in doSpin.)
async function grantPrize(buyerId, prize, opts = {}) {
    const hh = await activeXpMultiplier().catch(() => 1);
    const goldMult = 1 + (opts.goldPct || 0) / 100; // Wheelwarden set: bonus gold on spin gold prizes.
    const sprite = prize.sprite ? P(prize.sprite) : null;
    if (prize.kind === "major_jackpot") {
        const won = await winJackpotPot(buyerId);
        await db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [buyerId, won]).catch(() => {});
        await logCoin(buyerId, won, "spin_prize", { meta: { prize: "MAJOR JACKPOT" } }).catch(() => {});
        await db.query(`INSERT INTO mkt_user_badge (buyer_id, badge_slug) VALUES ($1, 'jackpot') ON CONFLICT DO NOTHING`, [buyerId]).catch(() => {});
        return { sprite, text: `MAJOR JACKPOT — ${won.toLocaleString()} gold!`, amount: won };
    }
    if (prize.kind === "gold") {
        const amt = Math.round(prize.amount * hh * goldMult);
        await db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [buyerId, amt]).catch(() => {});
        await logCoin(buyerId, amt, "spin_prize", { meta: { prize: prize.label } }).catch(() => {});
        if (prize.mini) await db.query(`INSERT INTO mkt_user_badge (buyer_id, badge_slug) VALUES ($1, 'jackpot') ON CONFLICT DO NOTHING`, [buyerId]).catch(() => {});
        return { sprite, text: `${amt.toLocaleString()} gold${prize.mini ? " — MINI JACKPOT!" : ""}` };
    }
    if (prize.kind === "xp") { await awardXp(buyerId, "spin_reward", { points: prize.amount }).catch(() => {}); return { sprite, text: `${prize.amount.toLocaleString()} XP` }; }
    if (prize.kind === "consumable") { await grantConsumable(buyerId, prize.consumable, prize.n || 1).catch(() => {}); return { sprite, text: prize.label }; }
    if (prize.kind === "fragment") {
        // Name the TIER on the result card (and use that tier's shard art) — "dig fragments" alone left people
        // guessing which chest they were forging toward.
        const tier = prize.tierId || FRAGMENT_PRIZE_TIER;
        const n = prize.n || 1;
        try { const { grantFragment } = await import("@/lib/marketplace/sailing.js"); await grantFragment(buyerId, n, tier); } catch { /* best-effort */ }
        return { sprite: fragSprite(tier), text: `${n} ${fragName(tier)} Chest Fragment${n === 1 ? "" : "s"}` };
    }
    if (prize.kind === "respin") { await grantSpinTokens(buyerId, 1); return { sprite, text: "Spin again — on the house!" }; }
    if (prize.kind === "chest") { await addChests(buyerId, { [prize.tierId]: 1 }, { source: "daily_spin" }).catch(() => {}); return { sprite, text: prize.label }; }
    if (prize.kind === "seed") {
        const commons = Object.keys(SEEDS).filter((id) => SEEDS[id].rarity === "common");
        const sid = commons[Math.floor(Math.random() * commons.length)];
        await grantSeed(buyerId, sid).catch(() => {});
        return { sprite, text: `${SEEDS[sid]?.name || "Common"} seed!` };
    }
    return { sprite, text: prize.label };
}

// Give spin tokens (from quests / boss kills / streaks). Exported for the tie-ins.
export async function grantSpinTokens(buyerId, n = 1) {
    if (!buyerId || n <= 0) return;
    await db.query(`UPDATE mkt_buyer SET spin_tokens = spin_tokens + $2 WHERE id = $1`, [buyerId, Math.floor(n)]).catch(() => {});
}

// Store-day helper. free_spin_day is a SQL DATE — always SELECT it as ::text and compare strings; building
// a JS Date from it reformats in the process TZ and rolls the day back on Vercel (UTC), which would make
// the free daily spin look available again on every refresh. (Same fix as daily-checkin.)
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const asDay = (v) => (v ? String(v).slice(0, 10) : null);

export async function getSpinState(buyerId) {
    if (!buyerId) return { signedIn: false };
    const row = await db.queryOne(`SELECT COALESCE(xp,0) AS xp, COALESCE(gold,0) AS gold, COALESCE(spin_tokens,0) AS tokens, free_spin_day::text AS free_spin_day, COALESCE(spin_count,0) AS spin_count, spin_buys_day::text AS spin_buys_day, COALESCE(spin_buys_count,0) AS spin_buys_count, COALESCE(spins_since_rare,0) AS pity, spin_bonus FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const level = levelForXp(row?.xp || 0).level;
    // Resume an unfinished match-3 bonus board across a refresh so an abandoned game isn't lost.
    const bonusResume = (() => {
        const g = row?.spin_bonus;
        if (!g || !Array.isArray(g.board) || g.done) return null;
        const revealed = {};
        for (const i of (g.flipped || [])) revealed[i] = gearCard(g.board[i]);
        return { size: g.board.length, need: g.need || 3, roster: [...new Set(g.board)].map(gearCard), revealed };
    })();
    const wheel = wheelForLevel(level);
    const freeAvailable = asDay(row?.free_spin_day) !== today();
    // Extra-spin price escalates 1000, 2000, 3000… per store-day (resets at midnight Central).
    const boughtToday = asDay(row?.spin_buys_day) === today() ? (row?.spin_buys_count || 0) : 0;
    const tokenCost = nextSpinCost(boughtToday);
    const next = WHEELS.find((w) => w.minLevel > level);
    return {
        signedIn: true,
        gold: row?.gold || 0,
        tokens: row?.tokens || 0,
        spinCount: row?.spin_count || 0,
        bonusResume, // an unfinished match-3 board to re-open on load
        freeAvailable,
        tokenCost,
        extraSpinsToday: boughtToday,
        charge: Math.min(PITY, row?.pity || 0),
        chargeMax: PITY,
        golden: (row?.pity || 0) >= PITY - 1,
        isOwner: isOwner(buyerId), // owner-only free-reset button (debugging)
        jackpotPot: await getJackpotPot(), // shared progressive MAJOR JACKPOT
        wheel: (() => {
            const total = wheel.prizes.reduce((s, p) => s + p.weight, 0) || 1;
            return { id: wheel.id, name: wheel.name, prizes: wheel.prizes.map((p) => ({ label: p.label, sprite: p.sprite ? P(p.sprite) : null, rare: Boolean(p.rare), tier: p.tier || (p.rare ? "rare" : "normal"), odds: Math.round((p.weight / total) * 1000) / 10, desc: prizeDesc(p) })) };
        })(),
        nextWheel: next ? { name: next.name, atLevel: next.minLevel } : null,
        canSpin: freeAvailable || (row?.tokens || 0) > 0,
    };
}

// Do a spin (uses the free daily spin first, else a token). Returns the winning segment index + prize.
export async function doSpin(buyerId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const row = await db.queryOne(`SELECT COALESCE(xp,0) AS xp, COALESCE(spin_tokens,0) AS tokens, free_spin_day::text AS free_spin_day, COALESCE(spins_since_rare,0) AS pity FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    if (!row) return { ok: false, error: "not_signed_in" };
    const freeAvailable = asDay(row.free_spin_day) !== today();
    // Consume a spin atomically (free first, else a token).
    let consumed = null;
    if (freeAvailable) {
        consumed = await db.queryOne(`UPDATE mkt_buyer SET free_spin_day = $2::date WHERE id = $1 AND (free_spin_day IS DISTINCT FROM $2::date) RETURNING id`, [buyerId, today()]).catch(() => null);
    }
    if (!consumed) {
        consumed = await db.queryOne(`UPDATE mkt_buyer SET spin_tokens = spin_tokens - 1 WHERE id = $1 AND spin_tokens > 0 RETURNING id`, [buyerId]).catch(() => null);
        if (!consumed) return { ok: false, error: "no_spins" };
    }
    // Every spin feeds the shared progressive jackpot.
    await bumpJackpotPot(JACKPOT_CONTRIB).catch(() => {});
    // Wheelwarden's Fortune set (the wheel-exclusive gear worn as a set): faster Lucky Charge, bonus spin gold,
    // and a free-respin capstone. Read off the equipped loadout (getEquippedIds returns a {slot→id} object,
    // which setWheelBonus normalizes).
    const equipped = await getEquippedIds(buyerId).catch(() => ({}));
    const luckChance = setWheelBonus(equipped).luck || 0;  // % CHANCE for a Lucky Spin proc this spin
    const respinChance = setWheelRespinChance(equipped);   // capstone: 0..0.5
    const lucky = luckChance > 0 && Math.random() * 100 < luckChance; // did the wheel set proc this spin?
    const wheel = wheelForLevel(levelForXp(row.xp).level);
    const forceRare = row.pity >= PITY - 1;
    const idx = pickIndex(wheel, forceRare);
    const prize = wheel.prizes[idx];
    // Special wedges roll a sub-game; everything else is a direct grant.
    let display;
    let miniWheel = null;
    let bonusGame = null;
    if (prize.kind === "mini_wheel") { miniWheel = await rollMiniWheel(buyerId); display = { sprite: P(prize.sprite), text: "Mini Wheel bonus!" }; }
    else if (prize.kind === "bonus_game") { bonusGame = await rollBonusGame(buyerId); display = { sprite: P(prize.sprite), text: "Bonus Game — pick your gear!" }; }
    else display = await grantPrize(buyerId, prize, { goldPct: lucky ? LUCKY_GOLD_PCT : 0 });
    // Lucky Charge climbs 1/spin, plus a burst on a Lucky Spin proc; resets on a rare pull.
    const chargeStep = 1 + (lucky ? LUCKY_CHARGE : 0);
    await db.query(`UPDATE mkt_buyer SET spin_count = spin_count + 1, spins_since_rare = CASE WHEN $2 THEN 0 ELSE spins_since_rare + $3 END WHERE id = $1`, [buyerId, Boolean(prize.rare), chargeStep]).catch(() => {});
    // Capstone: a chance the spin is refunded (a free spin token back).
    let refunded = false;
    if (respinChance > 0 && Math.random() < respinChance) { await grantSpinTokens(buyerId, 1).catch(() => {}); refunded = true; }
    await bumpQuestProgress(buyerId, "spin", 1).catch(() => {});
    await dropSeedFrom(buyerId, "spin").catch(() => {}); // the wheel can also grant a farming seed
    await trackActivity(buyerId, "daily_spin", { prize: prize.label }).catch(() => {});

    // The wheel can land on a recipe.
    try {
        const { tryRecipeDrop } = await import("@/lib/marketplace/cooking.js");
        await tryRecipeDrop(buyerId, "spin");
    } catch { /* a recipe is a bonus; never let it fail the action */ }
    await syncEarnedBadges(buyerId).catch(() => {}); // spin-count badges
    const prizeOut = {
        ...display,
        label: prize.label,
        tier: prize.tier || (prize.rare ? "rare" : "normal"),
        jackpot: Boolean(prize.jackpot), mini: Boolean(prize.mini), rare: Boolean(prize.rare),
        respin: Boolean(prize.kind === "respin"), golden: forceRare,
        miniWheel: Boolean(prize.kind === "mini_wheel"), bonusGame: Boolean(prize.kind === "bonus_game"),
    };
    return { ok: true, prizeIndex: idx, prize: prizeOut, miniWheel, bonusGame, refunded, lucky, ...(await getSpinState(buyerId)) };
}

// OWNER-ONLY debug helper: refill the free daily spin so you can spin freely while testing. Gives exactly ONE
// spin (just clears free_spin_day — no bonus token). No-op for anyone who isn't the owner.
export async function resetSpin(buyerId) {
    if (!buyerId || !isOwner(buyerId)) return { ok: false, error: "forbidden" };
    await db.query(`UPDATE mkt_buyer SET free_spin_day = NULL WHERE id = $1`, [buyerId]).catch(() => {});
    return { ok: true, ...(await getSpinState(buyerId)) };
}

// OWNER-ONLY: trigger a sub-game directly for testing (the match-3 BONUS GAME or the MINI WHEEL) without
// waiting to land on its wedge. No-op for non-owners.
export async function ownerSpinTrigger(buyerId, what) {
    if (!buyerId || !isOwner(buyerId)) return { ok: false, error: "forbidden" };
    if (what === "bonus") { const bonusGame = await rollBonusGame(buyerId); return { ok: true, bonusGame, ...(await getSpinState(buyerId)) }; }
    if (what === "mini") { const miniWheel = await rollMiniWheel(buyerId); return { ok: true, miniWheel, ...(await getSpinState(buyerId)) }; }
    return { ok: false, error: "bad_trigger" };
}

// The gold cost of the NEXT extra spin today: 1000 for the first, +1000 each additional, reset at the
// store-local midnight. `boughtToday` = extra spins already bought this store-day.
const SPIN_BUY_STEP = 1000;
const nextSpinCost = (boughtToday) => (Math.max(0, boughtToday) + 1) * SPIN_BUY_STEP;

// Buy one extra spin token with gold. Cost escalates per day (atomic — one UPDATE computes cost + counter).
export async function buySpinToken(buyerId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const preSpinState = await getSpinState(buyerId).catch(() => null);
    const spinCost = preSpinState?.tokenCost ?? null;
    const paid = await db
        .queryOne(
            `UPDATE mkt_buyer SET
                gold = gold - (CASE WHEN spin_buys_day = $2::date THEN spin_buys_count + 1 ELSE 1 END) * ${SPIN_BUY_STEP},
                spin_tokens = spin_tokens + 1,
                spin_buys_count = CASE WHEN spin_buys_day = $2::date THEN spin_buys_count + 1 ELSE 1 END,
                spin_buys_day = $2::date
              WHERE id = $1
                AND gold >= (CASE WHEN spin_buys_day = $2::date THEN spin_buys_count + 1 ELSE 1 END) * ${SPIN_BUY_STEP}
              RETURNING gold`,
            [buyerId, today()]
        )
        .catch(() => null);
    if (!paid) return { ok: false, error: "not_enough_gold" };
    if (spinCost) await logCoin(buyerId, -spinCost, "buy_spin", { balanceAfter: paid.gold }).catch(() => {});
    await trackActivity(buyerId, "buy_spin", spinCost ? { cost: spinCost } : {}).catch(() => {});
    return { ok: true, ...(await getSpinState(buyerId)) };
}
