import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getSailingState, startVoyage, favorableWind, rechargeWind, beginDig, digAt, senseAt, buyDigs, endDig, upgradeSpeed, upgradeFortune, upgradeRarity, upgradeLuck, upgradeRaid, upgradeDig, upgradeTool, upgradeFishing, forgeChest, waveAtSailor, ackEncounter, doRaid, getRaidTargets, resetRaid, merchantMinigame, merchantBuy, fishCast, fishLand, fishRecords, fishRecharge, doFleetBattle, shipBattleOrder, buyAmmo, setLoadout, upgradeCombat } from "@/lib/marketplace/sailing.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Require a signed-in member (the feature is public now that Sailing has launched).
async function gate() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) return { error: noStore({ error: "unauthorized" }, { status: 401 }) };
    return { buyer };
}

export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/sailing", async ({ internalError }) => {
        try {
            const g = await gate();
            if (g.error) return g.error;
            return noStore(await getSailingState(g.buyer.id));
        } catch (error) {
            return internalError(error, { event: "marketplace.sailing.get.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/sailing", async ({ internalError }) => {
        try {
            const g = await gate();
            if (g.error) return g.error;
            const body = await request.json().catch(() => ({}));
            switch (body?.action) {
                case "start": return noStore(await startVoyage(g.buyer.id, body.duration));
                case "wind": return noStore(await favorableWind(g.buyer.id));
                case "recharge_wind": return noStore(await rechargeWind(g.buyer.id));
                case "begin_dig": return noStore(await beginDig(g.buyer.id));
                case "dig": return noStore(await digAt(g.buyer.id, body.r, body.c));
                case "sense": return noStore(await senseAt(g.buyer.id, body.r, body.c));
                case "buy_digs": return noStore(await buyDigs(g.buyer.id));
                case "end_dig": return noStore(await endDig(g.buyer.id));
                case "upgrade_speed": return noStore(await upgradeSpeed(g.buyer.id));
                case "upgrade_fortune": return noStore(await upgradeFortune(g.buyer.id));
                case "upgrade_rarity": return noStore(await upgradeRarity(g.buyer.id));
                case "upgrade_luck": return noStore(await upgradeLuck(g.buyer.id));
                case "upgrade_raid": return noStore(await upgradeRaid(g.buyer.id));
                case "raid_targets": return noStore({ ok: true, ...(await getRaidTargets(g.buyer.id)) });
                case "raid_reset": return noStore(await resetRaid(g.buyer.id));
                case "raid": return noStore(await doRaid(g.buyer.id, body.target));
                // Ship battles (under construction — every one of these refuses off the allow-list).
                case "fleet_battle": return noStore(await doFleetBattle(g.buyer.id, body.rank ?? null));
                case "battle_order": return noStore(await shipBattleOrder(g.buyer.id, body.order));
                case "buy_ammo": return noStore(await buyAmmo(g.buyer.id, body.ammo, body.qty));
                case "set_loadout": return noStore(await setLoadout(g.buyer.id, body.ammo));
                case "upgrade_combat": return noStore(await upgradeCombat(g.buyer.id, body.track));
                case "upgrade_dig": return noStore(await upgradeDig(g.buyer.id, body.track));
                case "upgrade_tool": return noStore(await upgradeTool(g.buyer.id, body.tool));
                case "upgrade_fishing": return noStore(await upgradeFishing(g.buyer.id, body.track));
                case "forge_chest": return noStore(await forgeChest(g.buyer.id, body.tier));
                case "wave": return noStore(await waveAtSailor(g.buyer.id));
                case "ack_encounter": return noStore(await ackEncounter(g.buyer.id));
                case "merchant_play": return noStore(await merchantMinigame(g.buyer.id, body.collected, body.perfect));
                case "merchant_buy": return noStore(await merchantBuy(g.buyer.id, body.item));
                // Fishing. `sky` is what the client says it's rendering — it only gates which SPECIES can bite,
                // and the time-of-day half of that gate is recomputed server-side (see fishing.js).
                case "fish_cast": return noStore(await fishCast(g.buyer.id, { sky: body.sky }));
                case "fish_land": return noStore(await fishLand(g.buyer.id, { quality: body.quality, missed: body.missed, sky: body.sky }));
                case "fish_records": return noStore({ ok: true, ...(await fishRecords(g.buyer.id)) });
                case "fish_recharge": return noStore(await fishRecharge(g.buyer.id));
                default: return noStore({ error: "bad_action" }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "marketplace.sailing.post.failure" });
        }
    });
}
