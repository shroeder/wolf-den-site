import "server-only";

import { db } from "@/lib/db";
import { sendSailingLaunchEmail } from "@/lib/marketplace/email.js";
import { broadcastBuyerPushAll } from "@/lib/push/send.js";
import { broadcastWebPush } from "@/lib/push/web-push.js";
import { SITE_URL } from "@/lib/site";
import { denWebhook } from "@/lib/marketplace/discord-channels.js";

// One-time SAILING LAUNCH announcement across every player channel: Discord, browser push, phone-app push, and
// an email to every verified member. Best-effort per channel. Fired by the admin "Announce Sailing" action.
export async function broadcastSailingLaunch({ channels } = {}) {
    const want = channels || { discord: true, push: true, email: true };
    const title = "⛵ Sailing has launched!";
    const body = "Send your boat on voyages, dig for buried treasure, raid passing ships, and forge legendary chests. Tap to set sail →";
    const result = { discord: false, push: false, emails: 0 };

    if (want.discord) { await postDiscordLaunch().then(() => { result.discord = true; }).catch(() => {}); }
    if (want.push) {
        await broadcastWebPush({ kind: "announce", title, body, url: "/marketplace/sailing", tag: "sailing-launch", data: { type: "sailing_launch" } }).catch(() => {});
        await broadcastBuyerPushAll({ title, body, route: "sailing", data: { type: "sailing_launch" } }).catch(() => {});
        result.push = true;
    }
    if (want.email) {
        const members = await db.query(`SELECT id, email, display_name FROM mkt_buyer WHERE email IS NOT NULL AND email_verified = TRUE`).catch(() => []);
        for (const m of members) {
            const sent = await sendSailingLaunchEmail(m.email, { name: m.display_name || "" }).catch(() => false);
            if (sent) result.emails += 1;
        }
    }
    return result;
}

async function postDiscordLaunch() {
    const webhook = denWebhook();
    if (!webhook) return;
    const embed = {
        title: "⚓ Sailing is here!",
        description: "Your boat awaits. Dispatch it on **voyages** to mysterious islands, **dig up** treasure fragments and **forge** them into loot chests, meet the **Gold Merchant**, and **raid other members' ships** in full-screen ship-to-ship battles.\n\nUpgrade across **11 boat tiers** and chase new gear, pets, badges & daily quests. Set sail →",
        url: new URL("/marketplace/sailing", SITE_URL).toString(),
        color: 0x45b6ff,
    };
    const resp = await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "@everyone ⛵ **Sailing has launched!**", embeds: [embed] }),
    });
    if (!resp.ok) throw new Error(`Discord ${resp.status}`);
}
