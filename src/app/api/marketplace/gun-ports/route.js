import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { getSavedHulls, savePorts } from "@/lib/marketplace/gun-ports-store.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) =>
    NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

// OWNER ONLY, both ways. These coordinates decide what every member's ship looks like in a fight, so writing
// them is not a member action — and reading is gated too, because the only thing that reads this endpoint is
// the placement lab, which is owner-only itself. The battle reads the store directly, server-side.
async function gate() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) return { error: noStore({ error: "unauthorized" }, { status: 401 }) };
    if (!isOwner(buyer.id)) return { error: noStore({ error: "forbidden" }, { status: 403 }) };
    return { buyer };
}

export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/gun-ports", async ({ internalError }) => {
        try {
            const g = await gate();
            if (g.error) return g.error;
            const hulls = await getSavedHulls();
            return noStore({ saved: hulls.ports, flipped: hulls.flip });
        } catch (error) {
            return internalError(error, { event: "marketplace.gunports.get.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/gun-ports", async ({ internalError }) => {
        try {
            const g = await gate();
            if (g.error) return g.error;
            const body = await request.json().catch(() => ({}));
            const art = String(body?.art || "").trim();
            if (!art) return noStore({ error: "bad_art" }, { status: 400 });
            // An empty array is a legitimate save: it clears the hull back to the even spread. So is an empty
            // array with `flipped` set — that is a hull whose art faces the wrong way and whose guns are fine
            // where the fallback puts them.
            const res = await savePorts(art, Array.isArray(body?.ports) ? body.ports : [], g.buyer.id, body?.flipped === true);
            if (!res.ok) return noStore(res, { status: 400 });
            const hulls = await getSavedHulls();
            return noStore({ ...res, saved: hulls.ports, flippedMap: hulls.flip });
        } catch (error) {
            return internalError(error, { event: "marketplace.gunports.post.failure" });
        }
    });
}
