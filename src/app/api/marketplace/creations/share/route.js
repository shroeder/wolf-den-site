import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { creationAskability, creationShareState, offerCreation, requestCreation, respondCreationShare } from "@/lib/marketplace/creation-share.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET                → my creations + offers/asks waiting on me
// GET ?decoId=custom:12 → can I ask for a copy of that piece? (drives the button on a farm you're visiting)
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/creations/share", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const decoId = new URL(request.url).searchParams.get("decoId");
            if (decoId) return noStore(await creationAskability(buyer.id, decoId));
            return noStore(await creationShareState(buyer.id));
        } catch (error) {
            return internalError(error, { event: "marketplace.creation_share.get.failure" });
        }
    });
}

// POST { action }
//   offer   { creationId, toAlias }  — owner offers a copy
//   ask     { decoId }               — visitor asks the owner for a copy
//   respond { shareId, decision }    — accept | decline | cancel (whoever is being asked decides)
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/creations/share", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return noStore({ error: "not_signed_in" }, { status: 401 });
            const b = await request.json().catch(() => ({}));
            let res;
            if (b?.action === "offer") res = await offerCreation(buyer.id, b?.creationId, b?.toAlias);
            else if (b?.action === "ask") res = await requestCreation(buyer.id, b?.decoId);
            else if (b?.action === "respond") res = await respondCreationShare(buyer.id, b?.shareId, String(b?.decision || "decline"));
            else res = { ok: false, error: "unknown_action" };
            // Hand back fresh state so the UI never needs a second round-trip to re-render.
            const state = await creationShareState(buyer.id).catch(() => null);
            return noStore({ ...res, state }, { status: res?.ok ? 200 : 400 });
        } catch (error) {
            return internalError(error, { event: "marketplace.creation_share.post.failure" });
        }
    });
}
