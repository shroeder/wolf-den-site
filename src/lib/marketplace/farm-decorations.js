import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { bumpQuestProgress } from "@/lib/marketplace/quests.js";
import { DECORATIONS, decorationById, isDecoration, decorationBuffs, decoLight, DECO_RARITY, DECO_STATS, buffText } from "@/lib/marketplace/decorations.js";
import { trophyMap } from "@/lib/marketplace/boss-trophy.js";
import { listFinalCustomDecos, getCustomState } from "@/lib/marketplace/custom-deco.js";
import { syncEarnedBadges, grantEventBadge } from "@/lib/marketplace/badges.js";

const isCustom = (id) => String(id).startsWith("custom:");
// Boss trophies are decorations too — `trophy:<bossEventId>`, granted to whoever topped the damage board.
const isTrophy = (id) => String(id).startsWith("trophy:");
const CUSTOM_COLOR = "#c9a2ff";

const hexToRgb = (hex) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || ""); return m ? `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}` : null; };
// Resolve a placement's LIGHT for the renderer. A PLAYER override (light_on) wins — always-on + tunable color /
// intensity / falloff. Otherwise fall back to the decoration's intrinsic night-only glow (if it has one).
// Shape: { on, always, rgb:"r,g,b", radius(px), intensity 0..1, flicker }.
const resolveLight = (row) => {
    const def = decoLight(row.deco_id);
    if (row.light_on) return { on: true, always: true, rgb: hexToRgb(row.light_color) || def?.rgb || "255,214,122", radius: Number(row.light_radius ?? 70), intensity: Number(row.light_intensity ?? 0.7), flicker: Boolean(def?.flicker) };
    if (def) return { on: true, always: false, rgb: def.rgb, radius: def.r, intensity: 0.62, flicker: Boolean(def.flicker) };
    return null;
};
// The raw per-placement light/brightness settings the inspect UI edits.
const lightSettings = (row) => ({ brightness: Number(row.brightness ?? 1), lightOn: row.light_on === true, lightColor: row.light_color || (decoLight(row.deco_id) ? `#${decoLight(row.deco_id).rgb.split(",").map((n) => Number(n).toString(16).padStart(2, "0")).join("")}` : "#ffd27a"), lightIntensity: Number(row.light_intensity ?? 0.7), lightRadius: Number(row.light_radius ?? 70) });

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
    const rows = await db.query(`SELECT id, deco_id, x, y, z, flip, scale, rot, view, light_on, light_color, light_intensity, light_radius, brightness FROM mkt_deco_placement WHERE buyer_id = $1 ORDER BY z ASC, id ASC`, [buyerId]).catch(() => []);
    if (!rows.length) return [];
    const [sprites, customMap] = await Promise.all([getDecoSprites(rows.map((r) => r.deco_id)), listFinalCustomDecos(buyerId)]);
    return rows.map((r) => {
        const def = decorationById(r.deco_id);
        const cm = customMap.get(r.deco_id);
        return {
            id: r.id, decoId: r.deco_id, x: r.x, y: r.y, z: r.z, flip: r.flip === true, scale: Number(r.scale ?? 1), rot: Number(r.rot ?? 0), view: r.view || "outside", light: resolveLight(r), ...lightSettings(r),
            name: def?.name || cm?.name || r.deco_id, emoji: def?.emoji || "🎨", rarity: def?.rarity || (cm ? "custom" : "common"), rarityColor: cm ? CUSTOM_COLOR : DECO_RARITY[def?.rarity]?.color,
            spriteUrl: sprites[r.deco_id] || cm?.url || null, buff: def?.buff || null, buffText: def?.buff ? buffText(def.buff) : null, source: def?.source || (cm ? "custom" : null),
            // Credit the original artist on a gifted copy.
            copiedFrom: cm?.creatorName || null, copiedFromAlias: cm?.creatorAlias || null,
        };
    });
}

// The full decoration state for the farm UI: owned (with placed counts + how many free to place), placements,
// the aggregate buff totals, and the keep-out zone. Everything the client needs to manage decorations.
export async function decoState(buyerId) {
    if (!buyerId) return { owned: [], placements: [], buffs: decorationBuffs([]), keepout: decoKeepout() };
    const [ownedRows, placeRows, sprites, customMap] = await Promise.all([
        db.query(`SELECT deco_id, qty FROM mkt_deco_owned WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        db.query(`SELECT id, deco_id, x, y, z, flip, scale, rot, view, light_on, light_color, light_intensity, light_radius, brightness FROM mkt_deco_placement WHERE buyer_id = $1 ORDER BY z ASC, id ASC`, [buyerId]).catch(() => []),
        getDecoSprites(),
        listFinalCustomDecos(buyerId),
    ]);
    const customState = await getCustomState(buyerId).catch(() => ({ credits: 0, draft: null }));
    // Trophy rows for anything the member owns or has placed, so a statue can name and draw itself.
    const trophies = await trophyMap([
        ...(ownedRows || []).map((r) => r.deco_id),
        ...(placeRows || []).map((p) => p.deco_id),
    ]).catch(() => new Map());
    const placedCount = {};
    for (const p of placeRows || []) placedCount[p.deco_id] = (placedCount[p.deco_id] || 0) + 1;
    // Build owned entries — catalog decorations AND player-made customs (custom:<id>).
    const ownedEntry = (decoId, placed) => {
        const tr = trophies.get(decoId);
        if (tr) {
            return {
                id: decoId, name: `${tr.boss_name} — Trophy`, emoji: "🏆", rarity: "trophy", rarityColor: "#ffd75e",
                spriteUrl: sprites[decoId] || tr.url || null, owned: true, placed, buff: null,
                buffText: `Top damage on ${tr.boss_name}${tr.damage ? ` — ${Number(tr.damage).toLocaleString()} damage` : ""}`,
                custom: true, trophy: true,
            };
        }
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
        return { id: r.id, decoId: r.deco_id, x: r.x, y: r.y, z: r.z, flip: r.flip === true, scale: Number(r.scale ?? 1), rot: Number(r.rot ?? 0), view: r.view || "outside", light: resolveLight(r), ...lightSettings(r), name: def?.name || cm?.name || r.deco_id, emoji: def?.emoji || "🎨", rarity: def?.rarity || (cm ? "custom" : "common"), rarityColor: cm ? CUSTOM_COLOR : DECO_RARITY[def?.rarity]?.color, spriteUrl: sprites[r.deco_id] || cm?.url || null, buff: def?.buff || null, buffText: def?.buff ? buffText(def.buff) : null, source: def?.source || (cm ? "custom" : null) };
    });
    const buffs = decorationBuffs((placeRows || []).map((r) => r.deco_id));
    const ownedSet = new Set((ownedRows || []).map((r) => r.deco_id));
    // The FULL catalog (all 100) annotated with owned/placed/price/buyable — the drawer shows everything: owned
    // pieces you can drag out, and locked ones you tap to inspect + buy (or learn where to earn them).
    const RANK = DECO_RARITY;
    const customCatalog = [...customMap.entries()].map(([id, cm]) => ({
        id, name: cm.name, emoji: "🎨", rarity: "custom", rarityColor: CUSTOM_COLOR, source: "custom", price: null,
        spriteUrl: sprites[id] || cm.url || null, buff: null, buffText: null, owned: true, placed: placedCount[id] || 0, buyable: false, custom: true,
        copiedFrom: cm.creatorName || null, copiedFromAlias: cm.creatorAlias || null,
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

// Near-full range so decorations can live anywhere on the farm (matches the client drag clamps). A hair of
// margin keeps a bottom-anchored sprite from clipping off an edge.
const clampPct = (v, def, lo = 1, hi = 100) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };

// Place a decoration you OWN at (x, y). Owning is a permanent unlock, so you can place the same decoration as
// many times as you like (reusable). Guards: you own it, the spot isn't over the plots, and you're under the
// global 500-item placement cap.
export async function placeDecoration(buyerId, decoId, x, y, view = "outside") {
    if (!buyerId || (!isDecoration(decoId) && !isCustom(decoId))) return { ok: false, error: "bad_decoration" };
    const px = clampPct(x, 50, 1, 99);
    const py = clampPct(y, 55, 2, 100);
    const vw = view === "inside" ? "inside" : "outside"; // decorations only live Outside or Inside (never the Garden)
    const owned = await db.queryOne(`SELECT 1 FROM mkt_deco_owned WHERE buyer_id = $1 AND deco_id = $2 AND qty > 0`, [buyerId, decoId]).catch(() => null);
    if (!owned) return { ok: false, error: "not_owned" };
    const total = await db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_deco_placement WHERE buyer_id = $1`, [buyerId]).catch(() => ({ n: 0 }));
    if ((total?.n || 0) >= PLACE_CAP) return { ok: false, error: "placement_limit", ...(await decoState(buyerId)) };
    const topZ = await db.queryOne(`SELECT COALESCE(MAX(z), 0) AS z FROM mkt_deco_placement WHERE buyer_id = $1`, [buyerId]).catch(() => ({ z: 0 }));
    await db.query(`INSERT INTO mkt_deco_placement (buyer_id, deco_id, x, y, z, view) VALUES ($1, $2, $3, $4, $5, $6)`, [buyerId, decoId, px, py, (topZ?.z || 0) + 1, vw]).catch(() => {});
    await trackActivity(buyerId, "place_deco", { decoId }).catch(() => {});
    await bumpQuestProgress(buyerId, "place_deco", 1).catch(() => {});
    await syncEarnedBadges(buyerId).catch(() => {}); // Decorator / Landscaper
    if (isCustom(decoId)) await grantEventBadge(buyerId, "creation_curator").catch(() => {}); // placed your own creation
    return { ok: true, ...(await decoState(buyerId)) };
}

// Resize / rotate / flip a placed decoration (plots are NOT transformable — only decorations). scale clamps to
// 0.4–2.5×, rot wraps to 0–359°, flip mirrors horizontally. Returns the fresh decoration state.
export async function transformDecoration(buyerId, placementId, { scale, rot, flip, brightness, light } = {}) {
    if (!buyerId || !placementId) return { ok: false, error: "bad_request" };
    const s = scale == null ? null : Math.max(0.4, Math.min(2.5, Number(scale)));
    const r = rot == null ? null : ((Math.round(Number(rot)) % 360) + 360) % 360;
    const f = flip == null ? null : Boolean(flip);
    const b = brightness == null ? null : Math.max(0.3, Math.min(2.2, Number(brightness))); // per-sprite brightness
    // Optional light override: on/off, hex color, intensity 0..1, radius (falloff) in px.
    const lon = light?.on == null ? null : Boolean(light.on);
    const lcol = light?.color == null ? null : (/^#[0-9a-fA-F]{6}$/.test(String(light.color)) ? String(light.color) : null);
    const lint = light?.intensity == null ? null : Math.max(0, Math.min(1, Number(light.intensity)));
    const lrad = light?.radius == null ? null : Math.max(20, Math.min(320, Number(light.radius)));
    if (s == null && r == null && f == null && b == null && lon == null && lcol == null && lint == null && lrad == null) return { ok: false, error: "no_change" };
    const moved = await db.queryOne(
        `UPDATE mkt_deco_placement
            SET scale = COALESCE($3, scale), rot = COALESCE($4, rot), flip = COALESCE($5, flip),
                brightness = COALESCE($6, brightness), light_on = COALESCE($7, light_on),
                light_color = COALESCE($8, light_color), light_intensity = COALESCE($9, light_intensity),
                light_radius = COALESCE($10, light_radius)
          WHERE id = $1 AND buyer_id = $2 RETURNING id`,
        [placementId, buyerId, s, r, f, b, lon, lcol, lint, lrad]
    ).catch(() => null);
    if (!moved) return { ok: false, error: "not_found" };
    await trackActivity(buyerId, "arrange_deco", { placementId, kind: "transform" }).catch(() => {});
    await bumpQuestProgress(buyerId, "arrange_deco", 1).catch(() => {});
    return { ok: true, ...(await decoState(buyerId)) };
}

// Per-farm GLOBAL sprite brightness (applied as a real filter on the sprites, never an overlay). 0.6–2.2.
// The floor was 0.3, which silhouettes everything: the pets, the decorations and the owner's own walker all
// went to black cut-outs on a daylight background — and because the setting rides on the FARM, every visitor
// saw it that way too. 0.6 is still visibly dim without erasing the art. See migration 337.
export const MIN_SPRITE_BRIGHTNESS = 0.6;
export async function setSpriteBrightness(buyerId, value) {
    if (!buyerId) return { ok: false, error: "bad_request" };
    const b = Math.max(MIN_SPRITE_BRIGHTNESS, Math.min(2.2, Number(value) || 1));
    await db.query(`UPDATE mkt_buyer SET sprite_brightness = $2 WHERE id = $1`, [buyerId, b]).catch(() => {});
    return { ok: true, spriteBrightness: b, ...(await decoState(buyerId)) };
}

// Reposition a placed decoration (drag). Decorations can go anywhere on the farm — you place them freely.
export async function moveDecoration(buyerId, placementId, x, y) {
    if (!buyerId || !placementId) return { ok: false, error: "bad_request" };
    const px = clampPct(x, 50, 1, 99);
    const py = clampPct(y, 55, 2, 100);
    const moved = await db.queryOne(`UPDATE mkt_deco_placement SET x = $3, y = $4 WHERE id = $1 AND buyer_id = $2 RETURNING id`, [placementId, buyerId, px, py]).catch(() => null);
    if (!moved) return { ok: false, error: "not_found" };
    await trackActivity(buyerId, "arrange_deco", { placementId, kind: "move" }).catch(() => {});
    await bumpQuestProgress(buyerId, "arrange_deco", 1).catch(() => {});
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
