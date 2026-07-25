import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { getFarm, petPet, feedPetItem, buyTreat, rechargePetting, claimPig, resetPig, resolveFarmOwner, farmDirectory, saveCrownConfig } from "@/lib/marketplace/farm.js";
import { rateFarm } from "@/lib/marketplace/farm-rating.js";
import { buyDecoration, placeDecoration, moveDecoration, removeDecoration, decoState } from "@/lib/marketplace/farm-decorations.js";
import { startCustomDeco, refineCustomDeco, finalizeCustomDeco, grantCustomCredit, getCustomState } from "@/lib/marketplace/custom-deco.js";
import { plantSeed, harvestPlot, buyFertilizer, applyFertilizer, buyUpgrade, movePlot, applyRainBoost, debugGrantAllSeeds, debugGrowAll, debugGrantFertilizer } from "@/lib/marketplace/farm-crops.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const maxDuration = 120; // custom-decoration generation draws several AI images
export const dynamic = "force-dynamic";

// The Farm is an owner-only preview for now (like Sailing's phase 1) — 404 for everyone else so it stays
// hidden. GET ?u=<alias> inspects another member's farm (view-only). POST { action:"pet", petId } pets a pet.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/farm", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer || !isOwner(buyer.id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
            const params = new URL(request.url).searchParams;
            if (params.get("list")) {
                const members = await farmDirectory(buyer.id, { q: params.get("q") || "" });
                return NextResponse.json({ members }, { headers: { "Cache-Control": "no-store" } });
            }
            const u = params.get("u");
            let ownerId = buyer.id;
            if (u) {
                const o = await resolveFarmOwner(u);
                if (!o) return NextResponse.json({ error: "no_farm" }, { status: 404 });
                ownerId = o.id;
            }
            const farm = await getFarm(ownerId, buyer.id);
            if (!farm) return NextResponse.json({ error: "no_farm" }, { status: 404 });
            return NextResponse.json(farm, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.farm.get.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/farm", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer || !isOwner(buyer.id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
            const b = await request.json().catch(() => ({}));
            // When acting on a FRIEND'S farm the client passes their @handle as `owner`; resolve it to the pet
            // owner so petting/feeding lands on their pet (but spends the viewer's budget/treats).
            let ownerId = null;
            if (b?.owner) {
                const o = await resolveFarmOwner(String(b.owner));
                ownerId = o && String(o.id) !== String(buyer.id) ? o.id : null;
            }
            let res = null;
            if (b?.action === "pet") res = await petPet(buyer.id, String(b?.petId || ""), ownerId);
            else if (b?.action === "rate") res = ownerId ? await rateFarm(buyer.id, ownerId, Number(b?.tier)) : { ok: false, error: "cant_rate_own" };
            else if (b?.action === "use_item") res = await feedPetItem(buyer.id, String(b?.petId || ""), String(b?.consumableId || ""), ownerId);
            else if (b?.action === "buy_treat") res = await buyTreat(buyer.id, String(b?.consumableId || ""));
            else if (b?.action === "recharge") res = await rechargePetting(buyer.id);
            else if (b?.action === "pig_claim") res = await claimPig(buyer.id);
            else if (b?.action === "pig_reset") res = await resetPig(buyer.id);
            // ── Farming ──
            else if (b?.action === "plant") res = await plantSeed(buyer.id, Number(b?.slot), String(b?.seedId || ""));
            else if (b?.action === "harvest") res = await harvestPlot(buyer.id, Number(b?.slot));
            else if (b?.action === "fertilizer_buy") res = await buyFertilizer(buyer.id);
            else if (b?.action === "fertilizer_use") res = await applyFertilizer(buyer.id, Number(b?.slot));
            else if (b?.action === "farm_upgrade") res = await buyUpgrade(buyer.id, String(b?.key || ""));
            else if (b?.action === "plot_move") res = await movePlot(buyer.id, Number(b?.slot), b?.x, b?.y);
            else if (b?.action === "rain") res = await applyRainBoost(buyer.id);
            // ── Decorations ── (buy/place/move/remove on YOUR OWN farm)
            else if (b?.action === "deco_buy") res = await buyDecoration(buyer.id, String(b?.decoId || ""));
            else if (b?.action === "deco_place") res = await placeDecoration(buyer.id, String(b?.decoId || ""), b?.x, b?.y);
            else if (b?.action === "deco_move") res = await moveDecoration(buyer.id, Number(b?.placementId), b?.x, b?.y);
            else if (b?.action === "deco_remove") res = await removeDecoration(buyer.id, Number(b?.placementId));
            else if (b?.action === "crown_save") res = await saveCrownConfig(b?.crown);
            // ── Custom (player-made) decorations ──
            else if (b?.action === "deco_custom_state") res = { ok: true, custom: await getCustomState(buyer.id) };
            else if (b?.action === "deco_custom_start") res = await startCustomDeco(buyer.id, String(b?.name || ""), String(b?.prompt || ""));
            else if (b?.action === "deco_custom_refine") res = await refineCustomDeco(buyer.id, Number(b?.id), String(b?.correction || ""));
            else if (b?.action === "deco_custom_finalize") { res = await finalizeCustomDeco(buyer.id, Number(b?.id), String(b?.chosenUrl || "")); if (res?.ok) res = { ...res, ...(await decoState(buyer.id)) }; }
            else if (b?.action === "deco_custom_grant") res = await grantCustomCredit(buyer.id, 1); // owner-only self-grant (farm is owner-gated)
            else if (b?.action === "farm_debug_seeds") res = await debugGrantAllSeeds(buyer.id);
            else if (b?.action === "farm_debug_grow") res = await debugGrowAll(buyer.id);
            else if (b?.action === "farm_debug_fertilizer") res = await debugGrantFertilizer(buyer.id);
            else return NextResponse.json({ error: "bad_action" }, { status: 400 });
            // Return the whole result either way (so error responses still carry budget/cost/wallet for the UI).
            return NextResponse.json(res, { status: res?.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.farm.action.failure" });
        }
    });
}
