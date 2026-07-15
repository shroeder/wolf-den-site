import "server-only";

import { db } from "@/lib/db";
import { awardXp } from "@/lib/marketplace/xp.js";

// Discord account linking. A member connects their Discord (OAuth); if they're in our server we grant a
// one-time XP bonus and remember the link. Inert until the DISCORD_* env vars are set.

const DISCORD_API = "https://discord.com/api";

export function discordConfig() {
    const clientId = process.env.DISCORD_CLIENT_ID || "";
    const clientSecret = process.env.DISCORD_CLIENT_SECRET || "";
    const guildId = process.env.DISCORD_GUILD_ID || "";
    return { clientId, clientSecret, guildId, enabled: Boolean(clientId && clientSecret && guildId) };
}

export function buildAuthUrl({ clientId, redirectUri, state }) {
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "identify guilds",
        state,
    });
    return `${DISCORD_API}/oauth2/authorize?${params.toString()}`;
}

export async function exchangeCode({ clientId, clientSecret, code, redirectUri }) {
    const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
    });
    const res = await fetch(`${DISCORD_API}/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
    });
    if (!res.ok) return null;
    return (await res.json())?.access_token || null;
}

export async function fetchDiscordUserId(token) {
    const res = await fetch(`${DISCORD_API}/users/@me`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return (await res.json())?.id || null;
}

export async function isInGuild(token, guildId) {
    const res = await fetch(`${DISCORD_API}/users/@me/guilds`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return false;
    const guilds = await res.json();
    return Array.isArray(guilds) && guilds.some((g) => g.id === guildId);
}

// Store the link (once per Discord account) and grant the one-time join XP. Returns what happened.
export async function linkDiscord(buyerId, discordUserId) {
    if (!buyerId || !discordUserId) return { ok: false, reason: "error" };

    const existing = await db.queryOne(`SELECT id FROM mkt_buyer WHERE discord_user_id = $1`, [discordUserId]).catch(() => null);
    if (existing && existing.id !== buyerId) return { ok: false, reason: "taken" };

    await db.query(`UPDATE mkt_buyer SET discord_user_id = $2, updated_at = NOW() WHERE id = $1`, [buyerId, discordUserId]).catch(() => {});
    const points = await awardXp(buyerId, "discord_link", { dedupeKey: `discord_link:${buyerId}` });
    return { ok: true, awarded: points != null };
}
