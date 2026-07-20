import "server-only";

import { db } from "@/lib/db";
import { sendBossDefeatedEmail } from "@/lib/marketplace/email.js";
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

// The KILL event — a big deal. Announce everywhere + email every member (winner gets a claim nudge).
export async function broadcastBossDefeated(boss, winner) {
    const winnerLabel = winner?.label || null;
    const prize = boss.prize_name || null;
    const title = `☠️ ${boss.name} has been slain!`;
    const body = winnerLabel && prize
        ? `The pack took it down! ${winnerLabel} won the raffle: ${prize}. See the final stats →`
        : winnerLabel
            ? `The pack took it down! Raffle winner: ${winnerLabel}. See the final stats →`
            : `The pack brought down ${boss.name}! See the final stats →`;

    await postDiscordDefeated(boss, winnerLabel).catch(() => {});
    await broadcastWebPush({ title, body, url: `/marketplace/boss/recap/${boss.id}`, tag: "boss-defeated", data: { type: "boss_defeated" } }).catch(() => {});
    await broadcastBuyerPushAll({ title, body, route: "boss", data: { type: "boss_defeated" } }).catch(() => {});

    // Email every member (winner gets the "come claim" version).
    const members = await db.query(`SELECT id, email, display_name FROM mkt_buyer WHERE email IS NOT NULL AND email_verified = TRUE`).catch(() => []);
    for (const m of members) {
        await sendBossDefeatedEmail(m.email, {
            bossId: boss.id,
            bossName: boss.name,
            winnerLabel,
            prizeName: prize,
            prizeImageUrl: boss.prize_image_url || "",
            isWinner: winner?.buyerId && m.id === winner.buyerId,
            name: m.display_name || "",
        }).catch(() => {});
    }
}

async function postDiscordDefeated(boss, winnerLabel) {
    const webhook = process.env.DISCORD_MARKETPLACE_WEBHOOK_URL || process.env.DISCORD_NEW_ARRIVALS_WEBHOOK_URL;
    if (!webhook) return;
    const embed = {
        title: `☠️ ${boss.name} defeated!`,
        description: `The whole pack brought it down.${winnerLabel ? `\n\n🎟️ **Raffle winner:** ${winnerLabel}` : ""}${boss.prize_name ? `\n🏆 **Prize:** ${boss.prize_name}` : ""}\n\nSee the final battle stats →`,
        url: new URL(`/marketplace/boss/recap/${boss.id}`, SITE_URL).toString(),
        color: 0xffcf40,
        image: boss.image_url ? { url: boss.image_url } : undefined,
        thumbnail: boss.prize_image_url ? { url: boss.prize_image_url } : undefined,
    };
    const resp = await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "@here The boss is down! 🏆", embeds: [embed] }),
    });
    if (!resp.ok) throw new Error(`Discord ${resp.status}`);
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
