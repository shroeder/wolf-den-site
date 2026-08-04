import "server-only";

import { db } from "@/lib/db";
import { CHANGELOG, changelogFor, entryByKey } from "@/lib/marketplace/changelog.js";
import { denWebhook } from "@/lib/marketplace/discord-channels.js";
import { createServerLogger } from "@/lib/server-logger";

const log = createServerLogger({ source: "api", subsystem: "changelog" });
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.wolfdengamingmn.com";

// Resolve the `askedBy` aliases into real members — name and hero — so a credit is a person rather than a
// string. One query for every alias mentioned anywhere in the log, not one per entry.
export async function getChangelog(isOwner = false) {
    const entries = changelogFor(isOwner);
    const aliases = [...new Set(CHANGELOG.flatMap((e) => e.askedBy || []).map((a) => a.toLowerCase()))];
    const people = new Map();
    if (aliases.length) {
        const rows = await db.query(
            `SELECT alias, display_name, avatar_sprite_url FROM mkt_buyer WHERE LOWER(alias) = ANY($1)`, [aliases]
        ).catch(() => []);
        for (const r of rows) {
            people.set(String(r.alias).toLowerCase(), {
                name: r.display_name || r.alias,
                alias: r.alias,
                sprite: r.avatar_sprite_url || null,
            });
        }
    }
    return entries.map((e) => ({
        ...e,
        // An alias with no matching member still shows, as the alias — a credit that vanishes because somebody
        // changed their handle is worse than a credit that reads slightly plainly.
        credits: (e.askedBy || []).map((a) => people.get(a.toLowerCase()) || { name: a, alias: a, sprite: null }),
    }));
}

/**
 * Post one changelog entry to the den/quests channel. Owner-triggered rather than automatic: a feature ships
 * when it builds, but it should be ANNOUNCED when somebody has decided it's ready to be looked at.
 */
export async function broadcastChangelog(key) {
    const e = entryByKey(key);
    if (!e) return { ok: false, error: "unknown_entry" };
    const webhook = denWebhook();
    if (!webhook) return { ok: false, error: "no_webhook" };

    const credits = await (async () => {
        if (!e.askedBy?.length) return [];
        const rows = await db.query(
            `SELECT alias, display_name FROM mkt_buyer WHERE LOWER(alias) = ANY($1)`,
            [e.askedBy.map((a) => a.toLowerCase())]
        ).catch(() => []);
        return rows.map((r) => r.display_name || r.alias);
    })();

    const embed = {
        title: `${e.tag === "new" ? "New" : e.tag === "improved" ? "Improved" : "Fixed"} — ${e.title}`,
        description: [
            e.blurb,
            // The credit is the reason this message is worth sending at all.
            credits.length ? `\n**You asked for this:** ${credits.join(", ")} — thank you.` : "",
        ].filter(Boolean).join("\n"),
        url: e.href ? new URL(e.href, SITE_URL).toString() : undefined,
        color: e.tag === "new" ? 0x7ce8a4 : e.tag === "improved" ? 0x6fd0ff : 0xffb020,
        footer: { text: "The Wolf Den" },
    };

    try {
        const resp = await fetch(webhook, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ embeds: [embed] }),
        });
        if (!resp.ok) throw new Error(`Discord ${resp.status}`);
        log.info({ event: "changelog.broadcast.ok", step: "posted", key });
        return { ok: true, credits };
    } catch (error) {
        log.error({ event: "changelog.broadcast.failed", step: "post_failed", key, error: { message: error.message } });
        return { ok: false, error: "discord_failed" };
    }
}
