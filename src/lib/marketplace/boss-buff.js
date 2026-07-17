import "server-only";

import { db } from "@/lib/db";

// Preset boss-fight buffs the admin can trigger. Damage multiplier applies to everyone's manual + auto
// damage while active (which naturally boosts raffle tickets too, since tickets come from damage).
export const BUFF_PRESETS = [
    { key: "double", label: "Double Damage", emoji: "⚔️", damageMult: 2 },
    { key: "triple", label: "Triple Damage", emoji: "🔥", damageMult: 3 },
    { key: "rampage", label: "MEGA RAMPAGE", emoji: "💥", damageMult: 5 },
];

// The currently-active buff (latest non-expired), or null.
export async function getActiveBuff() {
    const row = await db.queryOne(
        `SELECT label, emoji, damage_mult, expires_at FROM mkt_boss_buff WHERE expires_at > NOW() ORDER BY started_at DESC LIMIT 1`
    ).catch(() => null);
    if (!row) return null;
    return { label: row.label, emoji: row.emoji || "⚡", damageMult: Number(row.damage_mult) || 1, expiresAt: row.expires_at };
}

// The active damage multiplier (1 when no buff). Read by combat.
export async function activeDamageMult() {
    const buff = await getActiveBuff();
    return buff ? buff.damageMult : 1;
}

// Trigger a buff for a duration. Admin-only (caller gates). Overwrites by expiring anything active (only
// one buff at a time). Returns the new buff.
export async function activateBuff({ key, hours }) {
    const preset = BUFF_PRESETS.find((p) => p.key === key) || BUFF_PRESETS[0];
    const dur = Math.max(1, Math.min(168, Math.round(Number(hours) || 2)));
    // End any currently-active buff so there's only ever one.
    await db.query(`UPDATE mkt_boss_buff SET expires_at = NOW() WHERE expires_at > NOW()`).catch(() => {});
    const row = await db.queryOne(
        `INSERT INTO mkt_boss_buff (label, emoji, damage_mult, expires_at)
         VALUES ($1, $2, $3, NOW() + ($4 || ' hours')::interval) RETURNING id, expires_at`,
        [preset.label, preset.emoji, preset.damageMult, String(dur)]
    ).catch(() => null);
    return row ? { ...preset, hours: dur, expiresAt: row.expires_at } : null;
}

// End the active buff early.
export async function endBuff() {
    await db.query(`UPDATE mkt_boss_buff SET expires_at = NOW() WHERE expires_at > NOW()`).catch(() => {});
    return { ok: true };
}
