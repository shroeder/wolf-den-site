import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { discordConfig, exchangeCode, fetchDiscordUserId, isInGuild, linkDiscord } from "@/lib/marketplace/discord.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Discord OAuth callback: verify state, confirm the user is in our server, then link + grant join XP.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/discord/callback", async ({ logger }) => {
        const url = new URL(request.url);
        const origin = url.origin;
        const back = (status) => {
            const res = NextResponse.redirect(`${origin}/marketplace/profile?discord=${status}`);
            res.cookies.delete("discord_oauth_state");
            return res;
        };

        const buyer = await getAuthenticatedBuyer();
        if (!buyer) return back("signin");

        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const cookieState = request.cookies.get("discord_oauth_state")?.value;
        if (!code || !state || !cookieState || state !== cookieState) return back("error");

        const cfg = discordConfig();
        if (!cfg.enabled) return back("unavailable");

        try {
            const token = await exchangeCode({ ...cfg, code, redirectUri: `${origin}/api/marketplace/discord/callback` });
            if (!token) return back("error");
            if (!(await isInGuild(token, cfg.guildId))) return back("notmember");
            const discordUserId = await fetchDiscordUserId(token);
            if (!discordUserId) return back("error");

            const result = await linkDiscord(buyer.id, discordUserId);
            if (!result.ok) return back(result.reason || "error");
            return back(result.awarded ? "linked" : "already");
        } catch (error) {
            logger.warn("marketplace.discord.callback.failure", { message: error instanceof Error ? error.message : "unknown" });
            return back("error");
        }
    });
}
