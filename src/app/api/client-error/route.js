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
        // A chunk failure that the client already recovered from by reloading (see ChunkRecovery). Still worth
        // recording — a run of them means we deployed on top of people — but it is not worth a push, because
        // the member saw a blink and carried on, and a phone buzzing "A page crashed" for that is a false alarm
        // that teaches you to ignore the real ones.
        const recovered = body?.recovered === true;

        // A CHUNK THAT WOULD NOT DOWNLOAD IS NOT A BUG IN OUR CODE. It means the browser asked for a JS file
        // from a build that is no longer the current one, or the connection dropped mid-fetch — a stale tab, a
        // deploy landing under someone's feet, a phone on one bar. Nothing in the source can prevent it and
        // nothing in the source needs changing when it happens.
        //
        // The client already downgrades these when it manages to recover by reloading, but recovery needs a
        // working connection to succeed — so the exact case worth ignoring most, genuinely bad internet, is the
        // one that arrives flagged as a hard crash and buzzes the phone. Classified here instead, off the error
        // itself, so it does not depend on the client being well enough to say so.
        const chunkNoise = /ChunkLoadError|Loading chunk \d|Failed to load chunk|error loading dynamically imported module|Importing a module script failed/i
            .test(`${message} ${stack || ""}`);
        const quiet = recovered || chunkNoise;

        const buyer = await getAuthenticatedBuyer().catch(() => null);
        const who = buyer?.display_name || buyer?.alias || (buyer?.id ? `buyer:${buyer.id}` : "signed out");

        // Structured log first — this is the copy that survives regardless of push config.
        if (quiet) log.warn("client.chunk_noise", { path, message, who, ua, recovered, chunkNoise });
        else log.error("client.crash", { path, message, digest, who, ua, stack });

        // And keep it, so a pattern across members is visible rather than a scroll through logs.
        await db.query(
            `INSERT INTO mkt_client_error (buyer_id, path, message, digest, stack, ua)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [buyer?.id || null, path, quiet ? `[chunk] ${message}` : message, digest, stack, ua]
        ).catch(() => { /* the log line above is the real record */ });

        const key = `${path}|${message}`;
        const now = Date.now();
        if (!quiet && (!lastPush.has(key) || now - lastPush.get(key) > PUSH_COOLDOWN_MS)) {
            lastPush.set(key, now);
            await sendAdminPush({
                title: "A page crashed",
                body: `${path} — ${message}${who ? ` · ${who}` : ""}`,
                // "crashes", not "marketplace" — the old route dropped you on the VENDOR screen, which told
                // you something had broken and then showed you something unrelated.
                route: "crashes",
                data: { type: "client_crash", path, digest: digest || "" },
            }).catch(() => { /* best effort */ });
        }
        return NextResponse.json({ ok: true });
    } catch {
        // Never surface anything here. The page is already broken; this endpoint failing must be invisible.
        return NextResponse.json({ ok: true });
    }
}
