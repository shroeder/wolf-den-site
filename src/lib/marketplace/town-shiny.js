import "server-only";

import { db } from "@/lib/db";
import { GLINT_DECOS, decorationById } from "@/lib/marketplace/decorations.js";
import { grantDecoration } from "@/lib/marketplace/farm-decorations.js";
import { trackActivity } from "@/lib/marketplace/activity.js";

// ── THE HIDDEN SHINY GLINT ───────────────────────────────────────────────────────────────────────────────────
// A rare sparkle that drifts through the Town background 0-2× a day. It's barely visible (tiny + faint, tucked up
// in the sky/rooftops), lingers a few hours, and the FIRST member to spot and tap it claims a source-exclusive
// decoration. Shared: one winner, then it vanishes for everyone. Pure "were you paying attention?" delight.

// Where a glimmer can appear: the roofline of each town landmark (x matches TOWN_BUILDINGS, y is just above the
// building so it catches the light on the roof/eaves). Keep these in step with TOWN_BUILDINGS if the street
// layout changes, or glimmers will start floating beside buildings instead of on them.
const SHINY_SPOTS = [
    { x: 4, y: 40, at: "the Tavern roof" },
    { x: 15, y: 38, at: "the Boss Arena banner" },
    { x: 26, y: 36, at: "the Forge chimney" },
    { x: 37, y: 37, at: "the Auction House gable" },
    { x: 48, y: 39, at: "the General Store awning" },
    { x: 59, y: 38, at: "the Docks mast" },
    { x: 70, y: 40, at: "the Farm silo" },
    { x: 81, y: 37, at: "the Vault gable" },
    { x: 92, y: 39, at: "the Festival Stage rigging" },
];

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
    // Perch it on an actual LANDMARK rather than a random patch of sky — a glimmer on the Forge roof or the
    // Vault's gable reads as something hidden in the town you have to go and find. Purely random coordinates
    // left it floating in empty blue, which looked like a UI artefact instead of a secret.
    const spot = SHINY_SPOTS[Math.floor(Math.random() * SHINY_SPOTS.length)];
    const x = Math.round((spot.x + (Math.random() * 4 - 2)) * 10) / 10;  // ±2% jitter so it isn't pixel-identical
    const y = Math.round((spot.y + (Math.random() * 4 - 2)) * 10) / 10;
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
