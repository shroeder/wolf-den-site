import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { packPoolSummary, resumePendingOpen } from "@/lib/marketplace/packs.js";
import { getStoreCredit } from "@/lib/marketplace/store-credit.js";
import { vaultOpenFor } from "@/lib/marketplace/vault-gate.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) =>
    NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

// Door 4 of 9 (docs/virtual-packs-and-the-card-vault.md §16.2). The pool itself is PUBLIC — /mystery-bags has
// listed it card by card for months and this feature does not take that away. What is gated is the ability to
// open one online, so a signed-out or un-invited reader gets the board and nothing about the button.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/packs", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer || !vaultOpenFor(buyer.id)) {
                return noStore({ error: "Not found." }, { status: 404 });
            }

            const [pool, balanceCents, pending] = await Promise.all([
                packPoolSummary(),
                getStoreCredit(buyer.id),
                resumePendingOpen(buyer.id),
            ]);

            return noStore({
                open: true,
                pool,
                balanceCents,
                canOpen: pool.remaining > 0 && balanceCents >= pool.priceCents,
                shortfallCents: Math.max(0, pool.priceCents - balanceCents),
                // An open the member walked away from mid-reveal. The card is already theirs and already paid
                // for; the only thing outstanding is which of the two buttons they press.
                pending,
            });
        } catch (error) {
            return internalError(error, { event: "packs.list.failure" });
        }
    });
}
