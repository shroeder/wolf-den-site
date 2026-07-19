import "server-only";

import { db } from "@/lib/db";
import { COLLECTIBLES } from "@/lib/marketplace/collectibles.js";
import { BORDERS } from "@/lib/marketplace/borders.js";
import { FRAMES } from "@/lib/marketplace/frames.js";
import { AVATAR_COSMETICS } from "@/lib/marketplace/avatar-cosmetics.js";
import { BACKGROUNDS } from "@/lib/marketplace/backgrounds.js";
import { cosmeticPrice } from "@/lib/marketplace/cosmetic-price.js";
import { levelForXp } from "@/lib/marketplace/xp.js";

// The gold cosmetics store: buy pets / borders / frames / auras early with gold. Role-locked (badge)
// cosmetics are never for sale. Purchases are recorded in mkt_cosmetic_unlock; the unlock helpers + equip
// validators treat a purchased ref as unlocked.
const CATS = {
    pet: { list: COLLECTIBLES },
    border: { list: BORDERS },
    frame: { list: FRAMES },
    cosmetic: { list: AVATAR_COSMETICS },
    background: { list: BACKGROUNDS },
};

// A catalog def that's actually for sale (real id, not "none", not role/badge-gated), or null.
function buyableDef(category, ref) {
    const c = CATS[category];
    if (!c) return null;
    const def = c.list.find((i) => i.id === ref);
    if (!def || def.id === "none" || def.requiresBadges || def.eliteOnly) return null;
    return def;
}

// Purchased-with-gold unlocks grouped by category → Set of ids (for the equip validators).
export async function getPurchasedCosmetics(buyerId) {
    const out = { pet: new Set(), border: new Set(), frame: new Set(), cosmetic: new Set(), background: new Set() };
    if (!buyerId) return out;
    const rows = await db.query(`SELECT category, ref FROM mkt_cosmetic_unlock WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    for (const r of rows) if (out[r.category]) out[r.category].add(r.ref);
    return out;
}

// Purchased ids for ONE category (Set) — used by a single equip validator.
export async function purchasedSet(buyerId, category) {
    if (!buyerId) return new Set();
    const rows = await db.query(`SELECT ref FROM mkt_cosmetic_unlock WHERE buyer_id = $1 AND category = $2`, [buyerId, category]).catch(() => []);
    return new Set(rows.map((r) => r.ref));
}

// Serializable store state for the profile/avatar pages: gold + purchased ids per category (arrays).
export async function getStoreState(buyerId) {
    const empty = { pet: [], border: [], frame: [], cosmetic: [], background: [] };
    if (!buyerId) return { gold: 0, purchased: empty };
    const [goldRow, rows] = await Promise.all([
        db.queryOne(`SELECT COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        db.query(`SELECT category, ref FROM mkt_cosmetic_unlock WHERE buyer_id = $1`, [buyerId]).catch(() => []),
    ]);
    const purchased = { pet: [], border: [], frame: [], cosmetic: [], background: [] };
    for (const r of rows) if (purchased[r.category]) purchased[r.category].push(r.ref);
    return { gold: goldRow?.gold || 0, purchased };
}

// Buy a cosmetic with gold. Must be a real for-sale def, still LEVEL-locked for the member (no point
// buying what they already have), not already purchased, and affordable. Atomic gold deduction + record.
export async function buyCosmetic(buyerId, category, ref) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const def = buyableDef(category, ref);
    if (!def) return { ok: false, error: "not_for_sale" };
    const me = await db.queryOne(`SELECT COALESCE(xp, 0) AS xp FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const level = levelForXp(me?.xp || 0).level;
    if (level >= (def.level || 1)) return { ok: false, error: "already_unlocked" };
    const owned = await db.queryOne(`SELECT 1 FROM mkt_cosmetic_unlock WHERE buyer_id = $1 AND category = $2 AND ref = $3`, [buyerId, category, ref]).catch(() => null);
    if (owned) return { ok: false, error: "already_owned" };
    const price = cosmeticPrice(category, def.level || 1);
    const row = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, price]).catch(() => null);
    if (!row) return { ok: false, error: "not_enough_gold" };
    await db.query(`INSERT INTO mkt_cosmetic_unlock (buyer_id, category, ref) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [buyerId, category, ref]).catch(() => {});
    return { ok: true, gold: row.gold, category, ref, price };
}
