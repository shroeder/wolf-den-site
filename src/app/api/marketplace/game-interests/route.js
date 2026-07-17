import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { dismissFnmCta, setGameInterests } from "@/lib/marketplace/profile.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Save the member's game interests, or dismiss the FNM CTA.
// Body: { interests: ["magic", ...] }  OR  { dismissFnm: true }.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/game-interests", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const profile = body?.dismissFnm ? await dismissFnmCta(buyer.id) : await setGameInterests(buyer.id, body?.interests);
            return noStore({ profile });
        } catch (error) {
            if (error?.message && !/database|query/i.test(error.message)) {
                return noStore({ error: error.message }, { status: 400 });
            }
            return internalError(error, { event: "marketplace.game_interests.failure" });
        }
    });
}
