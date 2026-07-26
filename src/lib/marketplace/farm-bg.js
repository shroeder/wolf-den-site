import "server-only";

import { db } from "@/lib/db";
import { generateSceneImage } from "@/lib/marketplace/openai-image.js";

// ── Custom farm background (one static, player-generated scene that replaces the weather backdrops) ──────────
// Same SAFE token flow as custom decorations: the 3 creation tokens are charged ATOMICALLY before the AI runs
// and only refunded on a genuine generation failure — backing out after previewing never refunds.

export const FARM_BG_COST = 3; // creation tokens per generated background

const buildBgPrompt = (desc) =>
    `A wide painterly LANDSCAPE BACKGROUND for a cozy top-down farming game — a scenic countryside/pasture vista: ${String(desc).trim().slice(0, 400)}. ` +
    `Horizontal panorama, rich saturated storybook color, soft depth, with gently rolling ground across the bottom third for crops to sit on. ` +
    `NO characters, NO animals, NO people, NO text, NO letters, NO UI, NO frame or border. The scene fills the entire frame.`;

export async function getFarmBgState(buyerId) {
    if (!buyerId) return { bg: null, draft: null, credits: 0, cost: FARM_BG_COST };
    const r = await db.queryOne(`SELECT farm_bg_url, farm_bg_draft_url, COALESCE(custom_deco_credits, 0) AS c FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    return { bg: r?.farm_bg_url || null, draft: r?.farm_bg_draft_url || null, credits: Number(r?.c || 0), cost: FARM_BG_COST };
}

// Charge FARM_BG_COST, generate a scene, store it as the DRAFT (preview). Refund the tokens if generation fails.
export async function startFarmBg(buyerId, prompt) {
    if (!buyerId) return { ok: false, error: "bad_request" };
    const desc = String(prompt || "").trim();
    if (desc.length < 4) return { ok: false, error: "describe_it" };
    const paid = await db.queryOne(
        `UPDATE mkt_buyer SET custom_deco_credits = custom_deco_credits - $2 WHERE id = $1 AND COALESCE(custom_deco_credits, 0) >= $2 RETURNING custom_deco_credits`,
        [buyerId, FARM_BG_COST]
    ).catch(() => null);
    if (!paid) return { ok: false, error: "no_credits" };
    let url = null;
    try { url = await generateSceneImage(buildBgPrompt(desc), { pathPrefix: "marketplace/farm-bg" }); } catch { url = null; }
    if (!url) {
        await db.query(`UPDATE mkt_buyer SET custom_deco_credits = custom_deco_credits + $2 WHERE id = $1`, [buyerId, FARM_BG_COST]).catch(() => {}); // refund
        return { ok: false, error: "gen_failed", ...(await getFarmBgState(buyerId)) };
    }
    await db.query(`UPDATE mkt_buyer SET farm_bg_draft_url = $2 WHERE id = $1`, [buyerId, url]).catch(() => {});
    return { ok: true, ...(await getFarmBgState(buyerId)) };
}

// Accept the pending preview → make it the active background.
export async function finalizeFarmBg(buyerId) {
    if (!buyerId) return { ok: false, error: "bad_request" };
    const r = await db.queryOne(`SELECT farm_bg_draft_url FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    if (!r?.farm_bg_draft_url) return { ok: false, error: "no_draft" };
    await db.query(`UPDATE mkt_buyer SET farm_bg_url = farm_bg_draft_url, farm_bg_draft_url = NULL WHERE id = $1`, [buyerId]).catch(() => {});
    return { ok: true, ...(await getFarmBgState(buyerId)) };
}

// Discard the pending preview without accepting (tokens are already spent — no refund).
export async function discardFarmBgDraft(buyerId) {
    if (!buyerId) return { ok: false, error: "bad_request" };
    await db.query(`UPDATE mkt_buyer SET farm_bg_draft_url = NULL WHERE id = $1`, [buyerId]).catch(() => {});
    return { ok: true, ...(await getFarmBgState(buyerId)) };
}

// Revert to the default weather/time-of-day backdrops.
export async function clearFarmBg(buyerId) {
    if (!buyerId) return { ok: false, error: "bad_request" };
    await db.query(`UPDATE mkt_buyer SET farm_bg_url = NULL, farm_bg_draft_url = NULL WHERE id = $1`, [buyerId]).catch(() => {});
    return { ok: true, ...(await getFarmBgState(buyerId)) };
}
