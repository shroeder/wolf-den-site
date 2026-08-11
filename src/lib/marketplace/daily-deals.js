import "server-only";

import { db } from "@/lib/db";
import { ITEMS, itemById, describeStats } from "@/lib/marketplace/items.js";
import { grantItem } from "@/lib/marketplace/inventory.js";
import { CONSUMABLES, grantConsumable } from "@/lib/marketplace/consumables.js";
import { PUBLIC_COLLECTIBLES as COLLECTIBLES, collectibleById, petPrice, petActive } from "@/lib/marketplace/collectibles.js";
import { signatureFor } from "@/lib/marketplace/signatures.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { logCoin } from "@/lib/marketplace/coins.js";

// A short "what it does" line for a deal, so the shop is inspectable (gear stats / pet buff / consumable effect).
function dealDescription(d) {
    if (d.kind === "gear") {
        const it = itemById(d.id);
        const stats = describeStats(it?.stats) || "";
        const sig = signatureFor(d.id);
        return [it?.slot ? String(it.slot).replace(/_/g, " ") : null, stats, sig ? `★ ${sig.desc || sig.label}` : null].filter(Boolean).join(" · ") || "Gear";
    }
    if (d.kind === "pet") {
        const p = collectibleById(d.id);
        if (!p) return "A companion pet.";
        const a = petActive(p);
        return `Companion · +${a.value}% ${String(a.stat).replace(/_/g, " ")} while equipped`;
    }
    if (d.kind === "consumable") return CONSUMABLES[d.id]?.desc || "A one-time consumable.";
    return "";
}

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

// Daily deals never put too-powerful gear on sale — cap the rarity of gear that can appear.
// The ladder lives in rarity.js — twelve copies of it stopped at eternal, and a missing rarity
// ranks below common in silence rather than throwing.
import { RARITY_RANK as DEAL_RARITY_RANK } from "@/lib/marketplace/rarity.js";
import { equippedPowers } from "@/lib/marketplace/ascension-powers.js";
const DEAL_RARITY_CAP = "epic"; // nothing above epic goes on sale

// The full purchasable pool for daily deals (gear + consumables). Pets are intentionally EXCLUDED for now —
// several pets are meant to be earned through specific paths (boss/achievement/real-world perks), so selling
// random ones through the deals shop wasn't right. Revisit with a curated, rarity-capped shop-pet list later.
function dealPool() {
    const gear = ITEMS.filter((i) => i.source === "xp_shop" && (i.xpCost || 0) > 0
            && (DEAL_RARITY_RANK[i.rarity] ?? 9) <= (DEAL_RARITY_RANK[DEAL_RARITY_CAP] ?? 2))
        .map((i) => ({ kind: "gear", id: i.id, name: i.name, rarity: i.rarity, basePrice: i.xpCost }));
    const consumables = Object.entries(CONSUMABLES).filter(([, c]) => c.price != null)
        .map(([id, c]) => ({ kind: "consumable", id, name: c.name, emoji: c.emoji, basePrice: c.price }));
    return [...gear, ...consumables].filter((d) => d.basePrice > 0);
}

// The deterministic list of today's deals (id + kind + discounted price). Same for everyone all day —
// unless a member paid to re-roll, in which case seedExtra makes their set unique for the day.
function todaysDeals(dayKey, seedExtra = "", powers = null) {
    const rng = mulberry32(hashSeed(`deals:${dayKey}${seedExtra}`));
    const pool = dealPool();
    // Guarantee at least one consumable (cheap + accessible) so there's always an easy grab.
    const consumables = shuffle(pool.filter((d) => d.kind === "consumable"), rng);
    const rest = shuffle(pool.filter((d) => d.kind !== "consumable"), rng);
    const picked = [consumables[0], ...rest].filter(Boolean).slice(0, DEAL_COUNT);
    const featuredIdx = Math.floor(rng() * picked.length);
    return picked.map((d, i) => {
        const discount = i === featuredIdx ? FEATURED_DISCOUNT : DISCOUNTS[Math.floor(rng() * DISCOUNTS.length)];
        // The Merchant's Eye halves ONE of the day's deals — the featured one, so which it is stays
        // deterministic and the same for every viewer who has the power.
        const eye = powers?.has?.("merchant_s_eye") && i === featuredIdx;
        const price = Math.max(1, Math.round(d.basePrice * (1 - discount) * (eye ? 0.5 : 1)));
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

const DEAL_RESET_COST = 1500;

// GET — the day's deals for this member, with claimed/owned/affordable flags + the countdown.
export async function getDailyDeals(buyerId) {
    const { dayKey, resetInSecs, resetAt } = dayContext();
    if (!buyerId) return { deals: todaysDeals(dayKey).map((d) => ({ ...d, desc: dealDescription(d), canBuy: false })), resetInSecs, resetAt, gold: 0, signedIn: false };
    const [goldRow, claimedRows, owned, resetRow] = await Promise.all([
        db.queryOne(`SELECT COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        db.query(`SELECT item_id FROM mkt_daily_deal_purchase WHERE buyer_id = $1 AND day = $2`, [buyerId, dayKey]).catch(() => []),
        ownedSets(buyerId),
        db.queryOne(`SELECT deal_reset_day::text AS d FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
    ]);
    const gold = goldRow?.gold || 0;
    const resetUsed = resetRow?.d === dayKey;
    const deals = todaysDeals(dayKey, resetUsed ? `:${buyerId}:r` : "", await equippedPowers(buyerId));
    const claimed = new Set(claimedRows.map((r) => r.item_id));
    return {
        signedIn: true,
        gold,
        resetInSecs,
        resetAt,
        resetCost: DEAL_RESET_COST,
        resetUsed,
        canReset: !resetUsed && gold >= DEAL_RESET_COST,
        deals: deals.map((d) => {
            const isOwned = (d.kind === "gear" && owned.gear.has(d.id)) || (d.kind === "pet" && owned.pets.has(d.id));
            const isClaimed = claimed.has(d.id);
            return { ...d, desc: dealDescription(d), owned: isOwned, claimed: isClaimed, canBuy: !isOwned && !isClaimed && gold >= d.price };
        }),
    };
}

// POST — claim one of today's deals. Re-derives the deal server-side so the price can't be spoofed.
export async function buyDailyDeal(buyerId, dealId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const { dayKey } = dayContext();
    // Re-derive from the member's actual set (their re-rolled set if they paid to reset today).
    const resetRow = await db.queryOne(`SELECT deal_reset_day::text AS d FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const seedExtra = resetRow?.d === dayKey ? `:${buyerId}:r` : "";
    const deal = todaysDeals(dayKey, seedExtra, await equippedPowers(buyerId)).find((d) => d.id === String(dealId));
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
    await logCoin(buyerId, -deal.price, "buy_daily_deal", { meta: { id: deal.id, kind: deal.kind }, balanceAfter: paid.gold }).catch(() => {});

    // Deliver the goods.
    if (deal.kind === "gear") await grantItem(buyerId, deal.id, "daily_deal").catch(() => {});
    else if (deal.kind === "consumable") await grantConsumable(buyerId, deal.id, 1).catch(() => {});
    else if (deal.kind === "pet") await db.query(`INSERT INTO mkt_cosmetic_unlock (buyer_id, category, ref) VALUES ($1, 'pet', $2) ON CONFLICT DO NOTHING`, [buyerId, deal.id]).catch(() => {});
    await trackActivity(buyerId, "buy_daily_deal", { id: deal.id, kind: deal.kind, price: deal.price }).catch(() => {});


    const label = deal.kind === "gear" ? itemById(deal.id)?.name : deal.kind === "pet" ? collectibleById(deal.id)?.name : CONSUMABLES[deal.id]?.name;
    return { ok: true, gold: paid.gold, name: label || deal.name, kind: deal.kind };
}

// Pay to re-roll the special shop into a fresh, member-unique set — once per store-day. Atomic charge + guard.
export async function resetDailyDeals(buyerId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const { dayKey } = dayContext();
    const paid = await db
        .queryOne(
            `UPDATE mkt_buyer SET gold = gold - $3, deal_reset_day = $2::date
              WHERE id = $1 AND gold >= $3 AND (deal_reset_day IS DISTINCT FROM $2::date)
              RETURNING gold`,
            [buyerId, dayKey, DEAL_RESET_COST]
        )
        .catch(() => null);
    if (!paid) {
        const b = await db.queryOne(`SELECT deal_reset_day::text AS d FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
        return { ok: false, error: b?.d === dayKey ? "already_reset" : "not_enough_gold" };
    }
    await logCoin(buyerId, -DEAL_RESET_COST, "cooldown_skip", { meta: { kind: "deal_reroll" }, balanceAfter: paid.gold }).catch(() => {});
    await trackActivity(buyerId, "cooldown_skip", { kind: "deal_reroll", cost: DEAL_RESET_COST }).catch(() => {});
    return { ok: true, ...(await getDailyDeals(buyerId)) };
}
