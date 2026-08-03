import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { sendAdminPush } from "@/lib/push/send.js";
import { createServerLogger } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createServerLogger({ source: "client-error" });

// ── A PAGE DIED IN SOMEONE'S BROWSER ─────────────────────────────────────────────────────────────────────────
// React render errors happen on the CLIENT, so nothing in the server logs ever knew about them. The Store was
// down for an hour and the only reason we found out is that Luke happened to open it himself. This is the
// missing half: the crash screen posts here, and we log it and push it to the admin app immediately.
//
// Deliberately never returns an error to the caller — a failure to report a crash must not become a second
// crash on the screen that is already apologising for the first.

// One push per path per 10 minutes. A render loop can fire this dozens of times a second, and burying the
// first report under a thousand identical ones is the same as having no report.
const PUSH_COOLDOWN_MS = 10 * 60 * 1000;
const lastPush = new Map();

export async function POST(request) {
    try {
        const body = await request.json().catch(() => ({}));
        const path = String(body?.path || "unknown").slice(0, 300);
        const message = String(body?.message || "(no message)").slice(0, 500);
        const digest = body?.digest ? String(body.digest).slice(0, 120) : null;
        const stack = body?.stack ? String(body.stack).slice(0, 4000) : null;
        const ua = body?.ua ? String(body.ua).slice(0, 300) : null;

        const buyer = await getAuthenticatedBuyer().catch(() => null);
        const who = buyer?.display_name || buyer?.alias || (buyer?.id ? `buyer:${buyer.id}` : "signed out");

        // Structured log first — this is the copy that survives regardless of push config.
        log.error("client.crash", { path, message, digest, who, ua, stack });

        // And keep it, so a pattern across members is visible rather than a scroll through logs.
        await db.query(
            `INSERT INTO mkt_client_error (buyer_id, path, message, digest, stack, ua)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [buyer?.id || null, path, message, digest, stack, ua]
        ).catch(() => { /* the log line above is the real record */ });

        const key = `${path}|${message}`;
        const now = Date.now();
        if (!lastPush.has(key) || now - lastPush.get(key) > PUSH_COOLDOWN_MS) {
            lastPush.set(key, now);
            await sendAdminPush({
                title: "A page crashed",
                body: `${path} — ${message}${who ? ` · ${who}` : ""}`,
                route: "marketplace",
                data: { type: "client_crash", path, digest: digest || "" },
            }).catch(() => { /* best effort */ });
        }
        return NextResponse.json({ ok: true });
    } catch {
        // Never surface anything here. The page is already broken; this endpoint failing must be invisible.
        return NextResponse.json({ ok: true });
    }
}
