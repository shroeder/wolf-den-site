import "server-only";

import { broadcastBuyerPushAll } from "@/lib/push/send.js";
import { broadcastWebPush } from "@/lib/push/web-push.js";
import { SITE_URL } from "@/lib/site";

// One-time THE FORGE launch announcement — push + Discord only (NO email; we're rationing email sends).
// Best-effort per channel. Fired by the admin "Announce Forge" action.
export async function broadcastForgeLaunch({ channels } = {}) {
    const want = channels || { discord: true, push: true };
    const title = "🔨 The Forge is open!";
    const body = "Salvage gear into parts, combine them up the tiers, and enhance your equipment with the hammer-and-anvil mini-game. Tap to start forging →";
    const result = { discord: false, push: false };

    if (want.push) {
        await broadcastWebPush({ title, body, url: "/marketplace/blacksmith", tag: "forge-launch", data: { type: "forge_launch" } }).catch(() => {});
        await broadcastBuyerPushAll({ title, body, route: "blacksmith", data: { type: "forge_launch" } }).catch(() => {});
        result.push = true;
    }
    if (want.discord) { await postDiscordLaunch().then(() => { result.discord = true; }).catch(() => {}); }
    return result;
}

async function postDiscordLaunch() {
    const webhook = process.env.DISCORD_MARKETPLACE_WEBHOOK_URL || process.env.DISCORD_NEW_ARRIVALS_WEBHOOK_URL;
    if (!webhook) return;
    const embed = {
        title: "🔨 The Forge is open!",
        description: "The blacksmith's hearth is lit for everyone. **Salvage** unequipped gear into tiered parts, **combine** five parts into the next tier, and **enhance** your equipment through a hammer-and-anvil timing mini-game — a better strike, a bigger stat boost.\n\nInvest in smithing perks, chase a Forge rank on every piece, and earn secret smithing badges. Head to the Forge →",
        url: new URL("/marketplace/blacksmith", SITE_URL).toString(),
        color: 0xff7a1a,
    };
    const resp = await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "@everyone 🔨 **The Forge has launched!**", embeds: [embed] }),
    });
    if (!resp.ok) throw new Error(`Discord ${resp.status}`);
}
