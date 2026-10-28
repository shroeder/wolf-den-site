import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { discoverOpenFor } from "@/lib/marketplace/discover-gate.js";
import { DISCOVER_ERAS, DISCOVER_PRICES, discoverPage, discoverRows } from "@/lib/marketplace/discover.js";
import { getStoreCredit } from "@/lib/marketplace/store-credit.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) =>
    NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

// Stage one of the rollout: owner only. See discover-gate.js — the condition is IMPORTED, never re-derived.
//
// Two shapes on one route:
//   no `row`  -> the whole deck, first page of every category
//   `row=X`   -> the next page of ONE category, for the load-ahead
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/discover", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer || !discoverOpenFor(buyer.id)) return noStore({ open: false }, { status: 403 });

            const sp = new URL(request.url).searchParams;
            const filters = {
                era: sp.get("era") || "any",
                price: sp.get("price") || "any",
                q: sp.get("q") || "",
            };

            const row = sp.get("row");
            if (row) {
                const items = await discoverPage({
                    ...filters,
                    category: row,
                    offset: Number(sp.get("offset")) || 0,
                });
                return noStore({ open: true, items });
            }

            return noStore({
                open: true,
                rows: await discoverRows(filters),
                // ⚠️ SENT, NOT DERIVED. The Buy-with-credit button disables itself when the balance cannot
                //    cover the card; a client guessing at the balance would offer a purchase the server is
                //    about to refuse.
                creditCents: await getStoreCredit(buyer.id).catch(() => 0),
                eras: DISCOVER_ERAS,
                prices: DISCOVER_PRICES,
            });
        } catch (error) {
            return internalError(error, { event: "discover.list.failure" });
        }
    });
}
