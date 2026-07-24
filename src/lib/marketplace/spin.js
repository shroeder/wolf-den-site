import "server-only";

import { db } from "@/lib/db";
import { dropSeedFrom, grantSeed, SEEDS } from "@/lib/marketplace/farm-crops.js";
import { awardXp, levelForXp } from "@/lib/marketplace/xp.js";
import { addChests } from "@/lib/marketplace/chests.js";
import { grantConsumable } from "@/lib/marketplace/consumables.js";
import { COLLECTIBLES } from "@/lib/marketplace/collectibles.js";
import { DECORATIONS } from "@/lib/marketplace/decorations.js";
import { grantDecoration } from "@/lib/marketplace/farm-decorations.js";
import { bumpQuestProgress } from "@/lib/marketplace/quests.js";
import { syncEarnedBadges } from "@/lib/marketplace/badges.js";
import { activeXpMultiplier } from "@/lib/marketplace/happy-hour-core.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { logCoin } from "@/lib/marketplace/coins.js";

// DAILY SPIN — one free spin a day + a spin-token economy. Tokens come from quests, boss kills, streaks, or
// gold. Your level unlocks better wheels. A pity counter guarantees a rare prize every PITY spins. Gold
// prizes ride the Happy Hour multiplier. The wheel's prize list is ordered + stable so the UI can rotate to
// the winning index.

export const SPIN_TOKEN_COST = 400; // gold to buy one extra spin
const PITY = 20; // guaranteed rare within this many spins
const COUPON_PCT = 50;
const COUPON_MAX = 4000;

// Every wheel is 12 segments and carries a MINI JACKPOT + a grand JACKPOT, both weighted tiny so they're a
// rare thrill (jackpot ≈ 0.8%, mini ≈ 2.5%). `tier` drives the wheel/legend styling client-side.
// Single wheel for everyone (the old bronze/silver/gold tiers were collapsed to one). ⚠️ AT FARM LAUNCH:
// re-add a common-seed wedge → { label: "Common Seed", emoji: "🌱", weight: 12, kind: "seed" } (handler + the
// grantSeed/SEEDS imports are already wired below). See the launch checklist.
const WHEELS = [
    {
        id: "wheel", name: "Prize Wheel", minLevel: 1,
        prizes: [
            { label: "100 gold", emoji: "🪙", weight: 28, kind: "gold", amount: 100 },
            { label: "100 XP", emoji: "⭐", weight: 18, kind: "xp", amount: 100 },
            { label: "Pet Treat", emoji: "🦴", weight: 16, kind: "treat", treat: "treat_bone" },
            { label: "250 gold", emoji: "🪙", weight: 14, kind: "gold", amount: 250 },
            { label: "+1 Spin", emoji: "🎟️", weight: 10, kind: "token", n: 1 },
            { label: "250 XP", emoji: "🌟", weight: 8, kind: "xp", amount: 250 },
            { label: "Farm Decoration", emoji: "🪴", weight: 7, rare: true, tier: "rare", kind: "deco" },
            { label: "Wooden Chest", emoji: "📦", weight: 8, rare: true, tier: "rare", kind: "chest", tierId: "wooden" },
            { label: "500 gold", emoji: "💰", weight: 6, rare: true, tier: "rare", kind: "gold", amount: 500 },
            { label: "50% Coupon", emoji: "🏷️", weight: 4, rare: true, tier: "rare", kind: "coupon" },
            { label: "MINI JACKPOT · 1,000 gold", emoji: "🎰", weight: 3, rare: true, mini: true, tier: "mini", kind: "gold", amount: 1000 },
            { label: "JACKPOT · 2,500 gold", emoji: "💎", weight: 1, rare: true, jackpot: true, tier: "jackpot", kind: "jackpot", amount: 2500 },
        ],
    },
];

function wheelForLevel(level) {
    let w = WHEELS[0];
    for (const cand of WHEELS) if (level >= cand.minLevel) w = cand;
    return w;
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

// Deliver a prize; returns display { emoji, text }.
async function grantPrize(buyerId, prize) {
    const hh = await activeXpMultiplier().catch(() => 1);
    if (prize.kind === "gold" || prize.kind === "jackpot") {
        const amt = Math.round(prize.amount * (prize.kind === "gold" ? hh : 1)); // jackpot is already huge; don't HH-stack it
        await db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [buyerId, amt]).catch(() => {});
        await logCoin(buyerId, amt, "spin_prize", { meta: { prize: prize.label } }).catch(() => {});
        if (prize.kind === "jackpot") await db.query(`INSERT INTO mkt_user_badge (buyer_id, badge_slug) VALUES ($1, 'jackpot') ON CONFLICT DO NOTHING`, [buyerId]).catch(() => {});
        const tag = prize.kind === "jackpot" ? " — JACKPOT! 💎" : prize.mini ? " — MINI JACKPOT! 🎰" : "";
        return { emoji: prize.emoji, text: `${amt.toLocaleString()} gold${tag}` };
    }
    if (prize.kind === "xp") {
        await awardXp(buyerId, "spin_reward", { points: prize.amount }).catch(() => {});
        return { emoji: prize.emoji, text: `${prize.amount.toLocaleString()} XP` };
    }
    if (prize.kind === "treat") { await grantConsumable(buyerId, prize.treat, 1).catch(() => {}); return { emoji: prize.emoji, text: prize.label }; }
    if (prize.kind === "seed") {
        const commons = Object.keys(SEEDS).filter((id) => SEEDS[id].rarity === "common");
        const sid = commons[Math.floor(Math.random() * commons.length)];
        await grantSeed(buyerId, sid).catch(() => {});
        return { emoji: "🌱", text: `${SEEDS[sid]?.name || "Common"} seed!` };
    }
    if (prize.kind === "deco") {
        // Grant a random spin/level-source decoration you don't already own (fall back to any spin-source one).
        const owned = new Set((await db.query(`SELECT deco_id FROM mkt_deco_owned WHERE buyer_id = $1`, [buyerId]).catch(() => [])).map((r) => r.deco_id));
        const pool = DECORATIONS.filter((d) => (d.source === "spin" || d.source === "level") && !owned.has(d.id));
        const list = pool.length ? pool : DECORATIONS.filter((d) => d.source === "spin");
        const won = list[Math.floor(Math.random() * list.length)];
        if (won) { await grantDecoration(buyerId, won.id, 1, "spin").catch(() => {}); return { emoji: won.emoji || "🪴", text: `${won.name} decoration!` }; }
        await db.query(`UPDATE mkt_buyer SET gold = gold + 300 WHERE id = $1`, [buyerId]).catch(() => {});
        return { emoji: "🪙", text: "300 gold" };
    }
    if (prize.kind === "chest") { await addChests(buyerId, { [prize.tierId]: 1 }).catch(() => {}); return { emoji: prize.emoji, text: prize.label }; }
    if (prize.kind === "coupon") { await db.query(`UPDATE mkt_buyer SET shop_coupon_pct = $2, shop_coupon_max = $3, shop_coupon_at = NOW() WHERE id = $1`, [buyerId, COUPON_PCT, COUPON_MAX]).catch(() => {}); return { emoji: prize.emoji, text: `${COUPON_PCT}% shop coupon` }; }
    if (prize.kind === "token") { await grantSpinTokens(buyerId, prize.n || 1); return { emoji: prize.emoji, text: `+${prize.n || 1} spin` }; }
    if (prize.kind === "pet") {
        const owned = new Set((await db.query(`SELECT ref FROM mkt_cosmetic_unlock WHERE buyer_id = $1 AND category = 'pet'`, [buyerId]).catch(() => [])).map((r) => r.ref));
        const pool = COLLECTIBLES.filter((p) => p.source !== "level" && !owned.has(p.id));
        if (!pool.length) { await db.query(`UPDATE mkt_buyer SET gold = gold + 500 WHERE id = $1`, [buyerId]).catch(() => {}); await logCoin(buyerId, 500, "spin_prize", { meta: { prize: prize.label } }).catch(() => {}); return { emoji: "🪙", text: "500 gold (all pets owned)" }; }
        const won = pool[Math.floor(Math.random() * pool.length)];
        await db.query(`INSERT INTO mkt_cosmetic_unlock (buyer_id, category, ref) VALUES ($1, 'pet', $2) ON CONFLICT DO NOTHING`, [buyerId, won.id]).catch(() => {});
        return { emoji: "🐾", text: `${won.name} pet!` };
    }
    return { emoji: "✨", text: prize.label };
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
    const row = await db.queryOne(`SELECT COALESCE(xp,0) AS xp, COALESCE(gold,0) AS gold, COALESCE(spin_tokens,0) AS tokens, free_spin_day::text AS free_spin_day, COALESCE(spin_count,0) AS spin_count, spin_buys_day::text AS spin_buys_day, COALESCE(spin_buys_count,0) AS spin_buys_count FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const level = levelForXp(row?.xp || 0).level;
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
        freeAvailable,
        tokenCost,
        extraSpinsToday: boughtToday,
        wheel: (() => {
            const total = wheel.prizes.reduce((s, p) => s + p.weight, 0) || 1;
            return { id: wheel.id, name: wheel.name, prizes: wheel.prizes.map((p) => ({ label: p.label, emoji: p.emoji, rare: Boolean(p.rare), tier: p.tier || (p.rare ? "rare" : "normal"), odds: Math.round((p.weight / total) * 1000) / 10 })) };
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
    const wheel = wheelForLevel(levelForXp(row.xp).level);
    const forceRare = row.pity >= PITY - 1;
    const idx = pickIndex(wheel, forceRare);
    const prize = wheel.prizes[idx];
    const display = await grantPrize(buyerId, prize);
    await db.query(`UPDATE mkt_buyer SET spin_count = spin_count + 1, spins_since_rare = CASE WHEN $2 THEN 0 ELSE spins_since_rare + 1 END WHERE id = $1`, [buyerId, Boolean(prize.rare)]).catch(() => {});
    await bumpQuestProgress(buyerId, "spin", 1).catch(() => {});
    await dropSeedFrom(buyerId, "spin").catch(() => {}); // the wheel can also grant a farming seed
    await trackActivity(buyerId, "daily_spin", { prize: prize.label }).catch(() => {});
    await syncEarnedBadges(buyerId).catch(() => {}); // spin-count badges
    const prizeOut = { ...display, tier: prize.tier || (prize.rare ? "rare" : "normal"), jackpot: Boolean(prize.jackpot), mini: Boolean(prize.mini), rare: Boolean(prize.rare) };
    return { ok: true, prizeIndex: idx, prize: prizeOut, ...(await getSpinState(buyerId)) };
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
