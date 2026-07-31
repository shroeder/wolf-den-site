import "server-only";


import { db } from "@/lib/db";
import { broadcastBoss } from "@/lib/marketplace/boss-broadcast.js";
import { pickWeakness } from "@/lib/marketplace/boss-weakness.js";
import { projectBossHp } from "@/lib/marketplace/boss.js";
import { itemById } from "@/lib/marketplace/items.js";
import { generateImage, generateSceneImage, storeImage } from "@/lib/marketplace/openai-image.js";

// Store a finished PNG (base64, generated directly on the phone) as the boss art — fast, no OpenAI wait.
export async function setBossArt(bossId, base64) {
    const boss = await db.queryOne(`SELECT id FROM boss_event WHERE id = $1`, [bossId]);
    if (!boss) throw new Error("Boss not found");
    const clean = String(base64 || "").replace(/^data:image\/\w+;base64,/, "").trim();
    const buffer = Buffer.from(clean, "base64");
    if (!buffer.length) throw new Error("Empty image");
    // The battle scene draws the boss up to ~310px tall and the final-blow scene larger still, so it gets a
    // roomier cap than an inventory sprite.
    const blob = { url: await storeImage(buffer, "marketplace/boss", { maxWidth: 1280 }) };
    await db.query(`UPDATE boss_event SET image_url = $2 WHERE id = $1`, [bossId, blob.url]);
    return blob.url;
}

// Admin-only weekly-boss management: draft -> generate art (retry) -> release (broadcast) -> live -> ended.

// Full admin recap for a (usually dead) boss: how long it took, who's owed the physical prize + whether
// they've claimed it, the damage leaderboard with tickets, and the per-member reward log (chests/gear/etc.)
// captured from the defeat gift records.
export async function getBossRecapAdmin(bossId) {
    const boss = await db.queryOne(`SELECT * FROM boss_event WHERE id = $1`, [bossId]).catch(() => null);
    if (!boss) return null;
    const divisor = Math.max(1, boss.ticket_divisor || 100);
    const rows = await db
        .query(
            `SELECT b.id, b.display_name, b.alias, b.email, SUM(h.damage)::int AS dmg,
                    COUNT(*) FILTER (WHERE h.kind = 'manual')::int AS hits
               FROM boss_hit h JOIN mkt_buyer b ON b.id = h.buyer_id
              WHERE h.boss_id = $1 GROUP BY b.id HAVING SUM(h.damage) > 0 ORDER BY dmg DESC`,
            [bossId]
        )
        .catch(() => []);
    const totalDamage = rows.reduce((s, r) => s + (r.dmg || 0), 0);
    const leaderboard = rows.map((r, i) => ({
        rank: i + 1, name: r.display_name || r.alias || "Member", alias: r.alias || null,
        dmg: r.dmg, tickets: Math.floor(r.dmg / divisor), hits: r.hits,
    }));

    let winner = null;
    if (boss.winner_buyer_id) {
        const w = await db.queryOne(`SELECT display_name, alias, email FROM mkt_buyer WHERE id = $1`, [boss.winner_buyer_id]).catch(() => null);
        const claimer = boss.prize_claimed_by ? await db.queryOne(`SELECT display_name, alias FROM mkt_buyer WHERE id = $1`, [boss.prize_claimed_by]).catch(() => null) : null;
        winner = {
            buyerId: boss.winner_buyer_id, name: w?.display_name || w?.alias || "Member", alias: w?.alias || null, email: w?.email || null,
            tickets: boss.winner_tickets || 0, claimedAt: boss.prize_claimed_at || null, claimedBy: claimer?.display_name || claimer?.alias || null,
        };
    }
    const top = rows[0] || null;
    const chaseItem = boss.chase_item_id && itemById(boss.chase_item_id) ? itemById(boss.chase_item_id).name : null;

    // Per-member reward log — pulled from the defeat gift records written at finalize (±5 min of defeat).
    const rewards = boss.defeated_at
        ? await db
              .query(
                  `SELECT b.display_name, b.alias, g.body
                     FROM mkt_pending_gift g JOIN mkt_buyer b ON b.id = g.buyer_id
                    WHERE g.kind = 'boss' AND g.created_at BETWEEN $2::timestamptz - interval '5 min' AND $2::timestamptz + interval '5 min'
                    ORDER BY g.created_at`,
                  [bossId, boss.defeated_at]
              )
              .then((r) => r.map((x) => ({ member: x.display_name || x.alias || "Member", body: x.body })))
              .catch(() => [])
        : [];

    const daysToKill = boss.started_at && boss.defeated_at ? Math.round(((new Date(boss.defeated_at) - new Date(boss.started_at)) / 86400000) * 10) / 10 : null;

    return {
        boss: {
            id: boss.id, name: boss.name, status: boss.status, maxHp: boss.max_hp,
            startedAt: boss.started_at, defeatedAt: boss.defeated_at,
            prizeName: boss.prize_name || null, chaseItem,
        },
        daysToKill, totalDamage, fighters: rows.length,
        winner, topDealer: top ? { name: top.display_name || top.alias || "Member", dmg: top.dmg, chaseItem } : null,
        leaderboard, rewards,
    };
}

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
        `INSERT INTO boss_event (name, icon, tier, max_hp, hp, status, description, rewards_text, ticket_divisor, weakness)
         VALUES ($1, 'dragon', 1, $2, $2, 'draft', $3, $4, $5, $6) RETURNING *`,
        [String(name || "Boss").slice(0, 80), hp, description ? String(description).slice(0, 600) : null, rewardsText ? String(rewardsText).slice(0, 400) : null, div, pickWeakness()]
    );
}

// Generate boss art from a description (call again to retry). Wraps the prompt for a consistent look.
export async function generateBossArt(bossId, prompt) {
    const boss = await db.queryOne(`SELECT id FROM boss_event WHERE id = $1`, [bossId]);
    if (!boss) throw new Error("Boss not found");
    // The FACE clause is not decoration. Without it the model kept burying the head in its own effects — the
    // storm boss came out as a purple mass with lightning where its face should be and no eyes at all, which
    // reads as an unfinished blob rather than a creature you're meant to fear. A boss has to be able to look
    // back at you, so the head, the eyes and an unobstructed face are stated as hard requirements and the
    // elemental effects are explicitly pushed off the face and onto the body.
    const full = `${String(prompt || "a fearsome dragon").slice(0, 500)}. The creature is facing to the LEFT — its body and head turned toward the left side of the frame, toward its attackers. CLEARLY VISIBLE HEAD AND FACE with TWO distinct expressive EYES, menacing readable facial features, face fully unobscured — any smoke, lightning, fire, magic or energy effects trail off the BODY and never cover the head or eyes. 2D video-game boss art, bold stylized illustration, clean confident outlines, cel-shaded flat vibrant colors, dramatic dynamic action pose, strong readable silhouette, centered full-body character splash art, polished RPG game-art style, clean coherent anatomy, no extra or malformed limbs, no visual artifacts, transparent background, no text, no logo, no watermark, no border.`;
    const url = await generateImage(full, { size: "1024x1024", pathPrefix: "marketplace/boss", meta: { origin: "admin", label: "Boss sprite" } });
    await db.query(`UPDATE boss_event SET image_url = $2 WHERE id = $1`, [bossId, url]);
    return url;
}

// Auto-heal a boss's art: generate whatever's missing (portrait and/or background). Used by the boss-art cron
// so an AUTO-SPAWNED boss (activateNextBoss creates the row with no art when no admin draft is queued) gets a
// real portrait + stage within a cron cycle instead of showing the fallback silhouette. Best-effort per image;
// a failure on one doesn't block the other, and it's a no-op once both are present (so it costs nothing to poll).
export async function ensureBossArt(bossId) {
    const boss = await db.queryOne(`SELECT id, name, description, image_url, background_url FROM boss_event WHERE id = $1`, [bossId]).catch(() => null);
    if (!boss) return { skipped: "not_found" };
    // Failures used to vanish into `.catch(() => {})`, so a boss that never got art reported the same clean
    // result as one that didn't need any. The live boss "Molgrath the Devourer" sat with no portrait and no
    // background through repeated cron runs and nothing anywhere said why. Errors are returned now.
    const did = { portrait: false, background: false, errors: [] };
    if (!boss.image_url) {
        const prompt = `${boss.name || "a fearsome boss"}. ${boss.description || "a monstrous fantasy boss creature"}`;
        await generateBossArt(bossId, prompt)
            .then(() => { did.portrait = true; })
            .catch((e) => { did.errors.push(`portrait: ${e?.message || e}`); });
    }
    if (!boss.background_url) {
        await generateBossBackground(bossId)
            .then(() => { did.background = true; })
            .catch((e) => { did.errors.push(`background: ${e?.message || e}`); });
    }
    if (!did.errors.length) delete did.errors;
    return did;
}

// Generate art for any LIVE boss that's missing it (the cron entrypoint). Returns what it touched.
export async function ensureLiveBossArt() {
    const boss = await db.queryOne(`SELECT id, name, image_url, background_url FROM boss_event WHERE status = 'live' AND defeated_at IS NULL ORDER BY started_at DESC LIMIT 1`).catch(() => null);
    if (!boss) return { skipped: "no_live_boss" };
    if (boss.image_url && boss.background_url) return { skipped: "already_has_art", boss: boss.name };
    const did = await ensureBossArt(boss.id);
    return { boss: boss.name, ...did };
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
    const blob = { url: await storeImage(buffer, "marketplace/boss-bg", { maxWidth: 1600 }) };
    await db.query(`UPDATE boss_event SET background_url = $2 WHERE id = $1`, [bossId, blob.url]);
    return blob.url;
}

// Server-side background generation (web fallback for the phone flow).
export async function generateBossBackground(bossId, subject) {
    const boss = await db.queryOne(`SELECT id, name, description FROM boss_event WHERE id = $1`, [bossId]);
    if (!boss) throw new Error("Boss not found");
    const url = await generateSceneImage(bossBackgroundPrompt(), { meta: { origin: "admin", label: "Boss background" } });
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

// Set (or clear) the hand-picked IN-GAME chase item awarded to the #1 damage dealer. Pass a valid item
// id, or null-ish to clear. (Legacy single-item setter — still supported; also mirrors into reward_item_ids.)
export async function setBossChaseItem(bossId, itemId) {
    const boss = await db.queryOne(`SELECT id FROM boss_event WHERE id = $1`, [bossId]);
    if (!boss) throw new Error("Boss not found");
    const id = itemId && itemById(itemId) ? itemId : null;
    await db.query(`UPDATE boss_event SET chase_item_id = $2, reward_item_ids = $3::jsonb WHERE id = $1`, [bossId, id, JSON.stringify(id ? [id] : [])]);
    return { ok: true, chaseItemId: id, chaseItemName: id ? itemById(id).name : null };
}

// Set the LIST of in-game reward items for a boss (0+ ids). On the kill each drops to a weighted-random
// participant (top dealers get a modest edge, never guaranteed). Invalid ids are dropped.
export async function setBossRewardItems(bossId, itemIds) {
    const boss = await db.queryOne(`SELECT id FROM boss_event WHERE id = $1`, [bossId]);
    if (!boss) throw new Error("Boss not found");
    const ids = (Array.isArray(itemIds) ? itemIds : []).map((x) => String(x)).filter((x) => itemById(x));
    // Keep chase_item_id pointed at the first (back-compat for anything still reading it).
    await db.query(`UPDATE boss_event SET reward_item_ids = $2::jsonb, chase_item_id = $3 WHERE id = $1`, [bossId, JSON.stringify(ids), ids[0] || null]);
    return { ok: true, rewardItemIds: ids, items: ids.map((id) => ({ id, name: itemById(id).name, rarity: itemById(id).rarity })) };
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
