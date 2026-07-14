import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getProfile, updateProfile } from "@/lib/marketplace/profile.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// The signed-in user's own profile.
export async function GET() {
    return withRequestLogging(null, "GET /api/marketplace/profile", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            return noStore({ profile: await getProfile(buyer.id) });
        } catch (error) {
            return internalError(error, { event: "marketplace.profile.get.failure" });
        }
    });
}

// Update name + handle.
export async function PATCH(request) {
    return withRequestLogging(request, "PATCH /api/marketplace/profile", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const profile = await updateProfile(buyer.id, {
                firstName: body?.firstName,
                lastName: body?.lastName,
                alias: body?.alias,
            });
            return noStore({ profile });
        } catch (error) {
            // updateProfile throws user-facing messages for a bad/taken handle.
            if (error?.message && !/database|query/i.test(error.message)) {
                return noStore({ error: error.message }, { status: 400 });
            }
            return internalError(error, { event: "marketplace.profile.update.failure" });
        }
    });
}
