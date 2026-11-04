import { after, NextResponse } from "next/server";

import { AVATAR_FIELDS, sanitizeAvatarConfig } from "@/lib/marketplace/avatar-options.js";
import { generateAvatarSvg, renderAvatarPng } from "@/lib/marketplace/avatar-render.js";
import { deleteSprite, favouriteSprite, generateBuyerSprite, heroRedrawQuote, requestSpriteDraw,
    setSpriteLock, spriteShelf, wearSprite } from "@/lib/marketplace/avatar-sprite.js";
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
            //
            // ⚠️ THE LOCK IS A NO-OP NOW AND THE ENDPOINT STAYS ANYWAY. Nothing redraws a hero behind the
            // member's back any more, so there is nothing to freeze -- but an app or a cached page that
            // still posts {action:"lock"} must not 400 at somebody for using the screen they had open.
            // It writes the flag, nothing reads it, and it comes out when the column does.
            if (body?.action === "lock") return noStore(await setSpriteLock(buyer.id, Boolean(body?.locked)));

            // ── THE SHELF ────────────────────────────────────────────────────────────────────────────
            // Read it, wear one, star one, throw one away, ask for a new one. Five verbs against one lib, because every
            // rule about what a member owns and when a draw is allowed lives in avatar-sprite.js -- a
            // route that re-decided any of it would be a second answer. Same shape as the pose shelf.
            if (body?.action === "shelf") return noStore(await spriteShelf(buyer.id));
            if (body?.action === "wear") {
                const r = await wearSprite(buyer.id, body?.sprite);
                return noStore({ ...r, ...(await spriteShelf(buyer.id)) }, { status: r.ok ? 200 : 400 });
            }
            if (body?.action === "favourite") {
                const r = await favouriteSprite(buyer.id, body?.sprite, Boolean(body?.on));
                return noStore({ ...r, ...(await spriteShelf(buyer.id)) }, { status: r.ok ? 200 : 400 });
            }
            // Throw one away. The lib owns both rules -- you always keep one, and deleting the worn hero
            // moves you onto another first -- so this is the same thin pass-through as wear and favourite.
            if (body?.action === "delete") {
                const r = await deleteSprite(buyer.id, body?.sprite);
                return noStore({ ...r, ...(await spriteShelf(buyer.id)) }, { status: r.ok ? 200 : 400 });
            }
            // ⚠️ THE ONLY THING ON THIS ROUTE THAT SPENDS MONEY, AND IT IS AWAITED. A draw is ~4c of
            // OpenAI and takes most of a minute; backgrounding it would hand the member a reply before
            // there is anything to show, and Vercel kills un-awaited async anyway.
            if (body?.action === "draw") {
                const r = await requestSpriteDraw(buyer.id);
                return noStore({ ...r, ...(await spriteShelf(buyer.id)) }, { status: r.ok ? 200 : 400 });
            }

            const config = body?.config ? sanitizeAvatarConfig(body.config) : null;
            const profile = await setAvatarConfig(buyer.id, config);
            // ⚠️ NOTHING IS DRAWN HERE, AND NOTHING IS DRAWN LATER EITHER. This note used to say the
            // nightly cron would pick the change up. It will not any more: the job draws a FIRST hero and
            // stops. Changing your avatar marks the hero you are wearing as out of date, the gear screen
            // says so, and the member decides whether that is worth a new draw.
            return noStore({ profile });
        } catch (error) {
            return internalError(error, { event: "marketplace.avatar.save.failure" });
        }
    });
}
