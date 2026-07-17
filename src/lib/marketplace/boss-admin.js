import "server-only";

import { put } from "@vercel/blob";

import { db } from "@/lib/db";
import { broadcastBoss } from "@/lib/marketplace/boss-broadcast.js";
import { projectBossHp } from "@/lib/marketplace/boss.js";
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
                    (SELECT COUNT(DISTINCT buyer_id)::int FROM boss_hit WHERE boss_id = b.id) AS fighters,
                    (SELECT COALESCE(display_name, alias, 'Member') FROM mkt_buyer WHERE id = b.winner_buyer_id) AS winner_label
               FROM boss_event b ORDER BY b.started_at DESC LIMIT 20`
        )
        .catch(() => []);
}

export async function createDraftBoss({ name, description, maxHp, rewardsText, ticketDivisor }) {
    // No HP given → auto-size to the current pack (count + levels) for a ~1-week fight. Explicit value wins.
    const explicit = Number(maxHp);
    const hp = explicit > 0 ? Math.max(100, Math.floor(explicit)) : (await projectBossHp({})).hp;
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

// A RANDOM, surprising battle-stage environment — deliberately NOT derived from the boss (feeding the
// creature's description in made the model redraw the boss into the scene). Each call picks a fresh biome.
const BOSS_BG_SETTINGS = [
    "a vast bioluminescent crystal cavern with glowing blue and violet crystals",
    "an ancient overgrown jungle temple reclaimed by vines and moss",
    "a frozen glacier canyon of pale blue ice and drifting snow",
    "a volcanic obsidian wasteland with rivers of molten lava",
    "a misty haunted graveyard under a full moon",
    "a sunken coral ruin deep beneath the ocean, shafts of light above",
    "a floating sky island of grassy cliffs above a sea of clouds",
    "a golden desert of towering dunes and half-buried ruined pillars",
    "a giant mushroom forest with towering glowing fungi",
    "a stormy cliffside overlooking a raging sea, rain and lightning",
    "an abandoned brass clockwork factory with huge gears",
    "a lava-lit dwarven forge hall carved into the mountain",
    "a moonlit bamboo forest with drifting fireflies",
    "a shattered battlefield strewn with broken banners and swords",
    "an enchanted autumn woodland of red and gold falling leaves",
    "a shimmering ice palace interior of frozen columns",
    "a foggy swamp of twisted roots and hanging moss",
    "a red-rock canyon of stone arches glowing at sunset",
    "a starlit celestial void with floating rocks and nebulae",
    "a ruined gothic cathedral open to a stormy sky",
    "a windswept snowy tundra beneath a rippling aurora",
    "a pirate cove of shipwrecks and tide pools at dusk",
    "a serene cherry-blossom shrine with a wooden bridge",
    "a crackling thundercloud realm high above the world",
    "an underground fungal cavern beside a still glowing lake",
    "a scorched crater of black rock and drifting embers",
    "a jade-green rainforest beside a thundering waterfall",
    "a snowy pine forest at dusk with distant mountains",
    "a sunbaked colosseum arena of cracked sandstone",
    "a neon-lit rain-slicked cyberpunk alley at night",
];

// `subject` is intentionally ignored (see note above) — the background must not reproduce the boss.
export function bossBackgroundPrompt() {
    const scene = BOSS_BG_SETTINGS[Math.floor(Math.random() * BOSS_BG_SETTINGS.length)];
    return `${scene}. Epic 2D video-game battle stage background, wide side-scrolling environment, dramatic atmospheric lighting, bold stylized illustration, clean confident outlines, cel-shaded flat vibrant colors, polished RPG game-art style, richly detailed scenery. Landscape and environment ONLY — absolutely no monsters, no dragons, no creatures, no people, no characters. Leave a clear flat foreground ground for characters to stand on, no text, no logo, no watermark, no UI, no border.`;
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
    const url = await generateSceneImage(bossBackgroundPrompt());
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

// Owner hands the raffle prize to the winner — mark it claimed so it drops off the "to hand out" list.
export async function claimBossPrize(bossId) {
    await db.query(`UPDATE boss_event SET prize_claimed_at = NOW() WHERE id = $1`, [bossId]);
    return { ok: true };
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
