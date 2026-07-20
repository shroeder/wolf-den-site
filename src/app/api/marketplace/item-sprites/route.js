import { NextResponse } from "next/server";

import { itemSpriteMap } from "@/lib/marketplace/item-sprites.js";

export const runtime = "nodejs";

// Public {itemId → sprite URL} map for gear art. Static assets, so cache hard at the edge; the client
// fetches this once and renders <img> in place of the react-icons glyph wherever an item is shown.
export async function GET() {
    const map = await itemSpriteMap().catch(() => ({}));
    return NextResponse.json(
        { sprites: map },
        { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } }
    );
}
