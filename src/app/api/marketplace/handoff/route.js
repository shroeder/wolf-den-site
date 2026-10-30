import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { createHandoffClaim } from "@/lib/marketplace/handoff.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) =>
    Response.json(body, { ...init, headers: { ...(init.headers || {}), "Cache-Control": "no-store" } });

// POST — a member wants the code they show at the counter. { kind: "vault" } or { kind: "order", orderId }.
// Mints nothing that can be spent; see the note at the top of handoff.js.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/handoff", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer?.id) return noStore({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const res = await createHandoffClaim({
                buyerId: buyer.id,
                kind: String(body?.kind || ""),
                orderId: body?.orderId ? String(body.orderId) : null,
            });
            return noStore(res, { status: res.ok ? 200 : 400 });
        } catch (error) {
            return internalError(error, { event: "marketplace.handoff.mint.failure" });
        }
    });
}
