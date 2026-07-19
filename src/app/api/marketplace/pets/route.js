import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { petsState, equipPet, unequipPet, buyPet, sharePet, acceptShare, declineShare } from "@/lib/marketplace/pets.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — the member's pet state (owned ids, equipped, level, gold, passive total).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/pets", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            const state = await petsState(buyer?.id || null, { sync: true });
            return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.pets.state.failure" });
        }
    });
}

// POST { action: "equip" | "unequip" | "buy", petId } — equip/unequip a pet, or buy a shop pet.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/pets", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
            const b = await request.json().catch(() => ({}));
            let res;
            if (b?.action === "unequip") res = await unequipPet(buyer.id);
            else if (b?.action === "buy") res = await buyPet(buyer.id, String(b?.petId || ""));
            else if (b?.action === "share") res = await sharePet(buyer.id, String(b?.petId || ""), String(b?.toAlias || ""));
            else if (b?.action === "accept") res = await acceptShare(String(b?.shareId || ""), buyer.id);
            else if (b?.action === "decline") res = await declineShare(String(b?.shareId || ""), buyer.id);
            else res = await equipPet(buyer.id, String(b?.petId || ""));
            if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
            return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.pets.action.failure" });
        }
    });
}
