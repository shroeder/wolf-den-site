import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { broadcastAnnouncementEmail } from "@/lib/marketplace/email.js";
import { withRequestLogging } from "@/lib/server-logger";
import { denWebhook } from "@/lib/marketplace/discord-channels.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120; // an email broadcast can span several Resend batches

const SITE_URL = "https://www.wolfdengamingmn.com";

// POST /api/admin/announce — broadcast an announcement. `channel:"discord"` (default) posts a rich embed to
// the marketplace Discord webhook; `channel:"email"` emails every member (personalized, batched). Admin-gated.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/announce", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const b = await request.json().catch(() => ({}));
            const channel = String(b.channel || "discord").toLowerCase();

            if (channel === "email") {
                const res = await broadcastAnnouncementEmail({
                    subject: String(b.subject || b.title || "News from The Wolf Den"),
                    heading: String(b.heading || b.title || ""),
                    emoji: String(b.emoji || "📣"),
                    bodyHtml: String(b.bodyHtml || b.description || ""),
                    ctaLabel: String(b.ctaLabel || ""),
                    ctaUrl: String(b.ctaUrl || b.url || ""),
                });
                return NextResponse.json({ ok: true, ...res });
            }

            const webhook = denWebhook();
            if (!webhook) return NextResponse.json({ error: "no_webhook_configured" }, { status: 400 });
            const embed = {
                title: String(b.title || "").slice(0, 256) || undefined,
                description: String(b.description || "").slice(0, 4000) || undefined,
                url: b.url ? new URL(String(b.url), SITE_URL).toString() : undefined,
                color: Number.isInteger(b.color) ? b.color : 0x4abd6a,
                image: b.image ? { url: String(b.image) } : undefined,
            };
            const resp = await fetch(webhook, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ content: String(b.content || "").slice(0, 2000) || undefined, embeds: [embed] }),
            });
            if (!resp.ok) return NextResponse.json({ error: `discord_${resp.status}` }, { status: 502 });
            return NextResponse.json({ ok: true });
        } catch (error) {
            return internalError(error, { event: "admin.announce.failure" });
        }
    });
}
