import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { buildAuthUrl, discordConfig } from "@/lib/marketplace/discord.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Kick off the Discord OAuth flow. Must be signed in. Sets a short-lived state cookie for CSRF.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/discord/start", async () => {
        const origin = new URL(request.url).origin;
        const buyer = await getAuthenticatedBuyer();
        if (!buyer) return NextResponse.redirect(`${origin}/marketplace/profile?discord=signin`);

        const cfg = discordConfig();
        if (!cfg.enabled) return NextResponse.redirect(`${origin}/marketplace/profile?discord=unavailable`);

        const state = randomBytes(16).toString("hex");
        const redirectUri = `${origin}/api/marketplace/discord/callback`;
        const res = NextResponse.redirect(buildAuthUrl({ clientId: cfg.clientId, redirectUri, state }));
        res.cookies.set("discord_oauth_state", state, {
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            maxAge: 600,
            path: "/",
        });
        return res;
    });
}
