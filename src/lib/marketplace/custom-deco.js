import "server-only";

import { db } from "@/lib/db";
import { generateImage } from "@/lib/marketplace/openai-image.js";

// Player-made decorations: describe → the art pipeline draws 3 options → up to 2 refine attempts (3 generations
// total) → pick one. Each finalized custom is granted into mkt_deco_owned as 'custom:<id>' + its sprite into
// mkt_deco_sprite, so it flows through the normal place/inspect system. Personal-only, never tradeable.
const MAX_ATTEMPTS = 3; // 1 initial + 2 refines
const ART = "cute polished 2D game decoration sprite, painterly cartoon style, warm storybook lighting, bold clean outline, die-cut with transparent background, centered, no ground shadow, no text";
const buildPrompt = (desc) => `A ${String(desc || "").slice(0, 300)}. ${ART}.`;

async function genOptions(prompt, attempt) {
    const out = [];
    for (let i = 0; i < 3; i++) {
        try {
            const url = await generateImage(prompt, { size: "1024x1024", quality: "medium", pathPrefix: "marketplace/decorations/custom", resizeTo: 320 });
            if (url) out.push({ url, attempt });
        } catch { /* skip a failed draw; the batch still returns what it got */ }
    }
    return out;
}

const mapDraft = (r) => ({ id: Number(r.id), name: r.name, prompt: r.prompt, attempts: r.attempts, maxAttempts: MAX_ATTEMPTS, options: r.options || [], status: r.status });

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

// Start a creation: spend one credit, draw the first 3 options.
export async function startCustomDeco(buyerId, name, prompt) {
    if (!buyerId) return { ok: false, error: "bad_request" };
    const nm = String(name || "").trim().slice(0, 40) || "My Decoration";
    const desc = String(prompt || "").trim();
    if (desc.length < 4) return { ok: false, error: "describe_it" };
    const paid = await db.queryOne(`UPDATE mkt_buyer SET custom_deco_credits = custom_deco_credits - 1 WHERE id = $1 AND COALESCE(custom_deco_credits, 0) > 0 RETURNING custom_deco_credits`, [buyerId]).catch(() => null);
    if (!paid) return { ok: false, error: "no_credits" };
    const row = await db.queryOne(`INSERT INTO mkt_custom_deco (buyer_id, name, prompt) VALUES ($1, $2, $3) RETURNING id`, [buyerId, nm, desc]).catch(() => null);
    if (!row) { await db.query(`UPDATE mkt_buyer SET custom_deco_credits = custom_deco_credits + 1 WHERE id = $1`, [buyerId]).catch(() => {}); return { ok: false, error: "db" }; }
    const opts = await genOptions(buildPrompt(desc), 1);
    if (!opts.length) {
        await db.query(`UPDATE mkt_buyer SET custom_deco_credits = custom_deco_credits + 1 WHERE id = $1`, [buyerId]).catch(() => {}); // refund
        await db.query(`UPDATE mkt_custom_deco SET status = 'abandoned' WHERE id = $1`, [row.id]).catch(() => {});
        return { ok: false, error: "gen_failed" };
    }
    await db.query(`UPDATE mkt_custom_deco SET attempts = 1, options = $2::jsonb, updated_at = NOW() WHERE id = $1`, [row.id, JSON.stringify(opts)]).catch(() => {});
    return { ok: true, draft: { id: Number(row.id), name: nm, prompt: desc, attempts: 1, maxAttempts: MAX_ATTEMPTS, options: opts, status: "drafting" }, credits: paid.custom_deco_credits };
}

// Refine: draw 3 more from a (possibly tweaked) description. Costs an attempt, not a credit.
export async function refineCustomDeco(buyerId, id, prompt) {
    const row = await db.queryOne(`SELECT * FROM mkt_custom_deco WHERE id = $1 AND buyer_id = $2 AND status = 'drafting'`, [Number(id), buyerId]).catch(() => null);
    if (!row) return { ok: false, error: "not_found" };
    if (row.attempts >= MAX_ATTEMPTS) return { ok: false, error: "no_attempts", draft: mapDraft(row) };
    const desc = String(prompt || row.prompt).trim();
    const opts = await genOptions(buildPrompt(desc), row.attempts + 1);
    if (!opts.length) return { ok: false, error: "gen_failed", draft: mapDraft(row) };
    const merged = [...(row.options || []), ...opts];
    await db.query(`UPDATE mkt_custom_deco SET attempts = attempts + 1, prompt = $3, options = $2::jsonb, updated_at = NOW() WHERE id = $1`, [Number(id), JSON.stringify(merged), desc]).catch(() => {});
    return { ok: true, draft: { id: Number(id), name: row.name, prompt: desc, attempts: row.attempts + 1, maxAttempts: MAX_ATTEMPTS, options: merged, status: "drafting" } };
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
    return { ok: true, decoId, name: row.name };
}

// Finalized customs for a member → { 'custom:<id>' → { name, url } }. Used to render custom decos in the farm.
export async function listFinalCustomDecos(buyerId) {
    const rows = await db.query(`SELECT id, name, chosen_url FROM mkt_custom_deco WHERE buyer_id = $1 AND status = 'final'`, [buyerId]).catch(() => []);
    const map = new Map();
    for (const r of rows || []) map.set(`custom:${r.id}`, { name: r.name, url: r.chosen_url });
    return map;
}
