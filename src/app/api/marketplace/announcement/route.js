import { NextResponse } from "next/server";

import { getPendingAnnouncement, markAnnouncementSeen } from "@/lib/marketplace/announcements.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init) => NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store" } });

// GET — the one announcement this member hasn't seen yet, or null.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/announcement", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return noStore({ announcement: null });
            return noStore({ announcement: await getPendingAnnouncement(buyer.id) });
        } catch (error) {
            return internalError(error, { event: "marketplace.announcement.get.failure" });
        }
    });
}

// POST { key } — dismiss it so it never shows again.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/announcement", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return noStore({ error: "not_signed_in" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            return noStore(await markAnnouncementSeen(buyer.id, body?.key));
        } catch (error) {
            return internalError(error, { event: "marketplace.announcement.seen.failure" });
        }
    });
}
