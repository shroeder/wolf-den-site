import { NextResponse } from "next/server";

import { generateMissingPetSpriteLevels, detectPetSpriteLevelFacings } from "@/lib/marketplace/pet-sprite.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(request) {
    const expected = process.env.CRON_SECRET;
    if (!expected) return false;
    return (request.headers.get("authorization") || "") === `Bearer ${expected}`;
}

// TEMPORARY one-time backfill: generate the evolved (Lv2–5) pet battle sprites a small batch at a time,
// driven by a */5 cron (see vercel.json). Each run stays well under the function timeout (5 gpt-image-1
// calls ≈ 3–4 min). No self-continuation, so two runs never overlap and re-generate the same tier.
// REMOVE this route + its cron entry once mkt_pet_sprite_level is full.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/pet-sprite-levels", async ({ logger, internalError }) => {
        try {
            if (!isAuthorized(request)) {
                logger.warn("pet_sprite_levels.unauthorized");
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }
            const gen = await generateMissingPetSpriteLevels(5);
            const facing = await detectPetSpriteLevelFacings(6).catch(() => null);
            return NextResponse.json({ success: true, ...gen, facing });
        } catch (error) {
            return internalError(error, { event: "pet_sprite_levels.backfill.failure" });
        }
    });
}
