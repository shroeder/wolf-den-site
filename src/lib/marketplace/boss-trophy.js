import "server-only";

import { db } from "@/lib/db";
import { editImage } from "@/lib/marketplace/openai-image.js";

// ── BOSS TROPHIES ────────────────────────────────────────────────────────────────────────────────────────────
//
// Whoever deals the most damage to a boss keeps a statue of it. This replaces the random drop-only badge the
// #1 dealer used to get, which said nothing about the fight it came from — a statue of THAT boss, on their
// farm, where other members walk past it, is a record of the kill rather than a token.
//
// Granted as a decoration (`trophy:<bossEventId>`) so it flows through the normal place/inspect system, exactly
// like a player-made creation does.
//
// ORDERING MATTERS. The trophy is written and granted FIRST using the boss's own portrait, and only then does
// the statue art get attempted. Boss resolution is the one path that must not fail: if the art call throws or
// times out, the winner still has their trophy, just wearing the boss's portrait instead of a carved version.
const STATUE_PROMPT = [
    "Recarve this creature as a single MONUMENT STATUE of itself: weathered carved stone,",
    "chiselled planes and tool marks, mounted on a short ornate stone plinth with a small blank brass plaque.",
    "Keep the creature's exact pose, silhouette and proportions — it must be unmistakably the same creature,",
    "just rendered in stone. Drain the colour to greys and cool stone tones with soft moss in the crevices.",
    "Isolated as a clean cutout on a FULLY TRANSPARENT background (alpha channel) — no background, no scenery,",
    "no ground shadow, no glow. No text, no lettering on the plaque, no logo, no watermark, no border.",
].join(" ");

/**
 * Grant the boss trophy to the top damage dealer. Idempotent per boss — a re-resolve can't mint a second one.
 * Returns { decoId, name } or null.
 */
export async function grantBossTrophy({ bossId, bossName, imageUrl, winnerId, damage }) {
    if (!bossId || !winnerId) return null;
    const decoId = `trophy:${bossId}`;
    const name = `${bossName || "Boss"} — Trophy`;

    // The portrait stands in until (and unless) the statue lands, so the trophy is never blocked on the art.
    const existing = await db.queryOne(`SELECT deco_id FROM mkt_boss_trophy WHERE deco_id = $1`, [decoId]).catch(() => null);
    if (!existing) {
        await db.query(
            `INSERT INTO mkt_boss_trophy (deco_id, boss_id, boss_name, winner_id, damage, url)
             VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (deco_id) DO NOTHING`,
            [decoId, bossId, bossName || "Boss", winnerId, Math.max(0, Number(damage) || 0), imageUrl || null]
        ).catch(() => {});
    }
    await db.query(
        `INSERT INTO mkt_deco_sprite (deco_id, url, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (deco_id) DO UPDATE SET url = COALESCE(mkt_deco_sprite.url, EXCLUDED.url), updated_at = NOW()`,
        [decoId, imageUrl || null]
    ).catch(() => {});
    await db.query(
        `INSERT INTO mkt_deco_owned (buyer_id, deco_id, qty) VALUES ($1, $2, 1) ON CONFLICT (buyer_id, deco_id) DO NOTHING`,
        [winnerId, decoId]
    ).catch(() => {});

    // Now the statue. Awaited rather than fire-and-forget: an un-awaited promise is killed the moment the
    // handler returns on Vercel, which is how raid pushes once went out to nobody.
    if (!existing && imageUrl) {
        try {
            const buf = Buffer.from(await (await fetch(imageUrl)).arrayBuffer());
            const url = await editImage(buf, STATUE_PROMPT, {
                size: "1024x1024", pathPrefix: "marketplace/decorations/trophy", quality: "medium",
                resizeTo: 512, deHalo: true,
                meta: { origin: "boss", subject: bossId, label: `Boss trophy — ${bossName || bossId}` },
            });
            if (url) {
                await db.query(`UPDATE mkt_boss_trophy SET url = $2 WHERE deco_id = $1`, [decoId, url]).catch(() => {});
                await db.query(
                    `INSERT INTO mkt_deco_sprite (deco_id, url, updated_at) VALUES ($1, $2, NOW())
                     ON CONFLICT (deco_id) DO UPDATE SET url = EXCLUDED.url, updated_at = NOW()`,
                    [decoId, url]
                ).catch(() => {});
            }
        } catch { /* the portrait already stands in — a failed carve must not cost anyone their trophy */ }
    }
    return { decoId, name };
}

/** Trophy rows for a set of deco ids, so the farm can name and draw them. */
export async function trophyMap(decoIds = []) {
    const ids = decoIds.filter((d) => String(d).startsWith("trophy:"));
    if (!ids.length) return new Map();
    const rows = await db.query(
        `SELECT deco_id, boss_name, damage, url, created_at FROM mkt_boss_trophy WHERE deco_id = ANY($1)`, [ids]
    ).catch(() => []);
    return new Map(rows.map((r) => [r.deco_id, r]));
}
