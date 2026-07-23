import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { getFarm, petPet, feedPetItem, buyTreat, rechargePetting, resolveFarmOwner } from "@/lib/marketplace/farm.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Farm is an owner-only preview for now (like Sailing's phase 1) — 404 for everyone else so it stays
// hidden. GET ?u=<alias> inspects another member's farm (view-only). POST { action:"pet", petId } pets a pet.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/farm", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer || !isOwner(buyer.id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
            const u = new URL(request.url).searchParams.get("u");
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
            let res = null;
            if (b?.action === "pet") res = await petPet(buyer.id, String(b?.petId || ""));
            else if (b?.action === "use_item") res = await feedPetItem(buyer.id, String(b?.petId || ""), String(b?.consumableId || ""));
            else if (b?.action === "buy_treat") res = await buyTreat(buyer.id, String(b?.consumableId || ""));
            else if (b?.action === "recharge") res = await rechargePetting(buyer.id);
            else return NextResponse.json({ error: "bad_action" }, { status: 400 });
            // Return the whole result either way (so error responses still carry budget/cost/wallet for the UI).
            return NextResponse.json(res, { status: res?.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.farm.action.failure" });
        }
    });
}
