import "server-only";

import { db } from "@/lib/db";
import { generateSceneImage } from "@/lib/marketplace/openai-image.js";
import { logCreationLedger } from "@/lib/marketplace/creation-ledger.js";
import { isOwner } from "@/lib/marketplace/owner.js";

// ── Custom farm background (one static, player-generated scene that replaces the weather backdrops) ──────────
// Same SAFE token flow as custom decorations: the 3 creation tokens are charged ATOMICALLY before the AI runs
// and only refunded on a genuine generation failure — backing out after previewing never refunds. It's a SINGLE
// generated image (no outpainting/panorama — that made it worse), shown as a cover on the Outside scene. Removing
// it UNEQUIPS but keeps it saved, so it can be re-equipped later.

export const FARM_BG_COST = 3; // creation tokens per generated background

// Prompt rails so a generated scene WORKS as a farm backdrop: crops + pets sit on the lower half, so the bottom
// must be flat, open, walkable ground; the player's theme just decorates the upper background/horizon.
const buildBgPrompt = (desc) =>
    `A wide, seamless, side-on LANDSCAPE BACKGROUND for a cozy 2D farming game where crops and animals stand on the ground. ` +
    `Player's theme for the scenery: ${String(desc).trim().slice(0, 300)}. ` +
    `COMPOSITION RULES (important): the LOWER HALF must be a flat, open, walkable field of grass/soil/dirt with plenty of clear empty space for crops to be planted — no water, no cliffs, no roads, no rivers, no fences, no buildings or large objects in the foreground. ` +
    `Put all the themed scenery (mountains, sky, trees, structures, etc.) in the UPPER background / on the horizon only. Gentle, subtle ground so tiles read clearly. ` +
    `Horizontal panorama, rich saturated storybook color, soft depth. NO characters, NO people, NO animals, NO text, NO letters, NO UI, NO frame or border. The scene fills the entire frame.`;

export async function getFarmBgState(buyerId) {
    if (!buyerId) return { bg: null, draft: null, on: false, saved: false, credits: 0, cost: FARM_BG_COST, free: false };
    const r = await db.queryOne(`SELECT farm_bg_url, farm_bg_draft_url, COALESCE(farm_bg_on, TRUE) AS on, COALESCE(custom_deco_credits, 0) AS c FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    return { bg: r?.farm_bg_url || null, draft: r?.farm_bg_draft_url || null, on: Boolean(r?.on), saved: Boolean(r?.farm_bg_url), credits: Number(r?.c || 0), cost: FARM_BG_COST, free: isOwner(buyerId) };
}

// Charge FARM_BG_COST, generate a single scene, store it as the DRAFT (preview). Refund the tokens if it fails.
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
    try { url = await generateSceneImage(buildBgPrompt(desc), { pathPrefix: "marketplace/farm-bg" }); } catch { url = null; }
    if (!url) {
        if (!free) {
            await db.query(`UPDATE mkt_buyer SET custom_deco_credits = custom_deco_credits + $2 WHERE id = $1`, [buyerId, FARM_BG_COST]).catch(() => {}); // refund
            await logCreationLedger(buyerId, FARM_BG_COST, { source: "refund_farm_bg", actorId: "system", actorLabel: "system", meta: { reason: "gen_failed" } });
        }
        return { ok: false, error: "gen_failed", ...(await getFarmBgState(buyerId)) };
    }
    await db.query(`UPDATE mkt_buyer SET farm_bg_draft_url = $2 WHERE id = $1`, [buyerId, url]).catch(() => {});
    return { ok: true, ...(await getFarmBgState(buyerId)) };
}

// Accept the pending preview → make it the active (equipped) background.
export async function finalizeFarmBg(buyerId) {
    if (!buyerId) return { ok: false, error: "bad_request" };
    const r = await db.queryOne(`SELECT farm_bg_draft_url FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    if (!r?.farm_bg_draft_url) return { ok: false, error: "no_draft" };
    await db.query(`UPDATE mkt_buyer SET farm_bg_url = farm_bg_draft_url, farm_bg_draft_url = NULL, farm_bg_on = TRUE WHERE id = $1`, [buyerId]).catch(() => {});
    return { ok: true, ...(await getFarmBgState(buyerId)) };
}

// Discard the pending preview without accepting (tokens are already spent — no refund).
export async function discardFarmBgDraft(buyerId) {
    if (!buyerId) return { ok: false, error: "bad_request" };
    await db.query(`UPDATE mkt_buyer SET farm_bg_draft_url = NULL WHERE id = $1`, [buyerId]).catch(() => {});
    return { ok: true, ...(await getFarmBgState(buyerId)) };
}

// UNEQUIP — hide the custom background (back to the weather/time scenes) but KEEP it saved so it can be re-equipped.
export async function clearFarmBg(buyerId) {
    if (!buyerId) return { ok: false, error: "bad_request" };
    await db.query(`UPDATE mkt_buyer SET farm_bg_on = FALSE, farm_bg_draft_url = NULL WHERE id = $1`, [buyerId]).catch(() => {});
    return { ok: true, ...(await getFarmBgState(buyerId)) };
}

// RE-EQUIP — put the previously-removed saved background back on.
export async function reequipFarmBg(buyerId) {
    if (!buyerId) return { ok: false, error: "bad_request" };
    const r = await db.queryOne(`SELECT farm_bg_url FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    if (!r?.farm_bg_url) return { ok: false, error: "no_saved" };
    await db.query(`UPDATE mkt_buyer SET farm_bg_on = TRUE WHERE id = $1`, [buyerId]).catch(() => {});
    return { ok: true, ...(await getFarmBgState(buyerId)) };
}
