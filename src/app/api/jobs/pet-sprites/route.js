import { NextResponse } from "next/server";

import { generateMissingPetSprites } from "@/lib/marketplace/pet-sprite.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // a few AI images per run

function isAuthorized(request) {
    const expected = process.env.CRON_SECRET;
    if (!expected) return false;
    return (request.headers.get("authorization") || "") === `Bearer ${expected}`;
}

// Generates a few missing pet battle sprites per run until the whole set exists, then no-ops.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/pet-sprites", async ({ logger, internalError }) => {
        try {
            if (!isAuthorized(request)) {
                logger.warn("pet_sprites.unauthorized");
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }
            return NextResponse.json({ success: true, ...(await generateMissingPetSprites(3)) });
        } catch (error) {
            return internalError(error, { event: "pet_sprites.run.failure" });
        }
    });
}
