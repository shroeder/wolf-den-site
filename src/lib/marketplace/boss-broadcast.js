import "server-only";

import { broadcastBuyerPushAll } from "@/lib/push/send.js";
import { broadcastWebPush } from "@/lib/push/web-push.js";
import { SITE_URL } from "@/lib/site";

// Announce a released boss through every venue: Discord, browser push, and phone-app push. Best-effort.
export async function broadcastBoss(boss) {
    const title = `⚔️ New boss: ${boss.name}!`;
    const body = boss.rewards_text
        ? `A new boss just dropped. Rewards: ${String(boss.rewards_text).slice(0, 120)}. Join the fight!`
        : "A new boss just dropped — join the fight!";

    await postDiscordBoss(boss).catch(() => {});
    await broadcastWebPush({ title, body, url: "/marketplace/boss", tag: "boss", data: { type: "boss" } }).catch(() => {});
    await broadcastBuyerPushAll({ title, body, route: "boss", data: { type: "boss" } }).catch(() => {});
}

async function postDiscordBoss(boss) {
    const webhook = process.env.DISCORD_MARKETPLACE_WEBHOOK_URL || process.env.DISCORD_NEW_ARRIVALS_WEBHOOK_URL;
    if (!webhook) return;
    const embed = {
        title: `⚔️ New Boss: ${boss.name}`,
        description: `${boss.description ? `${String(boss.description).slice(0, 300)}\n\n` : ""}**Rewards:** ${boss.rewards_text || "—"}\n\nThe whole pack vs. one boss — every hit earns raffle tickets. Join the fight →`,
        url: new URL("/marketplace/boss", SITE_URL).toString(),
        color: 0xe0443a,
        image: boss.image_url ? { url: boss.image_url } : undefined,
    };
    const resp = await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "@here A new boss just dropped! 🐉", embeds: [embed] }),
    });
    if (!resp.ok) throw new Error(`Discord ${resp.status}`);
}
