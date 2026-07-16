import "server-only";

import { put } from "@vercel/blob";

import { db } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/settings.js";
import { editImage } from "@/lib/marketplace/openai-image.js";
import { renderAvatarPng } from "@/lib/marketplace/avatar-render.js";
import { avatarConfigToQuery, DEFAULT_AVATAR } from "@/lib/marketplace/avatar-options.js";

// The ONE shared default sprite used for members who haven't built their own avatar — so we don't spend
// AI generating a unique sprite for everyone. Generated once from the default avatar, stored in settings.
const DEFAULT_SPRITE_KEY = "default_sprite_url";
export const DEFAULT_SPRITE_AVATAR_PATH = `/api/marketplace/avatar?${avatarConfigToQuery(DEFAULT_AVATAR)}&format=png&v=2`;
export const getDefaultSpriteUrl = () => getSetting(DEFAULT_SPRITE_KEY);

// Turns a member's built DiceBear avatar into a 2D game-art character ("sprite") via OpenAI, in the same
// style as the boss art. The cron job (server-side) trickles a few per day; the admin app can also
// generate them directly on the phone (like the boss art) and upload the finished PNG.

// Prompt for the EDITS endpoint: the member's avatar PNG is the reference (image-to-image), so identity
// comes from the picture — we just tell the model to redraw it as a full-body game character. Style tokens
// mirror the boss art (BossArt.kt) so sprites and bosses read as the same game universe. (Config arg kept
// for API compatibility; the reference image carries the look, not text.)
export function buildSpritePrompt() {
    return `Redraw this cartoon avatar as a full-body 2D video-game hero character. The reference shows only the head and shoulders at the top of the frame — invent and draw the COMPLETE figure head to toe (torso, arms, hands, legs and feet) filling the frame below, in a confident heroic standing pose, keeping the same face, skin tone, hairstyle and hair color, facial hair, glasses, and clothing colors/style as the reference. 2D video-game character art, bold stylized illustration, clean confident outlines, cel-shaded flat vibrant colors, strong readable silhouette, centered full-body character splash art, polished RPG game-art style, clean coherent anatomy, no extra or malformed limbs, no visual artifacts, transparent background, no text, no logo, no watermark, no border.`;
}

// The prompt for the shared default sprite (built from the default avatar). Sent to the phone.
export const DEFAULT_SPRITE_PROMPT = buildSpritePrompt(DEFAULT_AVATAR);

// Buyers whose sprite is missing or stale (avatar changed since it was last drawn). Oldest/never first.
export function pendingSpriteIds(limit = 5) {
    return db
        .query(
            `SELECT id FROM mkt_buyer
              WHERE avatar_config IS NOT NULL
                AND (avatar_sprite_url IS NULL OR (avatar_updated_at IS NOT NULL AND avatar_updated_at > avatar_sprite_at))
              ORDER BY avatar_sprite_at NULLS FIRST, avatar_updated_at DESC NULLS LAST
              LIMIT $1`,
            [Math.max(1, Math.min(50, Math.floor(Number(limit) || 5)))]
        )
        .then((rows) => rows.map((r) => r.id))
        .catch(() => []);
}

// Everything for the admin preview screen (public label only — never real names).
export async function listSpritesAdmin() {
    const rows = await db
        .query(
            `SELECT id, display_name, alias, avatar_config, avatar_sprite_url, avatar_sprite_at, avatar_updated_at
               FROM mkt_buyer
              WHERE avatar_config IS NOT NULL
              ORDER BY (avatar_sprite_url IS NULL) DESC, avatar_updated_at DESC NULLS LAST
              LIMIT 200`
        )
        .catch(() => []);
    return rows.map((r) => ({
        buyerId: r.id,
        label: r.display_name || (r.alias ? `@${r.alias}` : "Member"),
        spriteUrl: r.avatar_sprite_url || null,
        // Reference PNG the phone feeds to the OpenAI edits endpoint (rasterized DiceBear avatar, bust
        // placed at the top with room below). v bumps when the framing changes (immutable-cached URL).
        avatarPath: `/api/marketplace/avatar?${avatarConfigToQuery(r.avatar_config)}&format=png&v=2`,
        prompt: buildSpritePrompt(r.avatar_config),
        pending: !r.avatar_sprite_url || (r.avatar_updated_at && r.avatar_sprite_at && new Date(r.avatar_updated_at) > new Date(r.avatar_sprite_at)) || !r.avatar_sprite_at,
    }));
}

// Store a finished PNG (base64, generated on the phone) as a member's sprite. Fast, no OpenAI wait.
export async function setBuyerSprite(buyerId, base64) {
    const row = await db.queryOne(`SELECT avatar_config FROM mkt_buyer WHERE id = $1`, [buyerId]);
    if (!row) throw new Error("Member not found");
    const clean = String(base64 || "").replace(/^data:image\/\w+;base64,/, "").trim();
    const buffer = Buffer.from(clean, "base64");
    if (!buffer.length) throw new Error("Empty image");
    const blob = await put(`marketplace/sprite/${buyerId}-${Date.now()}.png`, buffer, { access: "public", contentType: "image/png" });
    await db.query(
        `UPDATE mkt_buyer SET avatar_sprite_url = $2, avatar_sprite_at = NOW(), avatar_sprite_prompt = $3 WHERE id = $1`,
        [buyerId, blob.url, buildSpritePrompt(row.avatar_config)]
    );
    return blob.url;
}

// Server-side generation (used by the cron job): rasterize the avatar, feed it to the edits endpoint so
// the sprite matches the member's avatar, then store the URL.
export async function generateBuyerSprite(buyerId) {
    const row = await db.queryOne(`SELECT avatar_config FROM mkt_buyer WHERE id = $1`, [buyerId]);
    if (!row || !row.avatar_config) throw new Error("No avatar to draw");
    const prompt = buildSpritePrompt(row.avatar_config);
    const png = await renderAvatarPng(row.avatar_config, 1024);
    const url = await editImage(png, prompt, { size: "1024x1024", pathPrefix: "marketplace/sprite" });
    await db.query(
        `UPDATE mkt_buyer SET avatar_sprite_url = $2, avatar_sprite_at = NOW(), avatar_sprite_prompt = $3 WHERE id = $1`,
        [buyerId, url, prompt]
    );
    return url;
}

// Store a finished PNG (base64, generated on the phone from the DEFAULT avatar) as the shared default
// sprite. Everyone without their own sprite falls back to this — one generation, not one per member.
export async function setDefaultSpriteFromImage(base64) {
    const clean = String(base64 || "").replace(/^data:image\/\w+;base64,/, "").trim();
    const buffer = Buffer.from(clean, "base64");
    if (!buffer.length) throw new Error("Empty image");
    const blob = await put(`marketplace/sprite/default-${Date.now()}.png`, buffer, { access: "public", contentType: "image/png" });
    await setSetting(DEFAULT_SPRITE_KEY, blob.url);
    return blob.url;
}

// Server-side: draw the default sprite from the default avatar (web fallback for the phone flow).
export async function generateDefaultSprite() {
    const prompt = buildSpritePrompt(DEFAULT_AVATAR);
    const png = await renderAvatarPng(DEFAULT_AVATAR, 1024);
    const url = await editImage(png, prompt, { size: "1024x1024", pathPrefix: "marketplace/sprite" });
    await setSetting(DEFAULT_SPRITE_KEY, url);
    return url;
}

// Cron entry point: draw up to `limit` pending sprites. Small batch = cost + time control.
export async function runAvatarSpriteJob(limit = 4) {
    const ids = await pendingSpriteIds(limit);
    let generated = 0;
    const errors = [];
    for (const id of ids) {
        try {
            await generateBuyerSprite(id);
            generated += 1;
        } catch (error) {
            errors.push({ buyerId: id, error: error?.message || String(error) });
        }
    }
    const remaining = (await pendingSpriteIds(50)).length;
    return { generated, attempted: ids.length, remaining, errors };
}
