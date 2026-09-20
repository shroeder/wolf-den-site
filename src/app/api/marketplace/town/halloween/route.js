import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { canPreview } from "@/lib/marketplace/owner.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// Raise or lower the Halloween flag for the signed-in member. Body: { on: true | false }.
//
// ⚠️ THE GATE IS CHECKED HERE, NOT ONLY IN THE UI. The Town only renders the toggle for members who may use it,
// but a button that is not drawn is not a permission — anybody can POST this by hand. Deciding it again on the
// server is the only thing that actually stops the whole plaza being dressed by someone who was never invited.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/town/halloween", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            if (!canPreview("halloween", buyer.id)) return noStore({ error: "not_available" }, { status: 403 });

            const body = await request.json().catch(() => ({}));
            const on = body?.on === true;
            await db.query(`UPDATE mkt_buyer SET town_halloween = $1 WHERE id = $2`, [on, buyer.id]);
            return noStore({ ok: true, on });
        } catch (error) {
            return internalError(error, { event: "marketplace.town.halloween.failure" });
        }
    });
}
