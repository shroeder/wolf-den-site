import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";
import { trackActivity } from "@/lib/marketplace/activity.js";

// ── PER-PLOT SPECIALIZATION ───────────────────────────────────────────────────────────────────────────────
// Plots are permanent fixtures you invest GOLD into to specialize them. Each plot carries its own level in each
// track (stored in mkt_farm_plot_upgrade.attrs). You decide how each plot specializes — pour into whichever
// tracks define that plot's role. Effects are read at plant time (grow speed) and harvest time (loot / pet XP /
// seed-save / encounters). Extensible forever: add tracks/levels here.
//
// A track: { key, name, emoji, max, base, per, unit, desc, effect(level)->number }. Cost to go level→level+1 is
// round(base * (level+1)^2) (quadratic, mirrors the farm + sailing upgrade curves).

export const PLOT_TRACKS = [
    { key: "fertile", name: "Fertile Soil", emoji: "🌱", max: 5, base: 130, per: 5, unit: "% faster",
        desc: "Crops in this plot grow faster." },
    { key: "loam", name: "Rich Loam", emoji: "🌾", max: 5, base: 170, per: 3, unit: "% loot",
        desc: "Better odds to bump this plot's harvest loot up a tier." },
    { key: "nurture", name: "Nurturing Bed", emoji: "🐾", max: 5, base: 150, per: 20, unit: "% pet XP",
        desc: "Harvesting here feeds your pet extra XP." },
    { key: "greenhouse", name: "Greenhouse", emoji: "🌰", max: 5, base: 190, per: 5, unit: "% seed",
        desc: "Chance to keep the planted seed when you harvest." },
    { key: "ward", name: "Warding Totem", emoji: "⚔️", max: 5, base: 220, per: 4, unit: "% raid",
        desc: "Raises the chance a creature raids this plot at harvest — beat it for bonus loot & chests." },
];
const TRACK_BY_KEY = Object.fromEntries(PLOT_TRACKS.map((t) => [t.key, t]));

export const plotTrackCost = (track, level) => (level >= track.max ? null : Math.round(track.base * (level + 1) ** 2));

const clampLvl = (track, v) => Math.max(0, Math.min(track.max, Number(v) || 0));

// The per-plot attribute levels for one member, keyed by slot: { [slot]: {fertile, loam, ...} }.
export async function getPlotUpgrades(buyerId) {
    if (!buyerId) return {};
    const rows = await db.query(`SELECT slot, attrs FROM mkt_farm_plot_upgrade WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    const by = {};
    for (const r of rows) by[r.slot] = r.attrs || {};
    return by;
}

// The concrete effect a track's level grants (a plain number in the track's unit). Level 0 → 0.
export function plotTrackEffect(key, level) {
    const t = TRACK_BY_KEY[key];
    if (!t) return 0;
    return clampLvl(t, level) * t.per;
}

// Resolve one plot's attrs into the multipliers/chances the crop code reads. Percent tracks → fractions.
export function plotEffects(attrs = {}) {
    const lv = (k) => clampLvl(TRACK_BY_KEY[k], attrs?.[k]);
    return {
        growMult: Math.max(0.5, 1 - 0.05 * lv("fertile")),   // −5%/level grow time (floor 50%)
        lootPromote: 0.03 * lv("loam"),                       // +3%/level loot-tier promote chance
        petXpMult: 1 + 0.2 * lv("nurture"),                   // +20%/level pet XP on harvest
        seedSave: 0.05 * lv("greenhouse"),                    // +5%/level keep-the-seed chance
        raidChance: 0.03 * lv("ward"),                        // +3%/level harvest-encounter chance
    };
}

// The catalog with THIS plot's live levels + costs, for the upgrade modal.
export function plotTracksFor(attrs = {}) {
    return PLOT_TRACKS.map((t) => {
        const level = clampLvl(t, attrs?.[t.key]);
        return {
            key: t.key, name: t.name, emoji: t.emoji, desc: t.desc, unit: t.unit,
            level, max: t.max, maxed: level >= t.max, cost: plotTrackCost(t, level),
            now: plotTrackEffect(t.key, level), next: level < t.max ? plotTrackEffect(t.key, level + 1) : null,
        };
    });
}

// Buy the next level of one track on one plot (guarded gold spend). Returns the plot's new attrs + your gold.
export async function upgradePlotTrack(buyerId, slot, key) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const track = TRACK_BY_KEY[key];
    const s = Number(slot);
    if (!track || !Number.isInteger(s) || s < 0) return { ok: false, error: "bad_request" };
    const row = await db.queryOne(`SELECT attrs FROM mkt_farm_plot_upgrade WHERE buyer_id = $1 AND slot = $2`, [buyerId, s]).catch(() => null);
    const attrs = row?.attrs || {};
    const level = clampLvl(track, attrs[key]);
    if (level >= track.max) return { ok: false, error: "maxed" };
    const cost = plotTrackCost(track, level);
    const paid = await db.queryOne(`UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`, [buyerId, cost]).catch(() => null);
    if (!paid) return { ok: false, error: "insufficient_gold" };
    await logCoin(buyerId, -cost, "farm_plot_upgrade", { balanceAfter: paid.gold, meta: { slot: s, key, level: level + 1 } }).catch(() => {});
    const next = { ...attrs, [key]: level + 1 };
    await db.query(
        `INSERT INTO mkt_farm_plot_upgrade (buyer_id, slot, attrs, updated_at) VALUES ($1, $2, $3::jsonb, NOW())
         ON CONFLICT (buyer_id, slot) DO UPDATE SET attrs = $3::jsonb, updated_at = NOW()`,
        [buyerId, s, JSON.stringify(next)]
    ).catch(() => {});
    // `goldAfter` is the balance-only key the farm client applies to the purse; `gold` is kept because
    // callers already read it, but it is the same number here and the client no longer trusts the name.
    await trackActivity(buyerId, "plot_upgrade", { slot: s, track: key, to: level + 1 }).catch(() => {});
    return { ok: true, slot: s, key, level: level + 1, gold: Number(paid.gold), goldAfter: Number(paid.gold), attrs: next };
}
