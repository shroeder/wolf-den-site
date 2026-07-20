import { NextResponse } from "next/server";

import { consumableSpriteMap } from "@/lib/marketplace/consumable-sprites.js";

export const runtime = "nodejs";

// Public {consumableId → sprite URL} map. Static art, cached hard at the edge; the client fetches it once
// and renders the sprite in place of the emoji wherever a consumable is shown.
export async function GET() {
    const sprites = await consumableSpriteMap().catch(() => ({}));
    return NextResponse.json({ sprites }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } });
}
