import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { generateSceneImage } from "@/lib/marketplace/openai-image.js";
import { invalidate } from "@/lib/marketplace/shared-cache.js";
import { getSetting, setSetting } from "@/lib/settings.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PROMPT =
    "An ornate dark-fantasy RPG character/equipment panel background: aged stone and carved gold filigree, moody torch-lit ambience, subtle vignette, a shadowed alcove where a hero would stand. Rich, atmospheric, painterly game-UI backdrop, NO characters, no text, no icons, no UI widgets, no border.";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET — current backdrop url. POST — generate a new equipment-screen backdrop and store it.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/equip-backdrop", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            return noStore({ url: await getSetting("equip_backdrop_url") });
        } catch (error) {
            return internalError(error, { event: "admin.equip_backdrop.get.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/equip-backdrop", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const url = await generateSceneImage(PROMPT, { pathPrefix: "marketplace/equip-bg", meta: { origin: "admin", label: "Equip backdrop" } });
            await setSetting("equip_backdrop_url", url);
            invalidate("art:equipBackdrop");   // paired with the cache on the inventory page
            return noStore({ ok: true, url });
        } catch (error) {
            return internalError(error, { event: "admin.equip_backdrop.generate.failure" });
        }
    });
}
