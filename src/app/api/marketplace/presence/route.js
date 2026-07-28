import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lightweight presence heartbeat: a signed-in member's open tab pings this every ~40s so the Town (and any
// "online now" view) knows they're actually here right now. Only bumps last_seen for MEMBERS (no anonymous
// pings → analytics stays clean) and never inserts an activity event, so it doesn't pollute telemetry counts.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/presence", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ ok: true, online: false }, { headers: { "Cache-Control": "no-store" } });

            const body = await request.json().catch(() => ({}));
            const anon = body?.anonId ? String(body.anonId).slice(0, 48) : null;

            if (anon) {
                // Upsert this device's visitor row's last_seen without touching the events counter.
                await db.query(
                    `INSERT INTO mkt_visitor (anon_id, buyer_id, first_seen, last_seen, events)
                     VALUES ($1, $2, NOW(), NOW(), 1)
                     ON CONFLICT (anon_id) DO UPDATE
                        SET last_seen = NOW(), buyer_id = COALESCE(mkt_visitor.buyer_id, EXCLUDED.buyer_id)`,
                    [anon, buyer.id]
                ).catch(() => {});
            } else {
                await db.query(`UPDATE mkt_visitor SET last_seen = NOW() WHERE buyer_id = $1`, [buyer.id]).catch(() => {});
            }

            return NextResponse.json({ ok: true, online: true }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.presence.failure" });
        }
    });
}
