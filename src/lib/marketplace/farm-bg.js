import "server-only";

import { db } from "@/lib/db";
import { generateSceneImage } from "@/lib/marketplace/openai-image.js";
import { logCreationLedger } from "@/lib/marketplace/creation-ledger.js";
import { isOwner } from "@/lib/marketplace/owner.js";

// ── Custom farm background LIBRARY ───────────────────────────────────────────────────────────────────────────
// A member keeps EVERY background they generate (mkt_farm_bg rows) and equips one at a time — or none, which
// falls back to the default weather/time scenes. Same SAFE token flow as custom decorations: the 3 creation
// tokens are charged ATOMICALLY before the AI runs and only refunded on a genuine generation failure. Each
// background is a SINGLE generated image (no outpainting), shown as a cover on the Outside scene.

export const FARM_BG_COST = 3; // creation tokens per generated background

// Prompt rails so a generated scene WORKS as a farm backdrop: crops + pets sit on the lower half, so the bottom
// must be flat, open, walkable ground; the player's theme just decorates the upper background/horizon.
const buildBgPrompt = (desc) =>
    `A wide, seamless, side-on LANDSCAPE BACKGROUND for a cozy 2D farming game where crops and animals stand on the ground. ` +
    `Player's theme for the scenery: ${String(desc).trim().slice(0, 300)}. ` +
    `COMPOSITION RULES (important): the LOWER HALF must be a flat, open, walkable field of grass/soil/dirt with plenty of clear empty space for crops to be planted — no water, no cliffs, no roads, no rivers, no fences, no buildings or large objects in the foreground. ` +
    `Put all the themed scenery (mountains, sky, trees, structures, etc.) in the UPPER background / on the horizon only. Gentle, subtle ground so tiles read clearly. ` +
    `Horizontal panorama, rich saturated storybook color, soft depth. NO characters, NO people, NO animals, NO text, NO letters, NO UI, NO frame or border. The scene fills the entire frame.`;

// Full state for the backdrop UI: the whole library, which one is equipped, the pending draft, and credits.
export async function getFarmBgState(buyerId) {
    if (!buyerId) return { library: [], activeId: null, activeUrl: null, draft: null, credits: 0, cost: FARM_BG_COST, free: false };
    const [b, rows] = await Promise.all([
        db.queryOne(`SELECT farm_bg_active_id, farm_bg_draft_url, COALESCE(custom_deco_credits, 0) AS c FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        db.query(`SELECT id, url, prompt, created_at FROM mkt_farm_bg WHERE buyer_id = $1 ORDER BY created_at DESC, id DESC`, [buyerId]).catch(() => []),
    ]);
    const activeId = b?.farm_bg_active_id != null ? Number(b.farm_bg_active_id) : null;
    const library = (rows || []).map((r) => ({ id: Number(r.id), url: r.url, prompt: r.prompt || null, createdAt: r.created_at, active: Number(r.id) === activeId }));
    return {
        library,
        activeId,
        activeUrl: library.find((x) => x.active)?.url || null,
        draft: b?.farm_bg_draft_url || null,
        credits: Number(b?.c || 0),
        cost: FARM_BG_COST,
        free: isOwner(buyerId),
    };
}

// Charge FARM_BG_COST, generate a single scene, store it as the DRAFT preview. Refund the tokens if it fails.
export async function startFarmBg(buyerId, prompt) {
    if (!buyerId) return { ok: false, error: "bad_request" };
    const desc = String(prompt || "").trim();
    if (desc.length < 4) return { ok: false, error: "describe_it" };
    // Owners/admins generate backgrounds for FREE (they run the store — no tokens burned).
    const free = isOwner(buyerId);
    const paid = free ? { custom_deco_credits: null } : await db.queryOne(
        `UPDATE mkt_buyer SET custom_deco_credits = custom_deco_credits - $2 WHERE id = $1 AND COALESCE(custom_deco_credits, 0) >= $2 RETURNING custom_deco_credits`,
        [buyerId, FARM_BG_COST]
    ).catch(() => null);
    if (!paid) return { ok: false, error: "no_credits" };
    if (!free) await logCreationLedger(buyerId, -FARM_BG_COST, { source: "spend_farm_bg", actorId: buyerId, actorLabel: "self", balanceAfter: paid.custom_deco_credits, meta: {} });
    let url = null;
        // Paid for with Creation credits, so it belongs with the creations — named, not anonymous.
    const who = await db.queryOne(`SELECT alias, display_name FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const buyerLabel = who?.alias ? `@${who.alias}` : (who?.display_name || null);
    try {
        url = await generateSceneImage(buildBgPrompt(desc), {
            pathPrefix: "marketplace/farm-bg",
            meta: { origin: "creation", buyerId, buyerLabel, label: "Farm background" },
        });
    } catch { url = null; }
    if (!url) {
        if (!free) {
            await db.query(`UPDATE mkt_buyer SET custom_deco_credits = custom_deco_credits + $2 WHERE id = $1`, [buyerId, FARM_BG_COST]).catch(() => {}); // refund
            await logCreationLedger(buyerId, FARM_BG_COST, { source: "refund_farm_bg", actorId: "system", actorLabel: "system", meta: { reason: "gen_failed" } });
        }
        return { ok: false, error: "gen_failed", ...(await getFarmBgState(buyerId)) };
    }
    await db.query(`UPDATE mkt_buyer SET farm_bg_draft_url = $2, farm_bg_draft_prompt = $3 WHERE id = $1`, [buyerId, url, desc.slice(0, 300)]).catch(() => {});
    return { ok: true, ...(await getFarmBgState(buyerId)) };
}

// Accept the pending preview → save it into the library AND equip it.
export async function finalizeFarmBg(buyerId) {
    if (!buyerId) return { ok: false, error: "bad_request" };
    const r = await db.queryOne(`SELECT farm_bg_draft_url, farm_bg_draft_prompt FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    if (!r?.farm_bg_draft_url) return { ok: false, error: "no_draft" };
    const ins = await db.queryOne(`INSERT INTO mkt_farm_bg (buyer_id, url, prompt) VALUES ($1, $2, $3) RETURNING id`, [buyerId, r.farm_bg_draft_url, r.farm_bg_draft_prompt || null]).catch(() => null);
    await db.query(`UPDATE mkt_buyer SET farm_bg_active_id = $2, farm_bg_draft_url = NULL, farm_bg_draft_prompt = NULL WHERE id = $1`, [buyerId, ins?.id ?? null]).catch(() => {});
    return { ok: true, ...(await getFarmBgState(buyerId)) };
}

// Discard the pending preview without saving (tokens are already spent — no refund).
export async function discardFarmBgDraft(buyerId) {
    if (!buyerId) return { ok: false, error: "bad_request" };
    await db.query(`UPDATE mkt_buyer SET farm_bg_draft_url = NULL, farm_bg_draft_prompt = NULL WHERE id = $1`, [buyerId]).catch(() => {});
    return { ok: true, ...(await getFarmBgState(buyerId)) };
}

// Equip a saved background (must belong to the member).
export async function equipFarmBg(buyerId, bgId) {
    if (!buyerId || !bgId) return { ok: false, error: "bad_request" };
    const own = await db.queryOne(`SELECT id FROM mkt_farm_bg WHERE id = $1 AND buyer_id = $2`, [bgId, buyerId]).catch(() => null);
    if (!own) return { ok: false, error: "not_found" };
    await db.query(`UPDATE mkt_buyer SET farm_bg_active_id = $2 WHERE id = $1`, [buyerId, bgId]).catch(() => {});
    return { ok: true, ...(await getFarmBgState(buyerId)) };
}

// Unequip — back to the default weather/time scenes (keeps the whole library).
export async function unequipFarmBg(buyerId) {
    if (!buyerId) return { ok: false, error: "bad_request" };
    await db.query(`UPDATE mkt_buyer SET farm_bg_active_id = NULL WHERE id = $1`, [buyerId]).catch(() => {});
    return { ok: true, ...(await getFarmBgState(buyerId)) };
}

// Permanently delete ONE background from the library (unequips it first if it was active).
export async function deleteFarmBg(buyerId, bgId) {
    if (!buyerId || !bgId) return { ok: false, error: "bad_request" };
    await db.query(`UPDATE mkt_buyer SET farm_bg_active_id = NULL WHERE id = $1 AND farm_bg_active_id = $2`, [buyerId, bgId]).catch(() => {});
    await db.query(`DELETE FROM mkt_farm_bg WHERE id = $1 AND buyer_id = $2`, [bgId, buyerId]).catch(() => {});
    return { ok: true, ...(await getFarmBgState(buyerId)) };
}
