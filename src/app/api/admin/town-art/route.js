import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { generateTownArt, townArtStatus } from "@/lib/marketplace/town-art.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET — which town art assets exist yet.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/town-art", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            return noStore(await townArtStatus());
        } catch (error) {
            return internalError(error, { event: "admin.town_art.status.failure" });
        }
    });
}

// POST { key } — generate (or reroll) one town art asset (background or a building sprite).
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/town-art", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            const key = String(body?.key || "");
            const url = await generateTownArt(key);
            return noStore({ ok: true, key, url });
        } catch (error) {
            return internalError(error, { event: "admin.town_art.generate.failure" });
        }
    });
}
