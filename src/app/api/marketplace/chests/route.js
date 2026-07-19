import { after, NextResponse } from "next/server";

import { getChests, openChest } from "@/lib/marketplace/chests.js";
import { grantRandomDropBadge } from "@/lib/marketplace/badges.js";
import { bumpQuestProgress } from "@/lib/marketplace/quests.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET — the member's loot chests by tier (grants any owed by level-ups first).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/chests", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            return noStore({ chests: await getChests(buyer.id) });
        } catch (error) {
            return internalError(error, { event: "marketplace.chests.get.failure" });
        }
    });
}

// POST — open one chest. Body: { tier }. Returns the reveal (item or gold) + updated chest list.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/chests", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const res = await openChest(buyer.id, String(body?.tier || ""));
            if (!res.ok) return noStore({ error: res.error }, { status: 400 });
            after(() => bumpQuestProgress(buyer.id, "chest_open", 1));
            // Rare bonus: a small chance a chest also coughs up a drop-only badge — return it so the
            // reveal can celebrate it inline (grant is cheap; awaited so it rides the same response).
            const badgeDrop = Math.random() < 0.04 ? await grantRandomDropBadge(buyer.id).catch(() => null) : null;
            return noStore({ ...res, badgeDrop, chests: await getChests(buyer.id) });
        } catch (error) {
            return internalError(error, { event: "marketplace.chests.open.failure" });
        }
    });
}
