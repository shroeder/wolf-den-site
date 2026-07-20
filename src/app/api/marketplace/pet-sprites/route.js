import { NextResponse } from "next/server";

import { getPetSpriteData } from "@/lib/marketplace/pet-sprite.js";

export const runtime = "nodejs";

// Public {petId → {url, flip}} map of pet battle sprites. Static art, cached hard at the edge; the client
// fetches it once and renders the sprite in place of the react-icons glyph wherever a pet is shown.
export async function GET() {
    const sprites = await getPetSpriteData().catch(() => ({}));
    return NextResponse.json(
        { sprites },
        { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } }
    );
}
