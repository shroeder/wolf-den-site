import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getCompendium } from "@/lib/marketplace/compendium.js";
import { itemSpriteMap } from "@/lib/marketplace/item-sprites.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — every item in the game, whether this member has ever held it, and what the milestones have paid.
//
// The sprite map is merged HERE rather than inside getCompendium, so the pure module stays pure and testable
// and the one database read for art happens once for the whole catalogue instead of per tile.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/compendium", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            const [data, sprites] = await Promise.all([
                getCompendium(buyer?.id || null),
                itemSpriteMap().catch(() => ({})),
            ]);
            return NextResponse.json({
                signedIn: Boolean(buyer),
                ...data,
                items: data.items.map((i) => ({ ...i, art: sprites[i.id] || null })),
            }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.compendium.failure" });
        }
    });
}
