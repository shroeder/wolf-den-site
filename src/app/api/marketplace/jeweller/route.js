import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { cutSocket, getJewellerState, pullGem, setGem } from "@/lib/marketplace/jeweller.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (b, i) => NextResponse.json(b, { ...i, headers: { "Cache-Control": "no-store", ...(i?.headers || {}) } });

// The bench. Every action re-derives what is legal from the same pure catalog the screen renders from and
// re-reads the row before it writes — a socket costs real gold and a gem is a real drop, so nothing here
// trusts a number that arrived from a client.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/jeweller", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return noStore({ unlocked: false });
            return noStore(await getJewellerState(buyer.id));
        } catch (error) {
            return internalError(error, { event: "jeweller.get.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/jeweller", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const b = await request.json().catch(() => ({}));
            const action = String(b?.action || "");
            const itemId = String(b?.itemId || "");
            const idx = Number(b?.idx) || 0;
            let res;
            if (action === "cut") res = await cutSocket(buyer.id, itemId);
            else if (action === "set") res = await setGem(buyer.id, itemId, String(b?.gemId || ""), idx);
            else if (action === "pull") res = await pullGem(buyer.id, itemId, idx);
            else return noStore({ error: "bad_action" }, { status: 400 });
            return noStore({ ...res, ...(await getJewellerState(buyer.id)) });
        } catch (error) {
            return internalError(error, { event: "jeweller.post.failure" });
        }
    });
}
