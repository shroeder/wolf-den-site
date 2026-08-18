import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { buyConsumable, listConsumables, useConsumable } from "@/lib/marketplace/consumables.js";
import { withRequestLogging } from "@/lib/server-logger";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET — the member's consumable stash + shop + active boosts.
export async function GET() {
    return withRequestLogging(null, "GET /api/marketplace/consumables", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            return noStore(await listConsumables(buyer.id));
        } catch (error) {
            return internalError(error, { event: "marketplace.consumables.get.failure" });
        }
    });
}

// POST — { id, action: "buy" | "use" }.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/consumables", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const id = String(body?.id || "").trim();
            const target = body?.targetItemId ? String(body.targetItemId).trim() : null;
            // "use_all" — the whole stack of one pet food, into whatever pet is equipped. Same bulk path the
            // farm panel uses, so it stops at full and spends cheapest-first there too. The pet is resolved
            // here rather than sent by the client: the stash has no pet picker, and letting a body name the
            // target would be a way to feed a pet you are not looking at.
            let res;
            if (body?.action === "use_all") {
                const { feedPetBulk } = await import("@/lib/marketplace/farm.js");
                const me = await db.queryOne(`SELECT featured_collectible FROM mkt_buyer WHERE id = $1`, [buyer.id]).catch(() => null);
                res = me?.featured_collectible
                    ? await feedPetBulk(buyer.id, me.featured_collectible, id || null)
                    : { ok: false, error: "no_pet_equipped" };
            } else {
                res = body?.action === "use" ? await useConsumable(buyer.id, id, target) : await buyConsumable(buyer.id, id);
            }
            if (!res.ok) return noStore(res, { status: 400 });
            return noStore({ ...res, stash: await listConsumables(buyer.id) });
        } catch (error) {
            return internalError(error, { event: "marketplace.consumables.post.failure" });
        }
    });
}
