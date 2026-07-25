import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = "https://www.wolfdengamingmn.com";

// POST /api/admin/announce — broadcast a rich announcement to the marketplace Discord channel via the
// existing webhook. Admin-gated. Body: { content, title, description, url, image, color } (all optional).
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/announce", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const webhook = process.env.DISCORD_MARKETPLACE_WEBHOOK_URL || process.env.DISCORD_NEW_ARRIVALS_WEBHOOK_URL;
            if (!webhook) return NextResponse.json({ error: "no_webhook_configured" }, { status: 400 });
            const b = await request.json().catch(() => ({}));
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
