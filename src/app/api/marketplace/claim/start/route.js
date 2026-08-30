import { NextResponse } from "next/server";

import { claimAtCounter, isClaimKind } from "@/lib/marketplace/counter-claim.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) =>
    NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

// ── ONE FIELD, AT THE TILL ───────────────────────────────────────────────────────────────────────────────────
// The whole of the counter path: { kind, token, email } in, a signed-in member with their points banked out.
// Every rule that makes that safe lives in claimAtCounter — in particular that a KNOWN email never receives a
// session — so this route is a shape check and nothing else. See counter-claim.js.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/claim/start", async ({ logger, internalError }) => {
        try {
            const body = await request.json().catch(() => ({}));
            const kind = String(body?.kind || "loyalty");
            if (!isClaimKind(kind)) return noStore({ error: "bad_kind" }, { status: 400 });

            const res = await claimAtCounter({
                kind,
                token: String(body?.token || "").trim(),
                email: String(body?.email || "").trim(),
            });

            // A refusal is a 200 with a reason, not a 4xx. Every one of these is a thing the person standing
            // at the counter has to READ and act on — "sign in instead", "that receipt is a day old" — and a
            // 400 invites the client to render a generic failure over the top of the actual answer.
            if (!res.ok) return noStore(res);

            logger.info("marketplace.claim.counter", { kind, buyerId: res.buyerId, redeemed: res.redeemed });
            return noStore(res);
        } catch (error) {
            return internalError(error, { event: "marketplace.claim.counter.failure" });
        }
    });
}
