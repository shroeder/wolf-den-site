import "server-only";

import { db } from "@/lib/db";
import { listSearchDemand } from "@/lib/marketplace/demand.js";
import { getMarketplaceLiveStats } from "@/lib/marketplace/search.js";
import { listMostWanted } from "@/lib/marketplace/wants.js";

// Admin-only marketplace queries for the owner console (Android admin app). The per-vendor and
// per-listing helpers already exist elsewhere; this fills the cross-cutting gaps: all buyers, a
// unified activity feed, and owner-side listing removal (the vendor deleteListing requires ownership).

function iso(v) {
    return v ? new Date(v).toISOString() : null;
}

// Everyone who signed up as a buyer, newest first, with demand + whether they're also a seller.
export async function listBuyersForAdmin({ limit = 500 } = {}) {
    const rows = await db.query(
        `SELECT b.id, b.email, b.display_name, b.created_at,
                (SELECT count(*)::int FROM mkt_want w WHERE w.email_normalized = b.email_normalized) AS want_count,
                EXISTS (SELECT 1 FROM mkt_vendor v WHERE v.account_id = b.id AND v.status = 'active') AS is_seller
         FROM mkt_buyer b
         ORDER BY b.created_at DESC
         LIMIT $1`,
        [limit]
    );
    return rows.map((r) => ({
        id: r.id,
        email: r.email,
        displayName: r.display_name || null,
        createdAt: iso(r.created_at),
        wantCount: Number(r.want_count || 0),
        isSeller: Boolean(r.is_seller),
    }));
}

// Cross-marketplace activity feed: signups, listings, contacts, sell posts, dealer offers, swaps, sales.
export async function listMarketplaceActivity({ limit = 120 } = {}) {
    const rows = await db.query(
        `(SELECT 'vendor_joined' AS kind, v.created_at AS at, v.display_name AS title, v.status AS detail FROM mkt_vendor v)
         UNION ALL
         (SELECT 'buyer_joined', b.created_at, COALESCE(b.display_name, b.email), NULL FROM mkt_buyer b)
         UNION ALL
         (SELECT 'listing_created', l.created_at, l.title, v.display_name || ' · $' || l.price::text
            FROM mkt_listing l JOIN mkt_vendor v ON v.id = l.vendor_id WHERE l.status = 'active')
         UNION ALL
         (SELECT 'contact', COALESCE(c.sent_at, c.created_at), c.buyer_name, 'to ' || v.display_name
            FROM mkt_contact_request c JOIN mkt_vendor v ON v.id = c.vendor_id)
         UNION ALL
         (SELECT 'sell_offer', s.created_at, COALESCE(NULLIF(s.name, ''), s.email), left(s.items, 80) FROM sell_offer s)
         UNION ALL
         (SELECT 'dealer_offer', o.created_at, vf.display_name || ' → ' || vt.display_name,
            o.status || COALESCE(' · $' || o.amount::text, '')
            FROM mkt_dealer_offer o JOIN mkt_vendor vf ON vf.id = o.from_vendor_id JOIN mkt_vendor vt ON vt.id = o.to_vendor_id)
         UNION ALL
         (SELECT 'swap', sw.created_at, vf.display_name || ' ⇄ ' || vt.display_name, sw.status
            FROM mkt_swap sw JOIN mkt_vendor vf ON vf.id = sw.from_vendor_id JOIN mkt_vendor vt ON vt.id = sw.to_vendor_id)
         UNION ALL
         (SELECT 'sale', sa.sold_at, sa.title, v.display_name || ' · $' || sa.price::text
            FROM mkt_sale sa JOIN mkt_vendor v ON v.id = sa.vendor_id)
         ORDER BY at DESC NULLS LAST
         LIMIT $1`,
        [limit]
    );
    return rows.map((r) => ({
        kind: r.kind,
        at: iso(r.at),
        title: r.title || "",
        detail: r.detail || null,
    }));
}

// Insights: demand intelligence (#1) + conversion/responsiveness (#2) for the admin console.
export async function getMarketplaceInsights() {
    const [stats, mostWanted, searchDemand, funnelRows, responsiveness] = await Promise.all([
        getMarketplaceLiveStats(),
        listMostWanted(20),
        listSearchDemand({ limit: 20, days: 30 }),
        db.query(`SELECT status, count(*)::int AS n FROM mkt_contact_request GROUP BY status`),
        db.query(
            `SELECT v.id, v.display_name,
                    count(c.*)::int AS contacts,
                    count(c.*) FILTER (WHERE c.status IN ('responded', 'sold', 'closed'))::int AS responded,
                    count(c.*) FILTER (WHERE c.status = 'sold')::int AS sold,
                    round(avg(EXTRACT(EPOCH FROM (c.responded_at - COALESCE(c.sent_at, c.created_at))) / 3600.0)
                          FILTER (WHERE c.responded_at IS NOT NULL)::numeric, 1) AS avg_response_hours
             FROM mkt_vendor v JOIN mkt_contact_request c ON c.vendor_id = v.id
             GROUP BY v.id, v.display_name
             HAVING count(c.*) > 0
             ORDER BY contacts DESC
             LIMIT 50`
        ),
    ]);
    const contactFunnel = {};
    funnelRows.forEach((r) => { contactFunnel[r.status] = r.n; });
    return {
        stats,
        mostWanted,
        searchDemand,
        contactFunnel,
        responsiveness: responsiveness.map((r) => ({
            vendorId: r.id,
            displayName: r.display_name,
            contacts: r.contacts,
            responded: r.responded,
            sold: r.sold,
            responseRate: r.contacts ? Math.round((100 * r.responded) / r.contacts) : 0,
            avgResponseHours: r.avg_response_hours != null ? Number(r.avg_response_hours) : null,
        })),
    };
}

// Engagement analytics: unique reach, geography, and inferred demand over a rolling window.
export async function getEngagementInsights({ days = 30 } = {}) {
    const win = `NOW() - ($1 || ' days')::interval`;
    const [totals, byKind, topRegions, topCities, topSearches, uniqueByDay, topPages, topProducts, recent] = await Promise.all([
        db.queryOne(`SELECT count(*)::int AS events, count(DISTINCT visitor_id)::int AS uniques FROM mkt_engagement WHERE created_at >= ${win}`, [days]),
        db.query(`SELECT kind, count(*)::int AS n, count(DISTINCT visitor_id)::int AS uniques FROM mkt_engagement WHERE created_at >= ${win} GROUP BY kind ORDER BY n DESC`, [days]),
        db.query(`SELECT region, country, count(DISTINCT visitor_id)::int AS visitors, count(*)::int AS events FROM mkt_engagement WHERE created_at >= ${win} AND region IS NOT NULL GROUP BY region, country ORDER BY visitors DESC, events DESC LIMIT 15`, [days]),
        db.query(`SELECT city, region, count(DISTINCT visitor_id)::int AS visitors FROM mkt_engagement WHERE created_at >= ${win} AND city IS NOT NULL GROUP BY city, region ORDER BY visitors DESC LIMIT 15`, [days]),
        db.query(`SELECT lower(search_term) AS term, count(*)::int AS n FROM mkt_engagement WHERE created_at >= ${win} AND kind = 'search' AND search_term IS NOT NULL AND search_term <> '' GROUP BY lower(search_term) ORDER BY n DESC LIMIT 20`, [days]),
        db.query(`SELECT to_char(created_at::date, 'YYYY-MM-DD') AS day, count(DISTINCT visitor_id)::int AS visitors FROM mkt_engagement WHERE created_at >= ${win} GROUP BY 1 ORDER BY 1`, [days]),
        // Feature usage — which pages get visited (site-wide page views).
        db.query(`SELECT path, count(*)::int AS n, count(DISTINCT visitor_id)::int AS uniques FROM mkt_engagement WHERE created_at >= ${win} AND kind = 'pageview' AND path IS NOT NULL GROUP BY path ORDER BY n DESC LIMIT 25`, [days]),
        // Most-viewed products (join the catalog for a readable name).
        db.query(`SELECT e.catalog_product_id AS id, c.name, count(*)::int AS n, count(DISTINCT e.visitor_id)::int AS uniques FROM mkt_engagement e LEFT JOIN tcg_cards c ON c.id = e.catalog_product_id WHERE e.created_at >= ${win} AND e.kind = 'view' AND e.catalog_product_id IS NOT NULL GROUP BY e.catalog_product_id, c.name ORDER BY n DESC LIMIT 25`, [days]),
        // Low-level recent-activity feed.
        db.query(`SELECT to_char(created_at, 'MM-DD HH24:MI') AS at, kind, path, search_term, catalog_product_id, city, region FROM mkt_engagement WHERE created_at >= ${win} ORDER BY created_at DESC LIMIT 60`, [days]),
    ]);
    return {
        days,
        events: totals?.events || 0,
        uniqueVisitors: totals?.uniques || 0,
        byKind: byKind.map((r) => ({ kind: r.kind, events: r.n, uniques: r.uniques })),
        topRegions: topRegions.map((r) => ({ region: r.region, country: r.country, visitors: r.visitors, events: r.events })),
        topCities: topCities.map((r) => ({ city: r.city, region: r.region, visitors: r.visitors })),
        topSearches: topSearches.map((r) => ({ term: r.term, count: r.n })),
        uniqueByDay: uniqueByDay.map((r) => ({ day: r.day, visitors: r.visitors })),
        topPages: topPages.map((r) => ({ path: r.path, views: r.n, uniques: r.uniques })),
        topProducts: topProducts.map((r) => ({ id: r.id, name: r.name || `#${r.id}`, views: r.n, uniques: r.uniques })),
        recent: recent.map((r) => ({ at: r.at, kind: r.kind, path: r.path, term: r.search_term, productId: r.catalog_product_id, city: r.city, region: r.region })),
    };
}

// Owner removal of any listing (soft delete). Returns true if a live listing was removed.
export async function adminRemoveListing(id) {
    const row = await db.queryOne(
        `UPDATE mkt_listing SET status = 'deleted', updated_at = NOW()
         WHERE id = $1 AND status <> 'deleted' RETURNING id`,
        [id]
    );
    return Boolean(row);
}
