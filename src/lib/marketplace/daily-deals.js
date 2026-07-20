import "server-only";

import { db } from "@/lib/db";
import { ITEMS, itemById } from "@/lib/marketplace/items.js";
import { grantItem } from "@/lib/marketplace/inventory.js";
import { CONSUMABLES, grantConsumable } from "@/lib/marketplace/consumables.js";
import { COLLECTIBLES, collectibleById, petPrice } from "@/lib/marketplace/collectibles.js";
import { trackActivity } from "@/lib/marketplace/activity.js";

// TODAY'S DEALS — a small rotating set of discounted shop items that changes every day at midnight (America/
// Chicago). The rotation is DETERMINISTIC from the date, so there's no cron and no stored offers: given the
// day, everyone sees the same deals. A member can claim each of the day's deals once (mkt_daily_deal_purchase).

const DEAL_COUNT = 4;
const DISCOUNTS = [0.15, 0.2, 0.25, 0.3]; // regular tiers; one deal each day is boosted to FEATURED
const FEATURED_DISCOUNT = 0.5;

// ── Deterministic per-day RNG ───────────────────────────────────────────────────────────────────────
function hashSeed(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i += 1) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
}
function mulberry32(a) {
    return function next() {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function shuffle(arr, rng) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// The store-timezone day key + seconds remaining until it flips (for the client countdown).
function dayContext() {
    const now = new Date();
    const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(now);
    const g = (t) => Number(parts.find((p) => p.type === t)?.value || 0);
    const h = g("hour") % 24;
    const secsUntilReset = (23 - h) * 3600 + (59 - g("minute")) * 60 + (60 - g("second"));
    return { dayKey, resetInSecs: secsUntilReset, resetAt: new Date(now.getTime() + secsUntilReset * 1000).toISOString() };
}

// The full purchasable pool across categories (gear / consumables / shop pets), each with a base gold price.
function dealPool() {
    const gear = ITEMS.filter((i) => i.source === "xp_shop" && (i.xpCost || 0) > 0)
        .map((i) => ({ kind: "gear", id: i.id, name: i.name, rarity: i.rarity, basePrice: i.xpCost }));
    const consumables = Object.entries(CONSUMABLES).filter(([, c]) => c.price != null)
        .map(([id, c]) => ({ kind: "consumable", id, name: c.name, emoji: c.emoji, basePrice: c.price }));
    const pets = COLLECTIBLES.filter((p) => p.source === "shop").map((p) => ({ kind: "pet", id: p.id, name: p.name, rarity: p.rarity, basePrice: petPrice(p) }));
    return [...gear, ...consumables, ...pets].filter((d) => d.basePrice > 0);
}

// The deterministic list of today's deals (id + kind + discounted price). Same for everyone all day.
function todaysDeals(dayKey) {
    const rng = mulberry32(hashSeed(`deals:${dayKey}`));
    const pool = dealPool();
    // Guarantee at least one consumable (cheap + accessible) so there's always an easy grab.
    const consumables = shuffle(pool.filter((d) => d.kind === "consumable"), rng);
    const rest = shuffle(pool.filter((d) => d.kind !== "consumable"), rng);
    const picked = [consumables[0], ...rest].filter(Boolean).slice(0, DEAL_COUNT);
    const featuredIdx = Math.floor(rng() * picked.length);
    return picked.map((d, i) => {
        const discount = i === featuredIdx ? FEATURED_DISCOUNT : DISCOUNTS[Math.floor(rng() * DISCOUNTS.length)];
        const price = Math.max(1, Math.round(d.basePrice * (1 - discount)));
        return { ...d, discount, price, featured: i === featuredIdx };
    });
}

// What the member already owns (so owned gear/pets show as claimed, like the normal shops).
async function ownedSets(buyerId) {
    const [gearRows, petRows] = await Promise.all([
        db.query(`SELECT item_id FROM mkt_user_item WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        db.query(`SELECT ref FROM mkt_cosmetic_unlock WHERE buyer_id = $1 AND category = 'pet'`, [buyerId]).catch(() => []),
    ]);
    return { gear: new Set(gearRows.map((r) => r.item_id)), pets: new Set(petRows.map((r) => r.ref)) };
}

// GET — the day's deals for this member, with claimed/owned/affordable flags + the countdown.
export async function getDailyDeals(buyerId) {
    const { dayKey, resetInSecs, resetAt } = dayContext();
    const deals = todaysDeals(dayKey);
    if (!buyerId) return { deals: deals.map((d) => ({ ...d, canBuy: false })), resetInSecs, resetAt, gold: 0, signedIn: false };
    const [goldRow, claimedRows, owned] = await Promise.all([
        db.queryOne(`SELECT COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        db.query(`SELECT item_id FROM mkt_daily_deal_purchase WHERE buyer_id = $1 AND day = $2`, [buyerId, dayKey]).catch(() => []),
        ownedSets(buyerId),
    ]);
    const gold = goldRow?.gold || 0;
    const claimed = new Set(claimedRows.map((r) => r.item_id));
    return {
        signedIn: true,
        gold,
        resetInSecs,
        resetAt,
        deals: deals.map((d) => {
            const isOwned = (d.kind === "gear" && owned.gear.has(d.id)) || (d.kind === "pet" && owned.pets.has(d.id));
            const isClaimed = claimed.has(d.id);
            return { ...d, owned: isOwned, claimed: isClaimed, canBuy: !isOwned && !isClaimed && gold >= d.price };
        }),
    };
}

// POST — claim one of today's deals. Re-derives the deal server-side so the price can't be spoofed.
export async function buyDailyDeal(buyerId, dealId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const { dayKey } = dayContext();
    const deal = todaysDeals(dayKey).find((d) => d.id === String(dealId));
    if (!deal) return { ok: false, error: "not_a_deal" };

    // One per deal per day — reserve the slot up front (unique PK) so a double-tap can't double-buy.
    const owned = await ownedSets(buyerId);
    if ((deal.kind === "gear" && owned.gear.has(deal.id)) || (deal.kind === "pet" && owned.pets.has(deal.id))) return { ok: false, error: "already_owned" };
    const reserve = await db
        .queryOne(
            `INSERT INTO mkt_daily_deal_purchase (buyer_id, day, item_id, kind, price) VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (buyer_id, day, item_id) DO NOTHING RETURNING item_id`,
            [buyerId, dayKey, deal.id, deal.kind, deal.price]
        )
        .catch(() => null);
    if (!reserve) return { ok: false, error: "already_claimed" };

    // Charge gold atomically; if they can't afford it, release the reservation.
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, deal.price]).catch(() => null);
    if (!paid) {
        await db.query(`DELETE FROM mkt_daily_deal_purchase WHERE buyer_id = $1 AND day = $2 AND item_id = $3`, [buyerId, dayKey, deal.id]).catch(() => {});
        return { ok: false, error: "not_enough_gold" };
    }

    // Deliver the goods.
    if (deal.kind === "gear") await grantItem(buyerId, deal.id, "daily_deal").catch(() => {});
    else if (deal.kind === "consumable") await grantConsumable(buyerId, deal.id, 1).catch(() => {});
    else if (deal.kind === "pet") await db.query(`INSERT INTO mkt_cosmetic_unlock (buyer_id, category, ref) VALUES ($1, 'pet', $2) ON CONFLICT DO NOTHING`, [buyerId, deal.id]).catch(() => {});
    await trackActivity(buyerId, "buy_daily_deal", { id: deal.id, kind: deal.kind, price: deal.price }).catch(() => {});

    const label = deal.kind === "gear" ? itemById(deal.id)?.name : deal.kind === "pet" ? collectibleById(deal.id)?.name : CONSUMABLES[deal.id]?.name;
    return { ok: true, gold: paid.gold, name: label || deal.name, kind: deal.kind };
}
