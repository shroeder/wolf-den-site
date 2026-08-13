import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { db } from "@/lib/db";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── EVERY CONVERSATION IN THE DEN, FOR THE OWNER ─────────────────────────────────────────────────────────────
// Member DMs are unfiltered by design (text-filter.js guards public text only), which is defensible right up
// until somebody has to answer a question about what was said. This is that answer: the owner's read-only view
// of every thread, and the queue of anything a member has reported.
//
// READ-ONLY, DELIBERATELY. There is no delete and no edit here. An owner tool that can rewrite the record is
// worse than no tool the first time the record matters — and the whole value of a message log is that it is
// the thing that was actually written.
//
// Admin-key gated like every other /api/admin route, so it is reachable only from the admin app.
//
//   GET ?view=threads            every thread, busiest first, with its last message
//   GET ?view=thread&id=<id>     one thread, in full
//   GET ?view=reports            the report queue (open first)
//   GET ?view=search&q=<text>    every message matching, across everyone
//   POST { id, action }          mark a report resolved, with a note of what was done
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/messages", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) return authError;
        try {
            const { searchParams } = new URL(request.url);
            const view = searchParams.get("view") || "threads";
            const NAME = `COALESCE(NULLIF(b.display_name,''), b.alias, 'member')`;

            if (view === "reports") {
                const rows = await db.query(
                    `SELECT r.id, r.reason, r.note, r.created_at, r.resolved_at, r.action, r.thread_id, r.message_id,
                            COALESCE(NULLIF(a.display_name,''), a.alias, 'member') AS reporter,
                            COALESCE(NULLIF(z.display_name,''), z.alias, 'member') AS reported,
                            m.body AS message_body
                       FROM mkt_dm_report r
                       JOIN mkt_buyer a ON a.id = r.reporter_id
                       JOIN mkt_buyer z ON z.id = r.reported_id
                       LEFT JOIN mkt_dm_message m ON m.id = r.message_id
                      ORDER BY (r.resolved_at IS NULL) DESC, r.created_at DESC
                      LIMIT 200`
                );
                return NextResponse.json({ reports: rows });
            }

            if (view === "thread") {
                const id = searchParams.get("id");
                if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
                // Thread ids are uuids. Without this check a client that sends anything else — the admin app
                // sent "0" for every row while it parsed the id as a Long — reaches Postgres, fails the uuid
                // compare, and surfaces as a 500 that reads like the server is broken rather than the call.
                if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
                    return NextResponse.json({ error: "bad_id" }, { status: 400 });
                }
                const rows = await db.query(
                    `SELECT m.id, m.body, m.created_at, m.sender_id, ${NAME} AS sender
                       FROM mkt_dm_message m JOIN mkt_buyer b ON b.id = m.sender_id
                      WHERE m.thread_id = $1 ORDER BY m.created_at`, [id]
                );
                return NextResponse.json({ messages: rows });
            }

            if (view === "search") {
                const q = String(searchParams.get("q") || "").trim();
                if (q.length < 2) return NextResponse.json({ messages: [] });
                const rows = await db.query(
                    `SELECT m.id, m.thread_id, m.body, m.created_at, ${NAME} AS sender
                       FROM mkt_dm_message m JOIN mkt_buyer b ON b.id = m.sender_id
                      WHERE m.body ILIKE '%' || $1 || '%'
                      ORDER BY m.created_at DESC LIMIT 200`, [q]
                );
                return NextResponse.json({ messages: rows });
            }

            // Default: the thread list. Vendor threads ride along — the owner wants one inbox, not two.
            const rows = await db.query(
                `SELECT t.id, t.vendor_id IS NOT NULL AS vendor, t.last_message_at,
                        COALESCE(NULLIF(a.display_name,''), a.alias, 'member') AS a_name,
                        COALESCE(NULLIF(z.display_name,''), z.alias, 'member') AS b_name,
                        (SELECT COUNT(*) FROM mkt_dm_message m WHERE m.thread_id = t.id) AS n,
                        (SELECT m.body FROM mkt_dm_message m WHERE m.thread_id = t.id
                          ORDER BY m.created_at DESC LIMIT 1) AS last_body,
                        (SELECT COUNT(*) FROM mkt_dm_report r WHERE r.thread_id = t.id) AS reports
                   FROM mkt_dm_thread t
                   JOIN mkt_buyer a ON a.id = t.user_a
                   JOIN mkt_buyer z ON z.id = t.user_b
                  ORDER BY t.last_message_at DESC NULLS LAST LIMIT 200`
            );
            const openReports = await db.queryOne(
                `SELECT COUNT(*) AS n FROM mkt_dm_report WHERE resolved_at IS NULL`
            ).catch(() => ({ n: 0 }));
            return NextResponse.json({ threads: rows.filter((r) => Number(r.n) > 0), openReports: Number(openReports?.n) || 0 });
        } catch (error) {
            return internalError(error, { event: "admin.messages.failure" });
        }
    });
}

// Resolve a report — a timestamp and a sentence about what was done. No enum: what happened about a report is
// a sentence, and an enum here would be five options that never fit the sixth case.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/messages", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            const id = Number(body?.id);
            if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
            await db.query(
                `UPDATE mkt_dm_report SET resolved_at = NOW(), action = $2 WHERE id = $1`,
                [id, String(body?.action || "reviewed").slice(0, 500)]
            );
            return NextResponse.json({ ok: true });
        } catch (error) {
            return internalError(error, { event: "admin.messages.resolve.failure" });
        }
    });
}
