import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { DECORATIONS, decorationById, isDecoration, decorationBuffs, DECO_RARITY, DECO_STATS, buffText } from "@/lib/marketplace/decorations.js";
import { listFinalCustomDecos, getCustomState } from "@/lib/marketplace/custom-deco.js";

const isCustom = (id) => String(id).startsWith("custom:");
const CUSTOM_COLOR = "#c9a2ff";

// Farm decoration ownership + placement + buffs. The catalog is code (decorations.js); this module is the
// per-member state: what you own, where you've placed it, and the passive buffs your placed pieces grant.

// The garden plots cluster in the FRONT-LEFT of the field (see ScenePlots). Decorations may go anywhere EXCEPT
// there — this keep-out box (in field %) keeps them from burying your crops. Kept generous so the UI hint lines
// up with the guard.
const PLOT_KEEPOUT = { xMax: 42, yMin: 74 };
export function nearPlots(x, y) {
    return Number(x) <= PLOT_KEEPOUT.xMax && Number(y) >= PLOT_KEEPOUT.yMin;
}
// Owning a decoration is a PERMANENT unlock — you can place it as many times as you like (reusable, never
// consumed). The only limit is a global cap on how many items you can have placed at once.
export const PLACE_CAP = 500;
export const decoKeepout = () => ({ ...PLOT_KEEPOUT });

// The sprite-url map for a set of decoration ids (or all, if none given).
export async function getDecoSprites(ids = null) {
    const rows = ids
        ? await db.query(`SELECT deco_id, url FROM mkt_deco_sprite WHERE deco_id = ANY($1)`, [ids]).catch(() => [])
        : await db.query(`SELECT deco_id, url FROM mkt_deco_sprite`).catch(() => []);
    const map = {};
    for (const r of rows || []) map[r.deco_id] = r.url;
    return map;
}

// Grant a decoration (from a shop buy, spin, level unlock, admin). Increments the owned qty. Best-effort.
export async function grantDecoration(buyerId, decoId, qty = 1, source = "grant") {
    if (!buyerId || !isDecoration(decoId)) return { ok: false, error: "bad_decoration" };
    await db
        .query(
            `INSERT INTO mkt_deco_owned (buyer_id, deco_id, qty) VALUES ($1, $2, $3)
             ON CONFLICT (buyer_id, deco_id) DO UPDATE SET qty = mkt_deco_owned.qty + EXCLUDED.qty`,
            [buyerId, decoId, Math.max(1, qty)]
        )
        .catch(() => {});
    await trackActivity(buyerId, "deco_unlock", { decoId, source }).catch(() => {});
    return { ok: true, decoId, qty };
}

// Buy a decoration from the regular ("shop") or premium ("special") shop with gold. Atomic gold guard.
export async function buyDecoration(buyerId, decoId) {
    if (!buyerId) return { ok: false, error: "bad_request" };
    const def = decorationById(decoId);
    if (!def || !["shop", "special"].includes(def.source) || !def.price) return { ok: false, error: "not_buyable" };
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, def.price]).catch(() => null);
    if (!paid) return { ok: false, error: "insufficient_gold" };
    await logCoin(buyerId, -def.price, "deco_buy", { balanceAfter: paid.gold, meta: { decoId } }).catch(() => {});
    await grantDecoration(buyerId, decoId, 1, "shop");
    return { ok: true, decoId, gold: paid.gold, ...(await decoState(buyerId)) };
}

// Aggregate the placed-decoration buffs for a member (drives passive farming bonuses). Returns % per stat.
export async function placedDecoBuffs(buyerId) {
    if (!buyerId) return decorationBuffs([]);
    const rows = await db.query(`SELECT deco_id FROM mkt_deco_placement WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    return decorationBuffs((rows || []).map((r) => r.deco_id));
}

// Placed decorations for rendering (position + sprite + flip), newest last so higher z / later placements draw on top.
export async function getPlacements(buyerId) {
    if (!buyerId) return [];
    const rows = await db.query(`SELECT id, deco_id, x, y, z, flip, scale, rot FROM mkt_deco_placement WHERE buyer_id = $1 ORDER BY z ASC, id ASC`, [buyerId]).catch(() => []);
    if (!rows.length) return [];
    const [sprites, customMap] = await Promise.all([getDecoSprites(rows.map((r) => r.deco_id)), listFinalCustomDecos(buyerId)]);
    return rows.map((r) => {
        const def = decorationById(r.deco_id);
        const cm = customMap.get(r.deco_id);
        return {
            id: r.id, decoId: r.deco_id, x: r.x, y: r.y, z: r.z, flip: r.flip === true, scale: Number(r.scale ?? 1), rot: Number(r.rot ?? 0),
            name: def?.name || cm?.name || r.deco_id, emoji: def?.emoji || "🎨", rarity: def?.rarity || (cm ? "custom" : "common"), rarityColor: cm ? CUSTOM_COLOR : DECO_RARITY[def?.rarity]?.color,
            spriteUrl: sprites[r.deco_id] || cm?.url || null, buff: def?.buff || null, buffText: def?.buff ? buffText(def.buff) : null, source: def?.source || (cm ? "custom" : null),
        };
    });
}

// The full decoration state for the farm UI: owned (with placed counts + how many free to place), placements,
// the aggregate buff totals, and the keep-out zone. Everything the client needs to manage decorations.
export async function decoState(buyerId) {
    if (!buyerId) return { owned: [], placements: [], buffs: decorationBuffs([]), keepout: decoKeepout() };
    const [ownedRows, placeRows, sprites, customMap] = await Promise.all([
        db.query(`SELECT deco_id, qty FROM mkt_deco_owned WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        db.query(`SELECT id, deco_id, x, y, z, flip, scale, rot FROM mkt_deco_placement WHERE buyer_id = $1 ORDER BY z ASC, id ASC`, [buyerId]).catch(() => []),
        getDecoSprites(),
        listFinalCustomDecos(buyerId),
    ]);
    const customState = await getCustomState(buyerId).catch(() => ({ credits: 0, draft: null }));
    const placedCount = {};
    for (const p of placeRows || []) placedCount[p.deco_id] = (placedCount[p.deco_id] || 0) + 1;
    // Build owned entries — catalog decorations AND player-made customs (custom:<id>).
    const ownedEntry = (decoId, placed) => {
        const cm = customMap.get(decoId);
        if (cm) return { id: decoId, name: cm.name, emoji: "🎨", rarity: "custom", rarityColor: CUSTOM_COLOR, spriteUrl: sprites[decoId] || cm.url || null, owned: true, placed, buff: null, buffText: null, custom: true };
        const def = decorationById(decoId);
        if (!def) return null;
        return { id: def.id, name: def.name, emoji: def.emoji, rarity: def.rarity, rarityColor: DECO_RARITY[def.rarity]?.color, spriteUrl: sprites[def.id] || null, owned: true, placed, buff: def.buff, buffText: def.buff ? buffText(def.buff) : null };
    };
    const owned = (ownedRows || [])
        .map((r) => ownedEntry(r.deco_id, placedCount[r.deco_id] || 0))
        .filter(Boolean)
        .sort((a, b) => (a.custom ? 1 : 0) - (b.custom ? 1 : 0) || (DECO_RARITY[b.rarity]?.rank || 0) - (DECO_RARITY[a.rarity]?.rank || 0));
    const placements = (placeRows || []).map((r) => {
        const def = decorationById(r.deco_id);
        const cm = customMap.get(r.deco_id);
        return { id: r.id, decoId: r.deco_id, x: r.x, y: r.y, z: r.z, flip: r.flip === true, scale: Number(r.scale ?? 1), rot: Number(r.rot ?? 0), name: def?.name || cm?.name || r.deco_id, emoji: def?.emoji || "🎨", rarity: def?.rarity || (cm ? "custom" : "common"), rarityColor: cm ? CUSTOM_COLOR : DECO_RARITY[def?.rarity]?.color, spriteUrl: sprites[r.deco_id] || cm?.url || null, buff: def?.buff || null, buffText: def?.buff ? buffText(def.buff) : null, source: def?.source || (cm ? "custom" : null) };
    });
    const buffs = decorationBuffs((placeRows || []).map((r) => r.deco_id));
    const ownedSet = new Set((ownedRows || []).map((r) => r.deco_id));
    // The FULL catalog (all 100) annotated with owned/placed/price/buyable — the drawer shows everything: owned
    // pieces you can drag out, and locked ones you tap to inspect + buy (or learn where to earn them).
    const RANK = DECO_RARITY;
    const customCatalog = [...customMap.entries()].map(([id, cm]) => ({
        id, name: cm.name, emoji: "🎨", rarity: "custom", rarityColor: CUSTOM_COLOR, source: "custom", price: null,
        spriteUrl: sprites[id] || cm.url || null, buff: null, buffText: null, owned: true, placed: placedCount[id] || 0, buyable: false, custom: true,
    }));
    const catalog = [...customCatalog, ...DECORATIONS
        .map((d) => ({
            id: d.id, name: d.name, emoji: d.emoji, rarity: d.rarity, rarityColor: RANK[d.rarity]?.color,
            source: d.source, price: d.price || null, spriteUrl: sprites[d.id] || null,
            buff: d.buff || null, buffText: d.buff ? buffText(d.buff) : null,
            owned: ownedSet.has(d.id), placed: placedCount[d.id] || 0,
            buyable: ["shop", "special"].includes(d.source) && Boolean(d.price),
        }))]
        .sort((a, b) => {
            if (a.owned !== b.owned) return a.owned ? -1 : 1; // owned (placeable) first
            return (RANK[a.rarity]?.rank || 0) - (RANK[b.rarity]?.rank || 0) || (a.price || 0) - (b.price || 0);
        });
    return { owned, placements, buffs, buffMeta: DECO_STATS, keepout: decoKeepout(), catalog, custom: customState, placedTotal: (placeRows || []).length, placedCap: PLACE_CAP };
}

const clampPct = (v, def) => { const n = Number(v); return Number.isFinite(n) ? Math.max(2, Math.min(98, n)) : def; };

// Place a decoration you OWN at (x, y). Owning is a permanent unlock, so you can place the same decoration as
// many times as you like (reusable). Guards: you own it, the spot isn't over the plots, and you're under the
// global 500-item placement cap.
export async function placeDecoration(buyerId, decoId, x, y) {
    if (!buyerId || (!isDecoration(decoId) && !isCustom(decoId))) return { ok: false, error: "bad_decoration" };
    const px = clampPct(x, 50);
    const py = clampPct(y, 55);
    const owned = await db.queryOne(`SELECT 1 FROM mkt_deco_owned WHERE buyer_id = $1 AND deco_id = $2 AND qty > 0`, [buyerId, decoId]).catch(() => null);
    if (!owned) return { ok: false, error: "not_owned" };
    const total = await db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_deco_placement WHERE buyer_id = $1`, [buyerId]).catch(() => ({ n: 0 }));
    if ((total?.n || 0) >= PLACE_CAP) return { ok: false, error: "placement_limit", ...(await decoState(buyerId)) };
    const topZ = await db.queryOne(`SELECT COALESCE(MAX(z), 0) AS z FROM mkt_deco_placement WHERE buyer_id = $1`, [buyerId]).catch(() => ({ z: 0 }));
    await db.query(`INSERT INTO mkt_deco_placement (buyer_id, deco_id, x, y, z) VALUES ($1, $2, $3, $4, $5)`, [buyerId, decoId, px, py, (topZ?.z || 0) + 1]).catch(() => {});
    return { ok: true, ...(await decoState(buyerId)) };
}

// Resize / rotate a placed decoration (plots are NOT transformable — only decorations). scale clamps to
// 0.4–2.5×, rot wraps to 0–359°. Returns the fresh decoration state so the scene updates in place.
export async function transformDecoration(buyerId, placementId, { scale, rot } = {}) {
    if (!buyerId || !placementId) return { ok: false, error: "bad_request" };
    const s = scale == null ? null : Math.max(0.4, Math.min(2.5, Number(scale)));
    const r = rot == null ? null : ((Math.round(Number(rot)) % 360) + 360) % 360;
    if (s == null && r == null) return { ok: false, error: "no_change" };
    const moved = await db.queryOne(
        `UPDATE mkt_deco_placement SET scale = COALESCE($3, scale), rot = COALESCE($4, rot)
          WHERE id = $1 AND buyer_id = $2 RETURNING id`,
        [placementId, buyerId, s, r]
    ).catch(() => null);
    if (!moved) return { ok: false, error: "not_found" };
    return { ok: true, ...(await decoState(buyerId)) };
}

// Reposition a placed decoration (drag). Decorations can go anywhere on the farm — you place them freely.
export async function moveDecoration(buyerId, placementId, x, y) {
    if (!buyerId || !placementId) return { ok: false, error: "bad_request" };
    const px = clampPct(x, 50);
    const py = clampPct(y, 55);
    const moved = await db.queryOne(`UPDATE mkt_deco_placement SET x = $3, y = $4 WHERE id = $1 AND buyer_id = $2 RETURNING id`, [placementId, buyerId, px, py]).catch(() => null);
    if (!moved) return { ok: false, error: "not_found" };
    return { ok: true, ...(await decoState(buyerId)) };
}

// Pick a placed decoration back up (returns it to your inventory to re-place elsewhere).
export async function removeDecoration(buyerId, placementId) {
    if (!buyerId || !placementId) return { ok: false, error: "bad_request" };
    const del = await db.queryOne(`DELETE FROM mkt_deco_placement WHERE id = $1 AND buyer_id = $2 RETURNING id`, [placementId, buyerId]).catch(() => null);
    if (!del) return { ok: false, error: "not_found" };
    return { ok: true, ...(await decoState(buyerId)) };
}

// Every decoration id (for the sprite-generation job).
export const allDecorationIds = () => DECORATIONS.map((d) => d.id);
