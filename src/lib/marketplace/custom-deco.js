import "server-only";

import { db } from "@/lib/db";
import { generateImage, refineDecoPrompt, describeDecoFromName } from "@/lib/marketplace/openai-image.js";
import { syncEarnedBadges } from "@/lib/marketplace/badges.js";

// Player-made decorations: describe → the art pipeline draws ONE image → if you don't love it, add a short
// correction note and it redraws (the original description is preserved, your note nudges it) → pick one. Each
// finalized custom is granted into mkt_deco_owned as 'custom:<id>' + its sprite into mkt_deco_sprite, so it
// flows through the normal place/inspect system. Personal-only, never tradeable.
const MAX_ATTEMPTS = 4; // 1 initial + 3 correction redraws (each is a single image now, so cheaper than the old 3-up)
// House art style — matches our pets/heroes/items/boss/backgrounds (bold stylized illustration, cel-shaded flat
// vibrant colors, polished RPG game-art) so creations look part of the same game — but with NO outline enforced
// (decorations must be outline-free). Decoration-specific: a single object, isolated, no sticker halo (de-halo
// also strips any white border at render time).
const ART = "2D video-game decoration art, a single decorative object, bold stylized illustration, cel-shaded flat vibrant colors, soft clean edges with NO outline — absolutely no black outline, no dark contour lines, no ink outline around the subject — strong readable silhouette, polished RPG game-art style, centered and fully isolated on a transparent background, no white sticker border, no ground shadow, no text, no logo, no watermark, no border";
// Build the final image prompt. We first run the player's raw wording through a refinement pass (the image
// model takes terse descriptions too literally and misses the point) to get a vivid, concrete subject that
// captures their intent; on any failure we fall back to their literal words. The ART style suffix is always
// appended. Original description is the base; an optional correction note steers a redraw.
async function buildPrompt(desc, correction) {
    const note = String(correction || "").trim() ? ` Adjustments to apply: ${String(correction).trim().slice(0, 200)}.` : "";
    const refined = await refineDecoPrompt(String(desc || ""), String(correction || "")).catch(() => null);
    const subject = refined || `A ${String(desc || "").slice(0, 300)}.${note}`;
    return `${subject} ${ART}.`;
}

// Turn a raw OpenAI image error into a short, member-friendly reason (so a refused prompt explains itself
// instead of an opaque "hiccup"), while keeping the raw text for the admin console. This is a PAID action,
// so the #1 job when it fails is telling the member WHY.
function classifyGenError(err) {
    const raw = String(err?.message || err || "").slice(0, 300);
    const low = raw.toLowerCase();
    let reason;
    if (/moderation_blocked|content_policy|safety system|safety|rejected by|not allowed|violat/.test(low)) {
        reason =
            "That description was blocked by the art safety filter — most often because it names a real brand or a copyrighted character (Pokémon, Nintendo, Disney, sports logos, etc.). Describe your OWN original creature or object — colors, materials, mood — and it'll draw. Your creation was refunded.";
    } else if (/missing openai_api_key|returned no image|no image/.test(low)) {
        reason = "The art service is briefly unavailable — your creation was refunded. Please try again in a minute.";
    } else if (/timeout|timed out|etimedout|network|fetch failed|econnreset/.test(low)) {
        reason = "The art service took too long to respond — your creation was refunded. Please try again.";
    } else {
        reason = "The art pipeline hiccuped — your creation was refunded. Try again, or reword your description.";
    }
    return { reason, raw };
}

// Draw a single option (the whole flow is one-at-a-time now). Returns { urls:[{url,attempt}], error } — on any
// failure/refusal `urls` is empty and `error` carries a member-friendly reason + the raw OpenAI text (for admins).
async function genOne(prompt, attempt) {
    try {
        const url = await generateImage(prompt, { size: "1024x1024", quality: "medium", pathPrefix: "marketplace/decorations/custom", resizeTo: 320, deHalo: true });
        if (url) return { urls: [{ url, attempt }], error: null };
        return { urls: [], error: classifyGenError(new Error("OpenAI returned no image")) };
    } catch (e) {
        return { urls: [], error: classifyGenError(e) };
    }
}

const mapDraft = (r) => ({ id: Number(r.id), name: r.name, prompt: r.prompt, attempts: r.attempts, maxAttempts: MAX_ATTEMPTS, options: r.options || [], status: r.status });

// Suggest an editable description from a decoration's name (the player can then tweak it before drawing).
export async function suggestDecoDescription(name) {
    const desc = await describeDecoFromName(name).catch(() => null);
    return desc ? { ok: true, description: desc } : { ok: false, error: "no_suggestion" };
}

export async function getCustomState(buyerId) {
    if (!buyerId) return { credits: 0, draft: null };
    const [b, draftRow] = await Promise.all([
        db.queryOne(`SELECT COALESCE(custom_deco_credits, 0) AS c FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        db.queryOne(`SELECT * FROM mkt_custom_deco WHERE buyer_id = $1 AND status = 'drafting' ORDER BY id DESC LIMIT 1`, [buyerId]).catch(() => null),
    ]);
    return { credits: b?.c || 0, draft: draftRow ? mapDraft(draftRow) : null };
}

export async function grantCustomCredit(buyerId, n = 1) {
    if (!buyerId) return { ok: false };
    await db.query(`UPDATE mkt_buyer SET custom_deco_credits = COALESCE(custom_deco_credits, 0) + $2 WHERE id = $1`, [buyerId, Math.max(1, Number(n) || 1)]).catch(() => {});
    const b = await db.queryOne(`SELECT COALESCE(custom_deco_credits, 0) AS c FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    return { ok: true, credits: b?.c || 0 };
}

// Start a creation: spend one credit, draw the first single option.
export async function startCustomDeco(buyerId, name, prompt) {
    if (!buyerId) return { ok: false, error: "bad_request" };
    const nm = String(name || "").trim().slice(0, 40) || "My Decoration";
    const desc = String(prompt || "").trim();
    if (desc.length < 4) return { ok: false, error: "describe_it" };
    const paid = await db.queryOne(`UPDATE mkt_buyer SET custom_deco_credits = custom_deco_credits - 1 WHERE id = $1 AND COALESCE(custom_deco_credits, 0) > 0 RETURNING custom_deco_credits`, [buyerId]).catch(() => null);
    if (!paid) return { ok: false, error: "no_credits" };
    const row = await db.queryOne(`INSERT INTO mkt_custom_deco (buyer_id, name, prompt) VALUES ($1, $2, $3) RETURNING id`, [buyerId, nm, desc]).catch(() => null);
    if (!row) { await db.query(`UPDATE mkt_buyer SET custom_deco_credits = custom_deco_credits + 1 WHERE id = $1`, [buyerId]).catch(() => {}); return { ok: false, error: "db" }; }
    const gen = await genOne(await buildPrompt(desc), 1);
    if (!gen.urls.length) {
        await db.query(`UPDATE mkt_buyer SET custom_deco_credits = custom_deco_credits + 1 WHERE id = $1`, [buyerId]).catch(() => {}); // refund
        // 'failed' (not 'abandoned') + the raw reason, so a policy refusal is distinguishable from a user abandon.
        await db.query(`UPDATE mkt_custom_deco SET status = 'failed', last_error = $2, updated_at = NOW() WHERE id = $1`, [row.id, gen.error?.raw || null]).catch(() => {});
        return { ok: false, error: "gen_failed", reason: gen.error?.reason || null };
    }
    const opts = gen.urls;
    await db.query(`UPDATE mkt_custom_deco SET attempts = 1, options = $2::jsonb, updated_at = NOW() WHERE id = $1`, [row.id, JSON.stringify(opts)]).catch(() => {});
    return { ok: true, draft: { id: Number(row.id), name: nm, prompt: desc, attempts: 1, maxAttempts: MAX_ATTEMPTS, options: opts, status: "drafting" }, credits: paid.custom_deco_credits };
}

// Refine: redraw ONE more image. The ORIGINAL description is preserved (row.prompt, never overwritten); the
// optional `correction` note is layered on to steer the change. Costs an attempt, not a credit. New image is
// appended to the option history so the player can still pick an earlier draw if a redraw went the wrong way.
export async function refineCustomDeco(buyerId, id, correction) {
    const row = await db.queryOne(`SELECT * FROM mkt_custom_deco WHERE id = $1 AND buyer_id = $2 AND status = 'drafting'`, [Number(id), buyerId]).catch(() => null);
    if (!row) return { ok: false, error: "not_found" };
    if (row.attempts >= MAX_ATTEMPTS) return { ok: false, error: "no_attempts", draft: mapDraft(row) };
    const gen = await genOne(await buildPrompt(row.prompt, correction), row.attempts + 1);
    if (!gen.urls.length) {
        await db.query(`UPDATE mkt_custom_deco SET last_error = $2, updated_at = NOW() WHERE id = $1`, [Number(id), gen.error?.raw || null]).catch(() => {});
        return { ok: false, error: "gen_failed", reason: gen.error?.reason || null, draft: mapDraft(row) };
    }
    // Stamp each redraw with the correction that produced it, so the full prompting history is visible to admins.
    const note = String(correction || "").trim().slice(0, 200) || null;
    const opts = gen.urls.map((o) => ({ ...o, note }));
    const merged = [...(row.options || []), ...opts];
    await db.query(`UPDATE mkt_custom_deco SET attempts = attempts + 1, options = $2::jsonb, updated_at = NOW() WHERE id = $1`, [Number(id), JSON.stringify(merged)]).catch(() => {});
    return { ok: true, draft: { id: Number(id), name: row.name, prompt: row.prompt, attempts: row.attempts + 1, maxAttempts: MAX_ATTEMPTS, options: merged, status: "drafting" } };
}

// Finalize: lock in the chosen image → grant it as an owned, placeable decoration.
export async function finalizeCustomDeco(buyerId, id, chosenUrl) {
    const row = await db.queryOne(`SELECT * FROM mkt_custom_deco WHERE id = $1 AND buyer_id = $2 AND status = 'drafting'`, [Number(id), buyerId]).catch(() => null);
    if (!row) return { ok: false, error: "not_found" };
    const urls = (row.options || []).map((o) => o.url);
    if (!urls.includes(chosenUrl)) return { ok: false, error: "bad_choice" };
    const decoId = `custom:${id}`;
    await db.query(`UPDATE mkt_custom_deco SET status = 'final', chosen_url = $2, updated_at = NOW() WHERE id = $1`, [Number(id), chosenUrl]).catch(() => {});
    await db.query(`INSERT INTO mkt_deco_sprite (deco_id, url, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (deco_id) DO UPDATE SET url = EXCLUDED.url, updated_at = NOW()`, [decoId, chosenUrl]).catch(() => {});
    await db.query(`INSERT INTO mkt_deco_owned (buyer_id, deco_id, qty) VALUES ($1, $2, 1) ON CONFLICT (buyer_id, deco_id) DO NOTHING`, [buyerId, decoId]).catch(() => {});
    // Earned cosmetic: finishing a creation grants the "Artisan's Mark" border (idempotent). Creations are a
    // premium, deliberate act, so a single finished piece is a fair unlock.
    await db.query(`INSERT INTO mkt_cosmetic_unlock (buyer_id, category, ref) VALUES ($1, 'border', 'artisan') ON CONFLICT DO NOTHING`, [buyerId]).catch(() => {});
    await syncEarnedBadges(buyerId).catch(() => {}); // First Creation / Artisan / Gallery
    return { ok: true, decoId, name: row.name };
}

// Finalized customs for a member → { 'custom:<id>' → { name, url } }. Used to render custom decos in the farm.
export async function listFinalCustomDecos(buyerId) {
    const rows = await db.query(`SELECT id, name, chosen_url FROM mkt_custom_deco WHERE buyer_id = $1 AND status = 'final'`, [buyerId]).catch(() => []);
    const map = new Map();
    for (const r of rows || []) map.set(`custom:${r.id}`, { name: r.name, url: r.chosen_url });
    return map;
}
