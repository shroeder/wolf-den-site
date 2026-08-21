import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { getCasinoState, moveCasino, spinSlot } from "@/lib/marketplace/casino.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// ── OWNER ONLY, AND ENFORCED HERE ────────────────────────────────────────────────────────────────────────────
// The town door is hidden for everybody else (GATED_BUILDINGS, gate: "owner"), but a hidden link is not a
// gate — the address is guessable and this endpoint moves GOLD. So the check lives on the server, on every
// verb, and the page does it again for the render. A door that is only closed on the screen is not closed.
const gate = async () => {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer || !isOwner(buyer.id)) return null;
    return buyer;
};

export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/casino", async ({ internalError }) => {
        try {
            const buyer = await gate();
            if (!buyer) return noStore({ open: false });
            return noStore({ open: true, ...(await getCasinoState(buyer.id)) });
        } catch (error) {
            return internalError(error, { event: "marketplace.casino.state.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/casino", async ({ internalError }) => {
        try {
            const buyer = await gate();
            if (!buyer) return noStore({ ok: false, error: "closed" }, { status: 403 });
            const b = await request.json().catch(() => ({}));
            switch (String(b?.action || "")) {
                // Walking. Fire-and-forget from the client's point of view, but it still answers so a failed
                // move does not leave somebody convinced they are somewhere they are not.
                case "move": return noStore(await moveCasino(buyer.id, { x: b?.x, y: b?.y, facing: b?.facing }));
                // ── THE PULL ── the bet is validated and taken server-side. `bet` arriving from a POST body is
                // a number somebody can type, so it is clamped in spinSlot rather than trusted here.
                case "spin": return noStore(await spinSlot(buyer.id, { bet: b?.bet }));
                default: return noStore({ ok: false, error: "bad_action" }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "marketplace.casino.action.failure" });
        }
    });
}
