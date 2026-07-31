import "server-only";


import { db } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/settings.js";
import { editImage, detectFacing, storeImage } from "@/lib/marketplace/openai-image.js";
import { getEquippedGearPhrase, getEquippedGearPhrasesForMembers } from "@/lib/marketplace/inventory.js";
import { renderAvatarPng } from "@/lib/marketplace/avatar-render.js";
import { avatarConfigToQuery, DEFAULT_AVATAR, HAT_TOPS, humanizeAvatarLabel, sanitizeAvatarConfig } from "@/lib/marketplace/avatar-options.js";

// The ONE shared default sprite used for members who haven't built their own avatar — so we don't spend
// AI generating a unique sprite for everyone. Generated once from the default avatar, stored in settings.
const DEFAULT_SPRITE_KEY = "default_sprite_url";

// Give up auto-retrying a member's sprite after this many consecutive failures (bad avatar config,
// content-policy rejection, etc.) — it stays visible in the admin list with its error for a manual reroll,
// but stops burning image-gen budget every tick. A real avatar/gear change resets the counter.
const MAX_SPRITE_ATTEMPTS = 6;

// Cost cap: a member's sprite is redrawn AT MOST once per this many hours, no matter how many times they
// change their avatar/gear in between. Changes made inside the window are coalesced into one redraw once it
// elapses (the sprite draws whatever is equipped at that moment). New members (no sprite yet) skip the
// cooldown so their first sprite appears promptly; failure retries also skip it (they never set a success
// timestamp) and are instead bounded by MAX_SPRITE_ATTEMPTS. Ceiling on image cost ≈ roster size / day.
const REGEN_COOLDOWN_HOURS = 24;
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
    return `Redraw this cartoon avatar as a full-body 2D video-game hero character. The reference shows only the head and shoulders at the top of the frame — invent and draw the COMPLETE figure head to toe (torso, arms, hands, legs and feet) filling the frame below, in a confident heroic standing pose shown from a three-quarter view facing to the RIGHT (the character's body turned toward the right side of the frame), keeping the same face, skin tone, hairstyle and hair color, facial hair, glasses, and clothing colors/style as the reference (${describeAvatar(config)}). ${gear ? gear + " " : ""}2D video-game character art, bold stylized illustration, clean confident outlines, cel-shaded flat vibrant colors, strong readable silhouette, centered full-body character splash art, polished RPG game-art style, clean coherent anatomy, no extra or malformed limbs, no visual artifacts, transparent background, no text, no logo, no watermark, no border. CRITICAL: the character must be oriented facing and looking toward the RIGHT side of the image (a right-facing three-quarter view) — NOT facing forward and NOT facing left.`;
}

// The prompt for the shared default sprite (built from the default avatar). Sent to the phone.
export const DEFAULT_SPRITE_PROMPT = buildSpritePrompt(DEFAULT_AVATAR);

// Buyers whose sprite should be (re)drawn now. Redraw when the avatar's APPEARANCE or equipped GEAR changed
// since the last draw (the art prompt includes equipped gear) — BUT never more than once per
// REGEN_COOLDOWN_HOURS per member, so a serial gear-swapper can't run up the image bill. Members with no
// sprite yet skip the cooldown (draw the first one promptly). Oldest/never first. Pass a limit to cap the
// batch; omit it to return every eligible member.
export function pendingSpriteIds(limit = null) {
    const capped = Number.isFinite(Number(limit)) && Number(limit) > 0;
    return db
        .query(
            `SELECT id FROM mkt_buyer
              WHERE avatar_config IS NOT NULL
                AND avatar_sprite_attempts < ${MAX_SPRITE_ATTEMPTS}
                -- NEVER draw for an untouched avatar. A member who has not opened the customiser is still on
                -- the stock config, so a bespoke draw produces the stock character — at ~$0.046 a head, once
                -- per member. Half the roster (36 of 72) had one drawn for them this way. That is precisely
                -- what the shared default sprite exists for: they render it until they change something,
                -- which stamps avatar_updated_at and makes them eligible here for the first time.
                AND avatar_updated_at IS NOT NULL
                AND (
                    -- Needs a first sprite…
                    avatar_sprite_url IS NULL
                    -- …or the avatar / gear changed since the sprite was drawn (regen, off cooldown).
                    OR (
                        (avatar_updated_at > avatar_sprite_at OR equipment_updated_at > avatar_sprite_at)
                        AND (avatar_sprite_at IS NULL OR avatar_sprite_at < NOW() - INTERVAL '${REGEN_COOLDOWN_HOURS} hours')
                    )
                )
              ORDER BY avatar_sprite_at NULLS FIRST, avatar_sprite_attempts ASC, avatar_updated_at DESC NULLS LAST
              ${capped ? "LIMIT $1" : ""}`,
            capped ? [Math.floor(Number(limit))] : []
        )
        .then((rows) => rows.map((r) => r.id))
        .catch(() => []);
}

// Everything for the admin preview screen (public label only — never real names).
export async function listSpritesAdmin() {
    const rows = await db
        .query(
            `SELECT id, display_name, alias, avatar_config, avatar_sprite_url, avatar_sprite_at, avatar_updated_at,
                    equipment_updated_at, avatar_sprite_flip, avatar_facing_checked_at,
                    avatar_sprite_attempts, avatar_sprite_error
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
        // flip mirrors a backwards sprite at render time; facingChecked = the AI pass has already looked.
        flip: r.avatar_sprite_flip === true,
        facingChecked: Boolean(r.avatar_facing_checked_at),
        // Generation health: attempts so far, the last error, and whether it's given up auto-retrying.
        attempts: Number(r.avatar_sprite_attempts) || 0,
        error: r.avatar_sprite_error || null,
        stuck: (Number(r.avatar_sprite_attempts) || 0) >= MAX_SPRITE_ATTEMPTS,
        // Reference PNG the phone feeds to the OpenAI edits endpoint (rasterized DiceBear avatar, bust
        // placed at the top with room below). v bumps when the framing changes (immutable-cached URL).
        avatarPath: `/api/marketplace/avatar?${avatarConfigToQuery(r.avatar_config)}&format=png&v=2`,
        prompt: buildSpritePrompt(r.avatar_config, gearMap.get(r.id) || ""),
        // Pending when there's no sprite yet, or the avatar appearance OR equipped gear changed since it was drawn.
        pending:
            !r.avatar_sprite_url ||
            !r.avatar_sprite_at ||
            (r.avatar_updated_at && r.avatar_sprite_at && new Date(r.avatar_updated_at) > new Date(r.avatar_sprite_at)) ||
            (r.equipment_updated_at && r.avatar_sprite_at && new Date(r.equipment_updated_at) > new Date(r.avatar_sprite_at)),
    }));
}

// Owner override: hand-set a member sprite's flip flag (marks it checked so the AI pass won't overwrite it).
export async function setBuyerSpriteFlip(buyerId, flip) {
    await db
        .query(`UPDATE mkt_buyer SET avatar_sprite_flip = $2, avatar_facing_checked_at = NOW() WHERE id = $1`, [buyerId, Boolean(flip)])
        .catch(() => {});
    return { ok: true };
}

// AI read-pass: for members whose sprite hasn't been facing-checked, look at the stored art and set
// flip=true if it faces LEFT (we want everyone facing right, toward the boss). Doesn't touch the image.
// Small batches; resumable via avatar_facing_checked_at. Same shape as the pet detect pass.
// Clear the facing-checked stamp so the (improved) AI read-pass re-audits sprites it already looked at —
// used after tuning the detector, or to re-check one member. Manual flips are also cleared for a full
// re-audit; pass a buyerId to scope it to one. Returns how many are now pending.
export async function resetSpriteFacingChecks({ buyerId = null } = {}) {
    if (buyerId) {
        await db.query(`UPDATE mkt_buyer SET avatar_facing_checked_at = NULL WHERE id = $1 AND avatar_sprite_url IS NOT NULL`, [buyerId]).catch(() => {});
    } else {
        await db.query(`UPDATE mkt_buyer SET avatar_facing_checked_at = NULL WHERE avatar_sprite_url IS NOT NULL`).catch(() => {});
    }
    const remaining = await db
        .queryOne(`SELECT COUNT(*)::int AS n FROM mkt_buyer WHERE avatar_facing_checked_at IS NULL AND avatar_sprite_url IS NOT NULL`)
        .catch(() => null);
    return { ok: true, pending: remaining?.n || 0 };
}

export async function detectBuyerSpriteFacings(limit = 6) {
    const rows = await db
        .query(
            `SELECT id, avatar_sprite_url FROM mkt_buyer
              WHERE avatar_facing_checked_at IS NULL AND avatar_sprite_url IS NOT NULL
              ORDER BY avatar_sprite_at ASC NULLS FIRST
              LIMIT $1`,
            [Math.max(1, Math.min(12, limit))]
        )
        .catch(() => []);
    const results = [];
    for (const r of rows) {
        let facing;
        try {
            facing = await detectFacing(r.avatar_sprite_url);
        } catch {
            // Infra failure (no key / fetch / timeout) — leave this sprite UNCHECKED so it's retried next
            // pass, instead of permanently recording a wrong "no-flip" for a transient error.
            continue;
        }
        const flip = facing === "left";
        await db
            .query(`UPDATE mkt_buyer SET avatar_sprite_flip = $2, avatar_facing_checked_at = NOW() WHERE id = $1`, [r.id, flip])
            .catch(() => {});
        results.push({ id: r.id, facing, flip });
    }
    const remaining = await db
        .queryOne(`SELECT COUNT(*)::int AS n FROM mkt_buyer WHERE avatar_facing_checked_at IS NULL AND avatar_sprite_url IS NOT NULL`)
        .catch(() => null);
    return { checked: results.length, flipped: results.filter((r) => r.flip).length, remaining: remaining?.n || 0, results };
}

// Store a finished PNG (base64, generated on the phone) as a member's sprite. Fast, no OpenAI wait.
export async function setBuyerSprite(buyerId, base64) {
    const row = await db.queryOne(`SELECT avatar_config FROM mkt_buyer WHERE id = $1`, [buyerId]);
    if (!row) throw new Error("Member not found");
    const clean = String(base64 || "").replace(/^data:image\/\w+;base64,/, "").trim();
    const buffer = Buffer.from(clean, "base64");
    if (!buffer.length) throw new Error("Empty image");
    const url = await storeImage(buffer, "marketplace/sprite");
    const blob = { url };
    // New art: clear the flip + facing-check so the AI read-pass re-verifies which way it faces.
    await db.query(
        `UPDATE mkt_buyer SET avatar_sprite_url = $2, avatar_sprite_at = NOW(), avatar_sprite_prompt = $3,
                              avatar_sprite_flip = FALSE, avatar_facing_checked_at = NULL,
                              avatar_sprite_attempts = 0, avatar_sprite_error = NULL WHERE id = $1`,
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
    // Redrawn whenever a member changes gear, so this fires far more often than once per member.
    const who = await db.queryOne(`SELECT alias, display_name FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const url = await editImage(png, prompt, {
        size: "1024x1024", pathPrefix: "marketplace/sprite",
        meta: { origin: "member", buyerId, buyerLabel: who?.alias ? `@${who.alias}` : (who?.display_name || null), label: "Hero sprite redraw" },
    });
    // New art: clear the flip + facing-check so the AI read-pass re-verifies which way it faces.
    await db.query(
        `UPDATE mkt_buyer SET avatar_sprite_url = $2, avatar_sprite_at = NOW(), avatar_sprite_prompt = $3,
                              avatar_sprite_flip = FALSE, avatar_facing_checked_at = NULL,
                              avatar_sprite_attempts = 0, avatar_sprite_error = NULL WHERE id = $1`,
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
    const url = await storeImage(buffer, "marketplace/sprite");
    const blob = { url };
    await setSetting(DEFAULT_SPRITE_KEY, blob.url);
    return blob.url;
}

// Server-side: draw the default sprite from the default avatar (web fallback for the phone flow).
export async function generateDefaultSprite() {
    const prompt = buildSpritePrompt(DEFAULT_AVATAR);
    const png = await renderAvatarPng(DEFAULT_AVATAR, 1024);
    const url = await editImage(png, prompt, { size: "1024x1024", pathPrefix: "marketplace/sprite", meta: { origin: "admin", label: "Default hero sprite" } });
    await setSetting(DEFAULT_SPRITE_KEY, url);
    return url;
}

// Cron entry point: draw a bounded batch of pending sprites (missing, appearance-changed, or gear-changed).
// There's no per-DAY cap — the job runs on a frequent schedule (see vercel.json), so any backlog drains
// across ticks and a failed tick simply retries on the next one. Each run stays small enough to finish well
// under the function timeout (no time-budget guesswork). Per-item failures are recorded so a poison avatar
// backs off after MAX_SPRITE_ATTEMPTS instead of blocking the batch forever.
export async function runAvatarSpriteJob({ batch = 8 } = {}) {
    const ids = await pendingSpriteIds(batch);
    let generated = 0;
    const errors = [];
    for (const id of ids) {
        try {
            await generateBuyerSprite(id);
            generated += 1;
        } catch (error) {
            const msg = error?.message || String(error);
            errors.push({ buyerId: id, error: msg });
            // Count the failure + record the reason so it backs off and the admin can see why.
            await db
                .query(
                    `UPDATE mkt_buyer
                        SET avatar_sprite_attempts = avatar_sprite_attempts + 1,
                            avatar_sprite_error = $2,
                            avatar_sprite_attempt_at = NOW()
                      WHERE id = $1`,
                    [id, msg.slice(0, 500)]
                )
                .catch(() => {});
        }
    }
    // Count both what's still drawable and what's stuck (hit the attempt cap), so the run is observable.
    const remaining = (await pendingSpriteIds()).length;
    const stuck = await db
        .queryOne(
            `SELECT COUNT(*)::int AS n FROM mkt_buyer
              WHERE avatar_config IS NOT NULL AND avatar_updated_at IS NOT NULL
                AND avatar_sprite_attempts >= ${MAX_SPRITE_ATTEMPTS}
                AND (avatar_sprite_url IS NULL OR avatar_updated_at > avatar_sprite_at OR equipment_updated_at > avatar_sprite_at)`
        )
        .catch(() => null);
    return { generated, attempted: ids.length, remaining, stuck: stuck?.n || 0, errors };
}
