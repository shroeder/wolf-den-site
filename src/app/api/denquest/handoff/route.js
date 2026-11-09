import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { mintHandoffCode } from "@/lib/marketplace/denquest-handoff.js";
import { denQuestOpen } from "@/lib/marketplace/owner.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── STEP 1 AND 2 OF THE HANDOFF ──────────────────────────────────────────────────────────────────────────────
// Visited on the WOLF DEN domain, which is the only origin that can see the session cookie. Mints a single-use
// code and bounces the browser to the game domain carrying it.
//
// ⚠️ THE DESTINATION IS A CONSTANT, NEVER A QUERY PARAMETER. A `?return=` that is honoured is an open
// redirect, and an open redirect that carries a credential hands sessions to whoever crafts the link. There is
// exactly one place this can send you.
const GAME_ORIGIN = process.env.DENQUEST_ORIGIN || "https://denquestonline.com";

export async function GET(request) {
    return withRequestLogging(request, "GET /api/denquest/handoff", async ({ internalError, log }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) {
                // Not signed in: send them to sign in, not to an error.
                return NextResponse.redirect(new URL("/marketplace", request.url));
            }
            if (buyer.banned_at || !denQuestOpen(buyer.id)) {
                return NextResponse.redirect(new URL("/marketplace", request.url));
            }
            const code = await mintHandoffCode(buyer.id);
            log?.info?.("denquest.handoff.minted", { buyerId: buyer.id });
            return NextResponse.redirect(`${GAME_ORIGIN}/enter?c=${code}`, {
                headers: { "Cache-Control": "no-store" },
            });
        } catch (error) {
            return internalError(error, { event: "denquest.handoff.failure" });
        }
    });
}
