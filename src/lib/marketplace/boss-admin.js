import "server-only";

import { put } from "@vercel/blob";

import { db } from "@/lib/db";
import { broadcastBoss } from "@/lib/marketplace/boss-broadcast.js";
import { generateImage, generateSceneImage } from "@/lib/marketplace/openai-image.js";

// Store a finished PNG (base64, generated directly on the phone) as the boss art — fast, no OpenAI wait.
export async function setBossArt(bossId, base64) {
    const boss = await db.queryOne(`SELECT id FROM boss_event WHERE id = $1`, [bossId]);
    if (!boss) throw new Error("Boss not found");
    const clean = String(base64 || "").replace(/^data:image\/\w+;base64,/, "").trim();
    const buffer = Buffer.from(clean, "base64");
    if (!buffer.length) throw new Error("Empty image");
    const blob = await put(`marketplace/boss/${Date.now()}-${Math.round(Math.random() * 1e6)}.png`, buffer, { access: "public", contentType: "image/png" });
    await db.query(`UPDATE boss_event SET image_url = $2 WHERE id = $1`, [bossId, blob.url]);
    return blob.url;
}

// Admin-only weekly-boss management: draft -> generate art (retry) -> release (broadcast) -> live -> ended.

export async function listBossesAdmin() {
    return db
        .query(
            `SELECT b.*,
                    (SELECT COALESCE(SUM(damage), 0)::int FROM boss_hit WHERE boss_id = b.id) AS total_dmg,
                    (SELECT COUNT(DISTINCT buyer_id)::int FROM boss_hit WHERE boss_id = b.id) AS fighters
               FROM boss_event b ORDER BY b.started_at DESC LIMIT 20`
        )
        .catch(() => []);
}

export async function createDraftBoss({ name, description, maxHp, rewardsText, ticketDivisor }) {
    const hp = Math.max(100, Math.floor(Number(maxHp) || 10000));
    const div = Math.max(1, Math.floor(Number(ticketDivisor) || 100));
    return db.queryOne(
        `INSERT INTO boss_event (name, icon, tier, max_hp, hp, status, description, rewards_text, ticket_divisor)
         VALUES ($1, 'dragon', 1, $2, $2, 'draft', $3, $4, $5) RETURNING *`,
        [String(name || "Boss").slice(0, 80), hp, description ? String(description).slice(0, 600) : null, rewardsText ? String(rewardsText).slice(0, 400) : null, div]
    );
}

// Generate boss art from a description (call again to retry). Wraps the prompt for a consistent look.
export async function generateBossArt(bossId, prompt) {
    const boss = await db.queryOne(`SELECT id FROM boss_event WHERE id = $1`, [bossId]);
    if (!boss) throw new Error("Boss not found");
    const full = `${String(prompt || "a fearsome dragon").slice(0, 500)}. 2D video-game boss art, bold stylized illustration, clean confident outlines, cel-shaded flat vibrant colors, dramatic dynamic action pose, strong readable silhouette, centered full-body character splash art, polished RPG game-art style, clean coherent anatomy, no extra or malformed limbs, no visual artifacts, transparent background, no text, no logo, no watermark, no border.`;
    const url = await generateImage(full, { size: "1024x1024", pathPrefix: "marketplace/boss" });
    await db.query(`UPDATE boss_event SET image_url = $2 WHERE id = $1`, [bossId, url]);
    return url;
}

// Battle-stage background prompt (opaque landscape, same art universe, NO characters).
export function bossBackgroundPrompt(subject) {
    const scene = String(subject || "a dark fantasy lair").slice(0, 400);
    return `The battle lair of ${scene}. Epic 2D video-game battle stage background, wide side-scrolling environment, dramatic atmospheric lighting, bold stylized illustration, clean confident outlines, cel-shaded flat vibrant colors, polished RPG game-art style, richly detailed scenery, an empty stage with NO characters or creatures, a clear foreground ground/floor for characters to stand on, no text, no logo, no watermark, no UI, no border.`;
}

// Store a finished background PNG (base64, generated on the phone). Fast, no OpenAI wait.
export async function setBossBackground(bossId, base64) {
    const boss = await db.queryOne(`SELECT id FROM boss_event WHERE id = $1`, [bossId]);
    if (!boss) throw new Error("Boss not found");
    const clean = String(base64 || "").replace(/^data:image\/\w+;base64,/, "").trim();
    const buffer = Buffer.from(clean, "base64");
    if (!buffer.length) throw new Error("Empty image");
    const blob = await put(`marketplace/boss-bg/${Date.now()}-${Math.round(Math.random() * 1e6)}.png`, buffer, { access: "public", contentType: "image/png" });
    await db.query(`UPDATE boss_event SET background_url = $2 WHERE id = $1`, [bossId, blob.url]);
    return blob.url;
}

// Server-side background generation (web fallback for the phone flow).
export async function generateBossBackground(bossId, subject) {
    const boss = await db.queryOne(`SELECT id, name, description FROM boss_event WHERE id = $1`, [bossId]);
    if (!boss) throw new Error("Boss not found");
    const url = await generateSceneImage(bossBackgroundPrompt(subject || boss.description || boss.name));
    await db.query(`UPDATE boss_event SET background_url = $2 WHERE id = $1`, [bossId, url]);
    return url;
}

export async function updateDraftBoss(bossId, { name, description, maxHp, rewardsText, ticketDivisor }) {
    const sets = [];
    const params = [bossId];
    const add = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
    if (name !== undefined) add("name", String(name).slice(0, 80));
    if (description !== undefined) add("description", description ? String(description).slice(0, 600) : null);
    if (rewardsText !== undefined) add("rewards_text", rewardsText ? String(rewardsText).slice(0, 400) : null);
    if (maxHp !== undefined) { const hp = Math.max(100, Math.floor(Number(maxHp) || 10000)); add("max_hp", hp); add("hp", hp); }
    if (ticketDivisor !== undefined) add("ticket_divisor", Math.max(1, Math.floor(Number(ticketDivisor) || 100)));
    if (!sets.length) return db.queryOne(`SELECT * FROM boss_event WHERE id = $1`, [bossId]);
    return db.queryOne(`UPDATE boss_event SET ${sets.join(", ")} WHERE id = $1 AND status = 'draft' RETURNING *`, params);
}

// Release a draft: ends any current live boss, goes live for `days`. Broadcasts everywhere unless notify=false.
export async function releaseBoss(bossId, { days = 7, notify = true } = {}) {
    const d = Math.max(1, Math.floor(Number(days) || 7));
    await db.query(`UPDATE boss_event SET status = 'ended' WHERE status = 'live' AND id <> $1`, [bossId]).catch(() => {});
    const boss = await db.queryOne(
        `UPDATE boss_event SET status = 'live', started_at = NOW(), ends_at = NOW() + ($2::int || ' days')::interval, defeated_at = NULL
          WHERE id = $1 RETURNING *`,
        [bossId, d]
    );
    if (!boss) throw new Error("Boss not found");
    if (notify) await broadcastBoss(boss).catch(() => {});
    return boss;
}

// Set (or clear) the boss's raffle prize — a Square catalog item (name + image). Pass null-ish to clear.
export async function setBossPrize(bossId, { name, imageUrl, squareId } = {}) {
    const boss = await db.queryOne(`SELECT id FROM boss_event WHERE id = $1`, [bossId]);
    if (!boss) throw new Error("Boss not found");
    await db.query(
        `UPDATE boss_event SET prize_name = $2, prize_image_url = $3, prize_square_id = $4 WHERE id = $1`,
        [bossId, name ? String(name).slice(0, 200) : null, imageUrl || null, squareId || null]
    );
    return { ok: true, prizeName: name || null, prizeImageUrl: imageUrl || null };
}

export async function endBoss(bossId) {
    await db.query(`UPDATE boss_event SET status = 'ended' WHERE id = $1`, [bossId]);
    return { ok: true };
}

// Permanently delete a boss (drafts/ended only — a live boss must be ended first). Clears its hits too.
export async function deleteBoss(bossId) {
    const boss = await db.queryOne(`SELECT status FROM boss_event WHERE id = $1`, [bossId]);
    if (!boss) return { ok: true };
    if (boss.status === "live") throw new Error("End the boss before deleting it.");
    await db.query(`DELETE FROM boss_hit WHERE boss_id = $1`, [bossId]).catch(() => {});
    await db.query(`DELETE FROM boss_event WHERE id = $1`, [bossId]);
    return { ok: true };
}
