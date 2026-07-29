import "server-only";

import { db } from "@/lib/db";
import { GLINT_DECOS, decorationById } from "@/lib/marketplace/decorations.js";
import { grantDecoration } from "@/lib/marketplace/farm-decorations.js";
import { trackActivity } from "@/lib/marketplace/activity.js";

// ── THE HIDDEN SHINY GLINT ───────────────────────────────────────────────────────────────────────────────────
// A rare sparkle that drifts through the Town background 0-2× a day. It's barely visible (tiny + faint, tucked up
// in the sky/rooftops), lingers a few hours, and the FIRST member to spot and tap it claims a source-exclusive
// decoration. Shared: one winner, then it vanishes for everyone. Pure "were you paying attention?" delight.

const SHINY_MAX_PER_DAY = 2;
const SHINY_TTL_HOURS = 3;           // an unclaimed glint fades after a few hours
const SHINY_SPAWN_CHANCE = 0.02;     // per 15-min cron tick (~1/day avg, capped at 2)

// The current live (unclaimed, unexpired) glint, or null. Shape is town-state friendly. x/y are % positions;
// y is kept high so it hides among the rooftops/sky. No reward info leaks — that's rolled at claim time.
export async function getActiveShiny() {
    const row = await db.queryOne(
        `SELECT id, x, y FROM mkt_town_shiny WHERE claimed_by IS NULL AND expires_at > NOW() ORDER BY spawned_at DESC LIMIT 1`
    ).catch(() => null);
    return row ? { id: Number(row.id), x: Number(row.x), y: Number(row.y) } : null;
}

// Cron: maybe spawn a glint. At most one live at a time, at most SHINY_MAX_PER_DAY per day, small per-tick chance.
export async function maybeSpawnShiny() {
    const [live, todayRow] = await Promise.all([
        db.queryOne(`SELECT id FROM mkt_town_shiny WHERE claimed_by IS NULL AND expires_at > NOW() LIMIT 1`).catch(() => null),
        db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_town_shiny WHERE spawned_at > (NOW() AT TIME ZONE 'America/Chicago')::date`).catch(() => ({ n: 0 })),
    ]);
    if (live) return { skipped: "already_live" };
    if ((todayRow?.n || 0) >= SHINY_MAX_PER_DAY) return { skipped: "daily_cap" };
    if (Math.random() >= SHINY_SPAWN_CHANCE) return { skipped: "no_roll" };
    const x = Math.round((6 + Math.random() * 88) * 10) / 10;   // 6%–94% across
    const y = Math.round((16 + Math.random() * 30) * 10) / 10;  // 16%–46% down (up in the sky/rooftops)
    const row = await db.queryOne(
        `INSERT INTO mkt_town_shiny (x, y, expires_at) VALUES ($1, $2, NOW() + ($3 || ' hours')::interval) RETURNING id`,
        [x, y, String(SHINY_TTL_HOURS)]
    ).catch(() => null);
    return { spawned: Boolean(row), id: row ? Number(row.id) : null };
}

// Claim the glint — atomic first-tap-wins. Grants a random source-exclusive "glint" decoration to the winner.
export async function claimShiny(buyerId, shinyId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const reward = GLINT_DECOS[Math.floor(Math.random() * GLINT_DECOS.length)];
    const claimed = await db.queryOne(
        `UPDATE mkt_town_shiny SET claimed_by = $1, claimed_at = NOW(), reward_deco = $2
          WHERE id = $3 AND claimed_by IS NULL AND expires_at > NOW() RETURNING reward_deco`,
        [buyerId, reward, shinyId]
    ).catch(() => null);
    if (!claimed) return { ok: false, error: "gone" }; // someone else got it (or it faded)
    await grantDecoration(buyerId, reward, 1, "glint").catch(() => {});
    await trackActivity(buyerId, "shiny_claim", { decoId: reward }).catch(() => {});
    const d = decorationById(reward);
    return { ok: true, deco: d ? { id: d.id, name: d.name, emoji: d.emoji, rarity: d.rarity, buff: d.buff } : { id: reward } };
}
