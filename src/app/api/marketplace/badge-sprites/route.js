import { NextResponse } from "next/server";

import { badgeSpriteMap } from "@/lib/marketplace/badge-sprites.js";

export const runtime = "nodejs";

// Public {badgeSlug → sprite URL} map. Static art, so cache hard at the edge; the client fetches this once and
// renders <img> in place of the badge emoji wherever a badge is shown.
export async function GET() {
    const map = await badgeSpriteMap().catch(() => ({}));
    return NextResponse.json(
        { sprites: map },
        { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } }
    );
}
