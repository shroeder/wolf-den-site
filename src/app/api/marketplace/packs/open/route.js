import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { openPack } from "@/lib/marketplace/packs.js";
import { isTrustedWriteRequest } from "@/lib/request-security";
import { vaultOpenFor } from "@/lib/marketplace/vault-gate.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) =>
    NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

// ── DOOR 5 OF 9, AND THE ONE THAT MATTERS ────────────────────────────────────────────────────────────────────
// This is the PLAY path. The casino launch removed three owner checks, all three of them correct, and members
// still could not play the slots — because a fourth gate sat inside spinSlot5 rather than at the door. The
// inverse of that bug is this endpoint: a door that is hidden in the UI but open to a POST.
//
// So the gate is checked HERE, on the server, on the verb that spends money and consumes a real sealed bag —
// and again inside openPack(), which is not redundancy for its own sake. The lib function is callable from a
// script, a job or a future admin tool, and none of those come through this route.
//
// The error messages are deliberately plain. A member who cannot open a pack wants to know whether they are
// short of credit or whether the shop is out of bags, and either answer is more use than "something broke".
const MESSAGES = {
    closed: "Opening packs online isn't available yet.",
    pool_empty: "We're out of packs right now — check back soon.",
    insufficient_credit: "You don't have enough store credit to open a pack.",
    unavailable: "That pack just went to someone at the counter. Try again.",
    no_price: "We can't confirm the pack price right now — try again shortly.",
    // A category pack whose pool shut itself — one card carrying its value, or too little left to be a
    // mystery. "Not right now" rather than an error, because nothing is wrong: we decided not to sell it.
    pool_closed: "That pack is resting — check back soon.",
    no_such_pool: "That pack doesn't exist.",
    // Not "we're out" — the pool is full and we could not take a card out of it. Says so, because the two
    // get fixed in completely different places.
    claim_failed: "We couldn't pull a card just then. Nothing was charged — try again.",
};

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/packs/open", async ({ logger, internalError }) => {
        if (!isTrustedWriteRequest(request)) {
            return noStore({ error: "Invalid request origin." }, { status: 403 });
        }
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return noStore({ error: "Sign in to open a pack." }, { status: 401 });
            // The per-pool gate lives in openPack; this one keeps a signed-in non-member off the door at all.
            if (!vaultOpenFor(buyer.id)) return noStore({ error: "Not found." }, { status: 404 });

            // ⚠️ THE POOL IS A KEY AND NOTHING ELSE. openPack resolves it against the registry and asks
            //    that pool's own gate; an unknown key is refused rather than defaulting to the bags, because
            //    a typo that silently charges somebody for a different product is worse than an error.
            const body = await request.json().catch(() => ({}));
            const result = await openPack({ buyerId: buyer.id, pool: String(body?.pool || "bags") });

            if (!result.ok) {
                logger.info("packs.open.refused", { buyerId: buyer.id, reason: result.error });
                return noStore(
                    {
                        error: MESSAGES[result.error] || "Couldn't open a pack.",
                        code: result.error,
                        priceCents: result.priceCents ?? null,
                        balanceCents: result.balanceCents ?? null,
                    },
                    { status: result.error === "closed" ? 404 : 409 }
                );
            }

            return noStore({ ok: true, resumed: Boolean(result.resumed), ...result.open });
        } catch (error) {
            return internalError(error, { event: "packs.open.failure" });
        }
    });
}
