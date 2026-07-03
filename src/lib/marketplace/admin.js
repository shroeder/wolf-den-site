import "server-only";

import { db } from "@/lib/db";

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

// Owner removal of any listing (soft delete). Returns true if a live listing was removed.
export async function adminRemoveListing(id) {
    const row = await db.queryOne(
        `UPDATE mkt_listing SET status = 'deleted', updated_at = NOW()
         WHERE id = $1 AND status <> 'deleted' RETURNING id`,
        [id]
    );
    return Boolean(row);
}
