import "server-only";

import { db } from "@/lib/db";
import { sendBossDefeatedEmail } from "@/lib/marketplace/email.js";
import { broadcastToEveryone } from "@/lib/push/broadcast.js";
import { SITE_URL } from "@/lib/site";
import { denWebhook } from "@/lib/marketplace/discord-channels.js";

// Announce a released boss through every venue: Discord, browser push, and phone-app push. Best-effort.
export async function broadcastBoss(boss) {
    const title = `⚔️ New boss: ${boss.name}!`;
    const body = boss.rewards_text
        ? `A new boss just dropped. Rewards: ${String(boss.rewards_text).slice(0, 120)}. Join the fight!`
        : "A new boss just dropped — join the fight!";

    await postDiscordBoss(boss).catch(() => {});
    // Browser + member app + THE OWNER'S PHONE. That last one was missing here too — see push/broadcast.js.
    await broadcastToEveryone({ kind: "bossevent", title, body, url: "/marketplace/boss", route: "boss", tag: "boss", data: { type: "boss" } }).catch(() => {});
}

// The KILL event — a big deal. Announce everywhere + email every member.
//
// TWO DIFFERENT PEOPLE, and they used to be one variable. The RAFFLE WINNER holds a ticket drawn for a
// physical in-store prize. The CHAMPION merely dealt the most damage. finalizeBossKill headlines the
// announcement with the raffle winner "if there was one, else the damage champion" — which is fine for a
// headline and was catastrophic once that single value also decided who got told they had won something.
//
// Sythmara, Storm-Render had no prize set, so no raffle ran and nobody was drawn. The champion fell through
// into the winner slot, and 77 members were emailed "The raffle winner is The Wolf Den", the owner account
// got "🏆 You won the raffle — come by to claim your prize", and Discord and push said the same. The owner is
// correctly filtered OUT of the raffle pool; the label path went around that filter entirely.
//
// So a raffle winner now only exists when a ticket was actually drawn AND there is a prize to hand over.
// The champion is announced as the champion, in words that promise nothing.
export async function broadcastBossDefeated(boss, { champion = null, raffleWinner = null } = {}) {
    const prize = boss.prize_name || null;
    // No prize means no raffle, whatever was passed in.
    const winner = prize ? raffleWinner : null;
    const winnerLabel = winner?.label || null;
    const championLabel = champion?.label || null;

    const title = `☠️ ${boss.name} has been slain!`;
    const body = winnerLabel
        ? `The pack took it down! ${winnerLabel} won the raffle: ${prize}. See the final stats →`
        : championLabel
            ? `The pack took it down! Top damage: ${championLabel}. See the final stats →`
            : `The pack brought down ${boss.name}! See the final stats →`;

    await postDiscordDefeated(boss, winnerLabel, championLabel).catch(() => {});
    await broadcastToEveryone({ kind: "bossevent", title, body, url: `/marketplace/boss/recap/${boss.id}`, route: "boss", tag: "boss-defeated", data: { type: "boss_defeated" } }).catch(() => {});

    // Email every member. Only a genuine raffle winner gets the "come claim" version.
    const members = await db.query(
        `SELECT id, email, display_name FROM mkt_buyer
          WHERE email IS NOT NULL AND email_verified = TRUE
            AND COALESCE((notify_prefs ->> 'email:bossevent')::boolean, TRUE) IS NOT FALSE`
    ).catch(() => []);
    for (const m of members) {
        await sendBossDefeatedEmail(m.email, {
            bossId: boss.id,
            bossName: boss.name,
            winnerLabel,
            championLabel,
            prizeName: prize,
            prizeImageUrl: boss.prize_image_url || "",
            isWinner: Boolean(winner?.buyerId && m.id === winner.buyerId),
            name: m.display_name || "",
        }).catch(() => {});
    }
}

async function postDiscordDefeated(boss, winnerLabel, championLabel) {
    const webhook = denWebhook();
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
    const webhook = denWebhook();
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
