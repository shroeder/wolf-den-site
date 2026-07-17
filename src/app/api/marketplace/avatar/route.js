import { after, NextResponse } from "next/server";

import { AVATAR_FIELDS, sanitizeAvatarConfig } from "@/lib/marketplace/avatar-options.js";
import { generateAvatarSvg, renderAvatarPng } from "@/lib/marketplace/avatar-render.js";
import { generateBuyerSprite } from "@/lib/marketplace/avatar-sprite.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { setAvatarConfig } from "@/lib/marketplace/profile.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/marketplace/avatar?<options> — render the avatar SVG. Public (avatars show to everyone) and
// stateless: the query fully determines the image, so it caches immutably. Bad/missing values fall back
// to defaults via sanitize, so this can never error on crafted input.
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const config = {};
    for (const key of Object.keys(AVATAR_FIELDS)) {
        if (searchParams.has(key)) config[key] = searchParams.get(key);
    }
    const clean = sanitizeAvatarConfig(config);
    // format=png rasterizes the avatar (used as the reference image for AI sprite generation).
    if (searchParams.get("format") === "png") {
        const png = await renderAvatarPng(clean, Number(searchParams.get("size")) || 1024);
        return new Response(png, {
            headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" },
        });
    }
    const svg = generateAvatarSvg(clean);
    return new Response(svg, {
        headers: {
            "Content-Type": "image/svg+xml; charset=utf-8",
            "Cache-Control": "public, max-age=31536000, immutable",
        },
    });
}

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// POST — save the signed-in member's built avatar. Body: { config: {...} } to set, or { config: null } to
// clear it (revert to their uploaded photo / initials).
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/avatar", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const config = body?.config ? sanitizeAvatarConfig(body.config) : null;
            const profile = await setAvatarConfig(buyer.id, config);
            // Redraw their attacking boss-sprite right now (after the response) so their new look is in the
            // fight within seconds — instead of waiting for the nightly sprite job. Best-effort.
            if (config) {
                after(async () => {
                    await generateBuyerSprite(buyer.id).catch(() => {});
                });
            }
            return noStore({ profile });
        } catch (error) {
            return internalError(error, { event: "marketplace.avatar.save.failure" });
        }
    });
}
