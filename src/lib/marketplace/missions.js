import "server-only";

import { db } from "@/lib/db";
import { sendVendorMissionsEmail } from "@/lib/marketplace/email.js";
import { createServerLogger } from "@/lib/server-logger";
import { listVendors } from "@/lib/marketplace/vendors.js";

const missionsLogger = createServerLogger({ source: "api", subsystem: "marketplace-missions" });

// "Vendor Missions" — turn the marketplace from a passive catalog into an intelligence signal by
// crossing network DEMAND (mkt_want "notify me") with SUPPLY (mkt_listing). Tells a vendor what to
// buy/list next and where they're uniquely positioned. Computed on read; no new tables.

function mapMission(row) {
    return {
        catalogProductId: String(row.id),
        name: row.name,
        game: row.game,
        setName: row.set_name,
        imageUrl: row.image_url,
        marketPrice: row.market_price != null ? Number(row.market_price) : null,
        wantCount: Number(row.want_count) || 0,
        sellerCount: row.seller_count != null ? Number(row.seller_count) : null,
    };
}

export async function listVendorMissions(vendorId, { limit = 10 } = {}) {
    if (!vendorId) {
        return { demandGaps: [], uniques: [] };
    }

    // Demand gaps: products buyers want that THIS vendor doesn't list, with how many other vendors
    // carry it network-wide (0 = nobody stocks it yet — a wide-open opportunity).
    const demandGaps = await db.query(
        `SELECT w.catalog_product_id AS id, c.name, c.game, c.image_url, c.market_price, s.name AS set_name,
                COUNT(DISTINCT w.email_normalized)::int AS want_count,
                (SELECT COUNT(DISTINCT l2.vendor_id) FROM mkt_listing l2
                   WHERE l2.catalog_product_id = w.catalog_product_id AND l2.status = 'active')::int AS seller_count
         FROM mkt_want w
         JOIN tcg_cards c ON c.id = w.catalog_product_id
         JOIN tcg_sets s ON s.id = c.set_id
         WHERE NOT EXISTS (
             SELECT 1 FROM mkt_listing l
             WHERE l.catalog_product_id = w.catalog_product_id AND l.vendor_id = $1 AND l.status = 'active'
         )
         GROUP BY w.catalog_product_id, c.name, c.game, c.image_url, c.market_price, s.name
         ORDER BY want_count DESC, c.market_price DESC NULLS LAST
         LIMIT $2`,
        [vendorId, limit]
    );

    // Uniqueness: products where THIS vendor is the only active seller in the network.
    const uniques = await db.query(
        `SELECT l.catalog_product_id AS id, c.name, c.game, c.image_url, c.market_price, s.name AS set_name,
                (SELECT COUNT(DISTINCT w.email_normalized) FROM mkt_want w
                   WHERE w.catalog_product_id = l.catalog_product_id)::int AS want_count
         FROM mkt_listing l
         JOIN tcg_cards c ON c.id = l.catalog_product_id
         JOIN tcg_sets s ON s.id = c.set_id
         WHERE l.vendor_id = $1 AND l.status = 'active' AND l.catalog_product_id IS NOT NULL
           AND (SELECT COUNT(DISTINCT l2.vendor_id) FROM mkt_listing l2
                  WHERE l2.catalog_product_id = l.catalog_product_id AND l2.status = 'active') = 1
         GROUP BY l.catalog_product_id, c.name, c.game, c.image_url, c.market_price, s.name
         ORDER BY want_count DESC, c.market_price DESC NULLS LAST
         LIMIT $2`,
        [vendorId, limit]
    );

    return {
        demandGaps: demandGaps.map(mapMission),
        uniques: uniques.map(mapMission),
    };
}

// Weekly cron: email each active vendor their own missions. Vendor-only (never buyers); skips vendors
// with no opportunities so we don't send empty digests.
export async function sendMissionDigests() {
    const vendors = await listVendors({ status: "active" }).catch(() => []);
    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const vendor of vendors) {
        if (!vendor.email) {
            skipped += 1;
            continue;
        }
        const missions = await listVendorMissions(vendor.id).catch(() => ({ demandGaps: [], uniques: [] }));
        if (missions.demandGaps.length === 0 && missions.uniques.length === 0) {
            skipped += 1;
            continue;
        }
        try {
            await sendVendorMissionsEmail({ vendor, demandGaps: missions.demandGaps, uniques: missions.uniques });
            sent += 1;
        } catch (error) {
            failed += 1;
            missionsLogger.warn("marketplace.missions.email_failed", { vendorId: vendor.id, reason: error.message });
        }
    }

    missionsLogger.info("marketplace.missions.digest_run", { vendors: vendors.length, sent, skipped, failed });
    return { vendors: vendors.length, sent, skipped, failed };
}
