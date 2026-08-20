import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { cookRecipe, cookWithPrereqs, devReset, devStock, getKitchenState, upgradeKitchen } from "@/lib/marketplace/cooking.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) => NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/cooking", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            return noStore(await getKitchenState(buyer?.id || null));
        } catch (error) {
            return internalError(error, { event: "marketplace.cooking.state.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/cooking", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer?.id) return noStore({ error: "unauthorized" }, { status: 401 });
            const b = await request.json().catch(() => ({}));
            switch (String(b?.action || "")) {
                // `withPreps` cooks any prep this dish is short of first, out of ingredients already on the
                // shelf, and reports them back as `prereqs`. Same cook underneath either way.
                case "cook": return noStore(b?.withPreps
                    ? await cookWithPrereqs(buyer.id, String(b.recipe || ""), { quality: b.quality, chain: b.chain })
                    : await cookRecipe(buyer.id, String(b.recipe || ""), { quality: b.quality, chain: b.chain }));
                case "upgrade": return noStore(await upgradeKitchen(buyer.id, String(b.track || "")));
                // Owner-only test tools — the gate is inside, not here.
                case "dev_stock": return noStore(await devStock(buyer.id, String(b.what || "all")));
                case "dev_reset": return noStore(await devReset(buyer.id));
                default: return noStore({ error: "bad_action" }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "marketplace.cooking.act.failure" });
        }
    });
}
