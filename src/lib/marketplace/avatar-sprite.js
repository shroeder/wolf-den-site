import "server-only";

import { put } from "@vercel/blob";

import { db } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/settings.js";
import { editImage } from "@/lib/marketplace/openai-image.js";
import { getEquippedGearPhrase, getEquippedGearPhrasesForMembers } from "@/lib/marketplace/inventory.js";
import { renderAvatarPng } from "@/lib/marketplace/avatar-render.js";
import { avatarConfigToQuery, DEFAULT_AVATAR, HAT_TOPS, humanizeAvatarLabel, sanitizeAvatarConfig } from "@/lib/marketplace/avatar-options.js";

// The ONE shared default sprite used for members who haven't built their own avatar — so we don't spend
// AI generating a unique sprite for everyone. Generated once from the default avatar, stored in settings.
const DEFAULT_SPRITE_KEY = "default_sprite_url";
export const DEFAULT_SPRITE_AVATAR_PATH = `/api/marketplace/avatar?${avatarConfigToQuery(DEFAULT_AVATAR)}&format=png&v=2`;
export const getDefaultSpriteUrl = () => getSetting(DEFAULT_SPRITE_KEY);

// Turns a member's built DiceBear avatar into a 2D game-art character ("sprite") via OpenAI, in the same
// style as the boss art. The cron job (server-side) trickles a few per day; the admin app can also
// generate them directly on the phone (like the boss art) and upload the finished PNG.

const SKIN_NAMES = { ffdbb4: "pale", edb98a: "fair", fd9841: "tan", f8d25c: "golden", d08b5b: "brown", ae5d29: "dark brown", 614335: "deep brown" };
const HAIR_NAMES = { "2c1b18": "black", "4a312c": "dark brown", "724133": "brown", a55728: "auburn", b58143: "light brown", d6b370: "blonde", c93305: "fiery red", e8e1e1: "platinum", ecdcbf: "pale blonde", f59797: "pink" };
const CLOTH_NAMES = { "262e33": "black", "3c4f5c": "slate", "25557c": "navy", "5199e4": "blue", "65c9ff": "sky-blue", b1e2ff: "pale blue", "929598": "gray", e6e6e6: "light gray", ffffff: "white", a7ffc4: "mint green", ffffb1: "pale yellow", ffafb9: "pink", ff488e: "hot pink", ff5c5c: "red" };

const colorName = (map, hex) => map[String(hex || "").toLowerCase()] || "colored";

// Build a plain-English description of the avatar for the art prompt.
export function describeAvatar(rawConfig) {
    const c = sanitizeAvatarConfig(rawConfig);
    const parts = [];
    parts.push(`${colorName(SKIN_NAMES, c.skinColor)} skin`);

    if (c.top === "bald") {
        parts.push("bald head");
    } else if (HAT_TOPS.includes(c.top)) {
        parts.push(`wearing a ${humanizeAvatarLabel(c.top).toLowerCase()}`);
    } else {
        parts.push(`${colorName(HAIR_NAMES, c.hairColor)} ${humanizeAvatarLabel(c.top).toLowerCase()} hair`);
    }

    if (c.facialHair && c.facialHair !== "none") {
        parts.push(`a ${colorName(HAIR_NAMES, c.facialHairColor)} ${humanizeAvatarLabel(c.facialHair).toLowerCase()}`);
    }
    if (c.accessories && c.accessories !== "none") {
        parts.push(c.accessories === "eyepatch" ? "an eyepatch" : `${humanizeAvatarLabel(c.accessories).toLowerCase()} glasses`);
    }

    const clothColor = colorName(CLOTH_NAMES, c.clothesColor);
    if (c.clothing === "graphicShirt") {
        parts.push(`a ${clothColor} graphic t-shirt with a ${humanizeAvatarLabel(c.clothingGraphic).toLowerCase()} design`);
    } else {
        parts.push(`a ${clothColor} ${humanizeAvatarLabel(c.clothing).toLowerCase()}`);
    }
    return parts.join(", ");
}

// Prompt for the EDITS endpoint: the member's avatar PNG is the reference, so tell the model to keep its
// identity and redraw it as a full-body game character. The style tokens below are kept IDENTICAL to the
// boss art (BossArt.kt) — only "boss art / action pose" is swapped for "character / heroic pose" — so
// sprites and bosses look like the same game universe.
export function buildSpritePrompt(config, gear = "") {
    return `Redraw this cartoon avatar as a full-body 2D video-game hero character. The reference shows only the head and shoulders at the top of the frame — invent and draw the COMPLETE figure head to toe (torso, arms, hands, legs and feet) filling the frame below, in a confident heroic standing pose shown from a three-quarter view facing to the LEFT (the character's body turned toward the left side of the frame), keeping the same face, skin tone, hairstyle and hair color, facial hair, glasses, and clothing colors/style as the reference (${describeAvatar(config)}). ${gear ? gear + " " : ""}2D video-game character art, bold stylized illustration, clean confident outlines, cel-shaded flat vibrant colors, strong readable silhouette, centered full-body character splash art, polished RPG game-art style, clean coherent anatomy, no extra or malformed limbs, no visual artifacts, transparent background, no text, no logo, no watermark, no border. CRITICAL: the character must be oriented facing and looking toward the LEFT side of the image (a left-facing three-quarter view) — NOT facing forward and NOT facing right.`;
}

// The prompt for the shared default sprite (built from the default avatar). Sent to the phone.
export const DEFAULT_SPRITE_PROMPT = buildSpritePrompt(DEFAULT_AVATAR);

// Buyers whose sprite is missing or stale (avatar changed since it was last drawn). Oldest/never first.
export function pendingSpriteIds(limit = 5) {
    return db
        .query(
            `SELECT id FROM mkt_buyer
              WHERE avatar_config IS NOT NULL
                AND avatar_updated_at IS NOT NULL
                AND (avatar_sprite_url IS NULL
                     OR avatar_updated_at > avatar_sprite_at
                     OR (equipment_updated_at IS NOT NULL AND equipment_updated_at > avatar_sprite_at))
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
    // Gear per member (one query) so the on-phone regenerate draws their equipment too — matching the cron.
    const gearMap = await getEquippedGearPhrasesForMembers(rows.map((r) => r.id)).catch(() => new Map());
    return rows.map((r) => ({
        buyerId: r.id,
        label: r.display_name || (r.alias ? `@${r.alias}` : "Member"),
        spriteUrl: r.avatar_sprite_url || null,
        // Reference PNG the phone feeds to the OpenAI edits endpoint (rasterized DiceBear avatar, bust
        // placed at the top with room below). v bumps when the framing changes (immutable-cached URL).
        avatarPath: `/api/marketplace/avatar?${avatarConfigToQuery(r.avatar_config)}&format=png&v=2`,
        prompt: buildSpritePrompt(r.avatar_config, gearMap.get(r.id) || ""),
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
    const gear = await getEquippedGearPhrase(buyerId).catch(() => "");
    const prompt = buildSpritePrompt(row.avatar_config, gear);
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
