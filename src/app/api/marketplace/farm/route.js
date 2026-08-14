import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getFarm, petPet, feedPetItem, buyTreat, rechargePetting, claimPig, resolveFarmOwner, farmDirectory, farmVisitors } from "@/lib/marketplace/farm.js";
import { rateFarm } from "@/lib/marketplace/farm-rating.js";
import { buyDecoration, placeDecoration, moveDecoration, transformDecoration, removeDecoration, decoState, setSpriteBrightness } from "@/lib/marketplace/farm-decorations.js";
import { startCustomDeco, refineCustomDeco, finalizeCustomDeco, getCustomState, saveDraftNote, suggestDecoDescription } from "@/lib/marketplace/custom-deco.js";
import { getFarmBgState, startFarmBg, finalizeFarmBg, discardFarmBgDraft, equipFarmBg, unequipFarmBg, deleteFarmBg } from "@/lib/marketplace/farm-bg.js";
import { plantSeed, harvestPlot, buyFertilizer, applyFertilizer, buyUpgrade, movePlot, applyRainBoost, getGarden } from "@/lib/marketplace/farm-crops.js";
import { upgradePlotTrack } from "@/lib/marketplace/farm-plot-upgrades.js";
import { resolveEncounter, maybeStartEncounter } from "@/lib/marketplace/farm-encounters.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { useConsumable as openConsumable, buyConsumable } from "@/lib/marketplace/consumables.js";
import { SEED_PACK_IDS } from "@/lib/marketplace/seed-packs.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const maxDuration = 120; // custom-decoration / farm-bg generation draws AI images
export const dynamic = "force-dynamic";

// Every signed-in member has a farm. GET ?u=<alias> inspects another member's farm (view-only).
// POST { action:"pet", petId } pets a pet.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/farm", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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
            // Expose an owner-debug flag on your OWN farm (powers the "test a harvest encounter" button).
            return NextResponse.json({ ...farm, ownerDebug: !u && isOwner(buyer.id) }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.farm.get.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/farm", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            const b = await request.json().catch(() => ({}));
            // When acting on a FRIEND'S farm the client passes their @handle as `owner`; resolve it to the pet
            // owner so petting/feeding lands on their pet (but spends the viewer's budget/treats).
            let ownerId = null;
            if (b?.owner) {
                const o = await resolveFarmOwner(String(b.owner));
                ownerId = o && String(o.id) !== String(buyer.id) ? o.id : null;
            }
            let res = null;
            if (b?.action === "farm_ping") res = { ok: true, visitors: await farmVisitors(ownerId || buyer.id, buyer.id).catch(() => []) }; // keep-alive presence poll → live visitors
            else if (b?.action === "pet") res = await petPet(buyer.id, String(b?.petId || ""), ownerId);
            else if (b?.action === "rate") res = ownerId ? await rateFarm(buyer.id, ownerId, Number(b?.tier)) : { ok: false, error: "cant_rate_own" };
            else if (b?.action === "use_item") res = await feedPetItem(buyer.id, String(b?.petId || ""), String(b?.consumableId || ""), ownerId);
            else if (b?.action === "buy_treat") res = await buyTreat(buyer.id, String(b?.consumableId || ""));
            else if (b?.action === "recharge") res = await rechargePetting(buyer.id);
            else if (b?.action === "pig_claim") res = await claimPig(buyer.id);
            // ── Farming ──
            else if (b?.action === "plant") res = await plantSeed(buyer.id, Number(b?.slot), String(b?.seedId || ""));
            else if (b?.action === "pack_open") {
                // Open a seed pack right on the farm (only seed packs — never arbitrary consumables).
                const packId = String(b?.packId || "");
                if (!SEED_PACK_IDS.includes(packId)) res = { ok: false, error: "bad_pack" };
                else { const r = await openConsumable(buyer.id, packId); res = r?.ok ? { ...r, garden: await getGarden(buyer.id) } : r; }
            }
            else if (b?.action === "seedpack_buy") {
                // Buy a seed pack with gold AND open it right here → seeds land in the bag, ready to plant. No shop trip.
                const packId = String(b?.packId || "");
                if (!SEED_PACK_IDS.includes(packId)) res = { ok: false, error: "bad_pack" };
                else {
                    const buy = await buyConsumable(buyer.id, packId);
                    if (!buy?.ok) res = buy; // not_enough_gold / not_for_sale
                    else { const r = await openConsumable(buyer.id, packId); res = { ...(r?.ok ? r : {}), ok: true, bought: true, gold: buy.gold, garden: await getGarden(buyer.id) }; }
                }
            }
            else if (b?.action === "harvest") res = await harvestPlot(buyer.id, Number(b?.slot));
            else if (b?.action === "fertilizer_buy") res = await buyFertilizer(buyer.id);
            else if (b?.action === "fertilizer_use") res = await applyFertilizer(buyer.id, Number(b?.slot));
            else if (b?.action === "farm_upgrade") res = await buyUpgrade(buyer.id, String(b?.key || ""));
            else if (b?.action === "plot_move") res = await movePlot(buyer.id, Number(b?.slot), b?.x, b?.y);
            else if (b?.action === "plot_upgrade") { res = await upgradePlotTrack(buyer.id, Number(b?.slot), String(b?.key || "")); if (res?.ok) res = { ...res, garden: await getGarden(buyer.id) }; }
            else if (b?.action === "encounter_resolve") { res = await resolveEncounter(buyer.id, { perfectHits: Number(b?.perfectHits) || 0 }); if (res?.ok) res = { ...res, garden: await getGarden(buyer.id) }; }
            else if (b?.action === "debug_encounter") { // owner-only: force a harvest encounter to test the fight
                if (!isOwner(buyer.id)) res = { ok: false, error: "forbidden" };
                else { const enc = await maybeStartEncounter(buyer.id, { rarity: "rare", wardChance: 0, seedId: null, force: true, creature: b?.creature || null }).catch(() => null); res = enc ? { ok: true, encounter: enc } : { ok: false, error: "spawn_failed" }; }
            }
            else if (b?.action === "rain") res = await applyRainBoost(buyer.id);
            // ── Decorations ── (buy/place/move/remove on YOUR OWN farm)
            else if (b?.action === "deco_buy") res = await buyDecoration(buyer.id, String(b?.decoId || ""));
            else if (b?.action === "deco_place") res = await placeDecoration(buyer.id, String(b?.decoId || ""), b?.x, b?.y, String(b?.view || "outside"));
            else if (b?.action === "deco_move") res = await moveDecoration(buyer.id, Number(b?.placementId), b?.x, b?.y);
            else if (b?.action === "deco_transform") res = await transformDecoration(buyer.id, Number(b?.placementId), { scale: b?.scale, rot: b?.rot, flip: b?.flip, brightness: b?.brightness, light: b?.light });
            else if (b?.action === "sprite_brightness") res = await setSpriteBrightness(buyer.id, b?.value);
            else if (b?.action === "deco_remove") res = await removeDecoration(buyer.id, Number(b?.placementId));
            // ── Custom (player-made) decorations ──
            else if (b?.action === "deco_custom_state") res = { ok: true, custom: await getCustomState(buyer.id) };
            else if (b?.action === "deco_custom_suggest") res = await suggestDecoDescription(String(b?.name || ""));
            else if (b?.action === "deco_custom_start") res = await startCustomDeco(buyer.id, String(b?.name || ""), String(b?.prompt || ""));
            else if (b?.action === "deco_custom_refine") res = await refineCustomDeco(buyer.id, Number(b?.id), String(b?.correction || ""));
            // Autosaved as the member types, so closing the panel never costs them the tweak they were writing.
            else if (b?.action === "deco_custom_note") res = await saveDraftNote(buyer.id, Number(b?.id), String(b?.note || ""));
            else if (b?.action === "deco_custom_finalize") { res = await finalizeCustomDeco(buyer.id, Number(b?.id), String(b?.chosenUrl || "")); if (res?.ok) res = { ...res, ...(await decoState(buyer.id)) }; }
            // ── Custom farm background LIBRARY (3 creations; live-preview draft → save; equip/switch/delete) ──
            else if (b?.action === "farm_bg_state") res = { ok: true, ...(await getFarmBgState(buyer.id)) };
            else if (b?.action === "farm_bg_start") res = await startFarmBg(buyer.id, String(b?.prompt || ""));
            else if (b?.action === "farm_bg_finalize") res = await finalizeFarmBg(buyer.id);
            else if (b?.action === "farm_bg_discard") res = await discardFarmBgDraft(buyer.id);
            else if (b?.action === "farm_bg_equip") res = await equipFarmBg(buyer.id, Number(b?.id));
            else if (b?.action === "farm_bg_unequip") res = await unequipFarmBg(buyer.id);
            else if (b?.action === "farm_bg_delete") res = await deleteFarmBg(buyer.id, Number(b?.id));
            else return NextResponse.json({ error: "bad_action" }, { status: 400 });
            // Return the whole result either way (so error responses still carry budget/cost/wallet for the UI).
            return NextResponse.json(res, { status: res?.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.farm.action.failure" });
        }
    });
}
