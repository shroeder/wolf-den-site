import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { getFarm, petPet, resolveFarmOwner } from "@/lib/marketplace/farm.js";
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
            if (b?.action === "pet") {
                const res = await petPet(buyer.id, String(b?.petId || ""));
                if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
                return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
            }
            return NextResponse.json({ error: "bad_action" }, { status: 400 });
        } catch (error) {
            return internalError(error, { event: "marketplace.farm.action.failure" });
        }
    });
}
