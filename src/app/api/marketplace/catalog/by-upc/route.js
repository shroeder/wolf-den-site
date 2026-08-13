import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resolve a scanned barcode (UPC) to catalog products. Matches ignoring leading zeros (UPC-A vs
// EAN-13). Public — used by the vendor "scan to list" flow.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/catalog/by-upc", async ({ internalError }) => {
        try {
            const raw = new URL(request.url).searchParams.get("upc") || "";
            const upc = raw.replace(/\D/g, "");
            if (upc.length < 6) {
                return NextResponse.json({ results: [] });
            }
            // ── THE CHEAPEST MATCH IS THE ONE IN YOUR HAND ──────────────────────────────────────────────
            // The ORDER BY was `market_price DESC`, and 553 of the 2,230 barcodes in the catalog match more
            // than one row: TCGplayer carries the same UPC on a pack, its display and its case. Dearest-first
            // meant scanning a Fusion Strike Sleeved Booster PACK ($28.12) returned the CASE ($3,080.82), and
            // the restock screen takes the first row — so the price looked wildly wrong, which reads as stale.
            // Worst seen: a $44.80 Evolving Skies pack resolving to a $2,434.86 box.
            //
            // Cheapest first, because a barcode is nearly always physically on the smallest unit that carries
            // it; a case is the rare scan and it is one tap away in the list. Cases and displays are pushed
            // back by name too, so the ordering does not hinge on price alone.
            const rows = await db.query(
                `SELECT c.id, c.game, c.name, c.image_url, c.market_price, c.upc, s.name AS set_name
                 FROM tcg_cards c
                 JOIN tcg_sets s ON s.id = c.set_id
                 WHERE c.upc IS NOT NULL AND ltrim(c.upc, '0') = ltrim($1, '0')
                 ORDER BY (c.name ~* '(case|display)') ASC, c.market_price ASC NULLS LAST
                 LIMIT 8`,
                [upc]
            );
            return NextResponse.json({
                results: rows.map((r) => ({
                    catalogProductId: String(r.id),
                    name: r.name,
                    setName: r.set_name,
                    game: r.game,
                    imageUrl: r.image_url,
                    marketPrice: r.market_price === null ? null : Number(r.market_price),
                    upc: r.upc,
                })),
            }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.catalog.by_upc.failure" });
        }
    });
}
