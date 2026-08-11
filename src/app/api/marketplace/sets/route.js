import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { setLoanedPiece } from "@/lib/marketplace/collection-owned.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { action: "loan", pieceId } — The Loaned Exhibit.
//
// The sets page itself is a server component and needs no endpoint to READ; this exists only so the one member
// wearing the piece can change which exhibit they are borrowing. setLoanedPiece is the gate — it refuses anyone
// without the power and refuses a piece already owned — so this route never has to know which item grants what.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/sets", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            if (body?.action !== "loan") return NextResponse.json({ error: "bad_action" }, { status: 400 });
            const res = await setLoanedPiece(buyer.id, String(body?.pieceId || ""));
            return NextResponse.json(res, { status: res.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.sets.loan.failure" });
        }
    });
}
