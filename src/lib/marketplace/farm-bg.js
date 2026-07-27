import "server-only";

import { db } from "@/lib/db";
import { generateOutpaintedSceneImage } from "@/lib/marketplace/openai-image.js";
import { logCreationLedger } from "@/lib/marketplace/creation-ledger.js";
import { isOwner } from "@/lib/marketplace/owner.js";

const GAME_STYLE = "BOLD CEL-SHADED 2D mobile-RPG video-game art style: confident dark outlines, flat vibrant saturated colors, clean polished game illustration, soft cel shading. Orthographic FLAT straight-on side view, NO perspective, NO vanishing point.";

// ── Custom farm background (one static, player-generated scene that replaces the weather backdrops) ──────────
// Same SAFE token flow as custom decorations: the 3 creation tokens are charged ATOMICALLY before the AI runs
// and only refunded on a genuine generation failure — backing out after previewing never refunds.

export const FARM_BG_COST = 3; // creation tokens per generated background

// Internal prompt rails so a generated scene actually WORKS as a farm backdrop: the crop plots + pets sit on the
// lower half, so the bottom must be open, flat, walkable ground (grass/soil/dirt) with no water, cliffs, roads,
// buildings or big objects blocking it — the player's theme just decorates the UPPER background/horizon.
// Prompt rails so a generated scene WORKS as a farm backdrop: crops + pets sit on the lower third, so the bottom
// must be flat, open, walkable ground; the player's theme decorates the upper background only.
const buildBgPrompt = (desc) =>
    `A FLAT, STRAIGHT-ON, side-on LANDSCAPE BACKGROUND for a 2D farming game where animals and decorations stand on the ground, ${GAME_STYLE} ` +
    `Player's theme for the scenery: ${String(desc).trim().slice(0, 300)}. ` +
    `COMPOSITION RULES: the LOWER THIRD must be a flat, open, walkable strip of grass/soil/dirt with clear empty space — no water, cliffs, roads, rivers, buildings or large foreground objects. Put the themed scenery in the UPPER background / horizon only. ` +
    `NO characters, people, animals, text, UI, or frame. The scene fills the entire frame.`;
// Continuation prompt for each outpaint step — keep the SAME scene + style + palette + ground level to the right.
const buildContPrompt = (desc) =>
    `Continue this 2D farming-game backdrop seamlessly to the RIGHT — theme: ${String(desc).trim().slice(0, 200)}. Keep the EXACT same ${GAME_STYLE} ` +
    `CRITICAL: match the sky/background color, ground color and brightness of the left edge precisely — do NOT shift the palette, darken, or introduce black. Keep the flat walkable ground strip at the same height along the bottom so it joins with no seam. NO characters, people, animals, text, UI, or frame.`;

export async function getFarmBgState(buyerId) {
    if (!buyerId) return { bg: null, draft: null, credits: 0, cost: FARM_BG_COST, free: false };
    const r = await db.queryOne(`SELECT farm_bg_url, farm_bg_draft_url, COALESCE(custom_deco_credits, 0) AS c FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    return { bg: r?.farm_bg_url || null, draft: r?.farm_bg_draft_url || null, credits: Number(r?.c || 0), cost: FARM_BG_COST, free: isOwner(buyerId) };
}

// Charge FARM_BG_COST, generate a scene, store it as the DRAFT (preview). Refund the tokens if generation fails.
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
    // 3 creation tokens → a TRUE wide OUTPAINTED backdrop (base + 3 extensions ≈ 3840px, seamless, no repeat).
    try { url = await generateOutpaintedSceneImage(buildBgPrompt(desc), buildContPrompt(desc), { pathPrefix: "marketplace/farm-bg", steps: 3, quality: "medium" }); } catch { url = null; }
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
