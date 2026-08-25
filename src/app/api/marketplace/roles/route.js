import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { standingFor, setRole, channelsFor, VIP_CENTS } from "@/lib/marketplace/roles.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) =>
    NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

// GET — what this member has earned, what they are currently wearing, and how far off the next one is.
//
// The list is computed server-side from the owner list, the staff list, lifetime spend and level. Nothing here
// is ever accepted from the client: the picker below can only choose FROM this list, and PUT re-derives it
// rather than trusting what came back.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/roles", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return noStore({ ok: false, error: "not_signed_in" }, { status: 401 });
            const st = await standingFor(buyer.id);
            return noStore({
                ok: true,
                level: st.level,
                roles: st.roles,
                chosen: st.chosen,
                channels: channelsFor(buyer.id, st.roles),
                // What VIP costs and how close they are. Shown as progress rather than as a locked row with
                // no number on it — a threshold nobody can see is a threshold nobody chases.
                spentCents: st.spentCents,
                vipCents: VIP_CENTS,
            });
        } catch (error) {
            return internalError(error, { event: "marketplace.roles.get.failure" });
        }
    });
}

// PUT { role } — wear one of them. Refused unless it is one this member has actually earned.
export async function PUT(request) {
    return withRequestLogging(request, "PUT /api/marketplace/roles", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return noStore({ ok: false, error: "not_signed_in" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const res = await setRole(buyer.id, String(body?.role || ""));
            return noStore(res, { status: res.ok ? 200 : 400 });
        } catch (error) {
            return internalError(error, { event: "marketplace.roles.put.failure" });
        }
    });
}
