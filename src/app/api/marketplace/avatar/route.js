import { after, NextResponse } from "next/server";

import { AVATAR_FIELDS, sanitizeAvatarConfig } from "@/lib/marketplace/avatar-options.js";
import { generateAvatarSvg, renderAvatarPng } from "@/lib/marketplace/avatar-render.js";
import { generateBuyerSprite, heroRedrawQuote, setSpriteLock } from "@/lib/marketplace/avatar-sprite.js";
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

            // Redrawing an EXISTING hero costs gold. The first sprite is still free and still drawn by the
            // cron — charging for that would be charging to have a face. What's paid for is re-rolling the
            // look, which used to happen automatically on any gear change, once a day, forever.
            // No "redraw" action. The paid re-roll was removed from the UI, and leaving the endpoint up
            // would leave a gold-spending action reachable by anyone willing to post JSON at it.
            if (body?.action === "redrawQuote") return noStore(await heroRedrawQuote(buyer.id));
            // Freeze the hero you have, or let gear change it again. Asked for by @Jinxx.
            if (body?.action === "lock") return noStore(await setSpriteLock(buyer.id, Boolean(body?.locked)));

            const config = body?.config ? sanitizeAvatarConfig(body.config) : null;
            const profile = await setAvatarConfig(buyer.id, config);
            // NOTE: we intentionally do NOT generate the sprite here. setAvatarConfig bumps avatar_updated_at,
            // so the NIGHTLY sprite cron redraws it — keeping OpenAI image generation to once/night, not on
            // every avatar save. (New/changed looks reflect in the boss fight after the next nightly run.)
            return noStore({ profile });
        } catch (error) {
            return internalError(error, { event: "marketplace.avatar.save.failure" });
        }
    });
}
