import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { db } from "@/lib/db";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const iso = (d) => (d ? new Date(d).toISOString() : null);

// Friendly labels for a raw activity event → one line of the visitor's journey.
const LABEL = {
    shop_search: (m) => `🔍 Searched the shop${m?.q ? ` “${m.q}”` : ""}`,
    inspect_item: (m) => `🔎 Inspected ${m?.name || "an item"}`,
    browse_shop: () => "🛍️ Browsed the shop",
    view_boss: () => "⚔️ Viewed the boss",
    view_leaderboard: () => "🏆 Viewed the leaderboard",
    view_vendor: () => "🏪 Viewed a shop",
    view_profile: (m) => `👀 Viewed ${m?.alias ? `@${m.alias}` : m?.name || "a profile"}`,
    add_to_cart: (m) => `🛒 Added ${m?.name || "an item"} to cart`,
    begin_checkout: () => "💳 Started checkout",
    signup: () => "✨ Signed up",
    login: () => "🔑 Signed in",
};
const label = (event, meta, path) => {
    if (event === "page_view") return `📄 Viewed ${path || "a page"}`;
    return LABEL[event] ? LABEL[event](meta) : String(event || "").replace(/_/g, " ");
};
const parseMeta = (m) => { if (typeof m !== "string") return m; try { return JSON.parse(m); } catch { return null; } };

// One anonymous visitor's FULL journey: their first-touch header + an ordered timeline of everything they did.
export async function GET(request, { params }) {
    return withRequestLogging(request, "GET /api/admin/visitor/[anonId]", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const { anonId } = await params;
            const [v, rows] = await Promise.all([
                db.queryOne(
                    `SELECT anon_id, buyer_id, first_seen, last_seen, events, device, browser, os, country, region, city,
                            landing_path, referrer, source_kind, utm_source, utm_campaign, geo_lat, geo_lng
                       FROM mkt_visitor WHERE anon_id = $1`,
                    [anonId]
                ).catch(() => null),
                db.query(
                    `SELECT event, meta, path, created_at FROM mkt_activity_event WHERE anon_id = $1 ORDER BY created_at ASC LIMIT 400`,
                    [anonId]
                ).catch(() => []),
            ]);
            if (!v && !(rows || []).length) return NextResponse.json({ error: "not_found" }, { status: 404 });

            // If this anon later became a member, surface who.
            let becameMember = null;
            if (v?.buyer_id) {
                const b = await db.queryOne(`SELECT id, display_name, alias FROM mkt_buyer WHERE id = $1`, [v.buyer_id]).catch(() => null);
                if (b) becameMember = { id: b.id, name: b.display_name || b.alias || "Member", alias: b.alias || null };
            }

            // Ordered timeline (oldest → newest = enter → … → last seen), split into visits on >30-min idle gaps.
            const GAP_MS = 30 * 60 * 1000;
            const timeline = [];
            let prev = null;
            let visit = 0;
            for (const r of rows || []) {
                const at = new Date(r.created_at).getTime();
                const newVisit = prev == null || at - prev > GAP_MS;
                if (newVisit) visit += 1;
                timeline.push({ label: label(r.event, parseMeta(r.meta), r.path), event: r.event, path: r.path || null, at: iso(r.created_at), visit });
                prev = at;
            }

            return NextResponse.json({
                anonId,
                becameMember,
                visits: visit,
                header: v ? {
                    firstSeen: iso(v.first_seen), lastSeen: iso(v.last_seen), events: Number(v.events) || (rows || []).length,
                    landingPath: v.landing_path || null, referrer: v.referrer || null, source: v.source_kind || null,
                    utmSource: v.utm_source || null, utmCampaign: v.utm_campaign || null,
                    device: v.device || null, browser: v.browser || null, os: v.os || null,
                    place: [v.city, v.region, v.country].filter(Boolean).join(", ") || null,
                    geo: v.geo_lat && v.geo_lng ? { lat: v.geo_lat, lng: v.geo_lng } : null,
                } : null,
                timeline,
            }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.visitor.journey.failure" });
        }
    });
}
