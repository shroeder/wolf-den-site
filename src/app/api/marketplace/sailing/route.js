import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { getSailingState, startVoyage, favorableWind, rechargeWind, beginDig, digAt, buyDigs, upgradeSpeed, upgradeFortune, upgradeRarity, upgradeLuck, upgradeDig, activateTool, forgeChest, waveAtSailor, ackEncounter } from "@/lib/marketplace/sailing.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Gate every entry point on the owner allow-list — the feature is invisible/unreachable for everyone else.
async function gate() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) return { error: noStore({ error: "unauthorized" }, { status: 401 }) };
    if (!isOwner(buyer.id)) return { error: noStore({ error: "not_found" }, { status: 404 }) };
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
                case "buy_digs": return noStore(await buyDigs(g.buyer.id));
                case "upgrade_speed": return noStore(await upgradeSpeed(g.buyer.id));
                case "upgrade_fortune": return noStore(await upgradeFortune(g.buyer.id));
                case "upgrade_rarity": return noStore(await upgradeRarity(g.buyer.id));
                case "upgrade_luck": return noStore(await upgradeLuck(g.buyer.id));
                case "upgrade_dig": return noStore(await upgradeDig(g.buyer.id, body.track));
                case "use_tool": return noStore(await activateTool(g.buyer.id, body.tool, body.r, body.c));
                case "forge_chest": return noStore(await forgeChest(g.buyer.id, body.tier));
                case "wave": return noStore(await waveAtSailor(g.buyer.id));
                case "ack_encounter": return noStore(await ackEncounter(g.buyer.id));
                default: return noStore({ error: "bad_action" }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "marketplace.sailing.post.failure" });
        }
    });
}
