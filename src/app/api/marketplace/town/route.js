import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { contributeTownGold, getTownState, moveTown, sendTownChat, setTownTyping } from "@/lib/marketplace/town.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — the town state (you + nearby players + buildings). Owner-gated during the build.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/town", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer || !isOwner(buyer.id)) return NextResponse.json({ signedIn: Boolean(buyer), owner: false }, { headers: { "Cache-Control": "no-store" } });
            return NextResponse.json(await getTownState(buyer.id), { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.town.state.failure" });
        }
    });
}

// POST — walk ({ x, y, facing }), chat ({ action:"chat", body }), or typing ({ action:"typing" }).
// Owner-gated during the build.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/town", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            let res;
            if (body?.action === "chat") res = await sendTownChat(buyer.id, body?.body);
            else if (body?.action === "typing") res = await setTownTyping(buyer.id);
            else if (body?.action === "contribute") res = await contributeTownGold(buyer.id, body?.amount);
            else res = await moveTown(buyer.id, { x: body?.x, y: body?.y, facing: body?.facing });
            if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.error === "forbidden" ? 403 : 400 });
            return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.town.action.failure" });
        }
    });
}
