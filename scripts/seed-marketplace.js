#!/usr/bin/env node

/**
 * Seed the marketplace with one demo vendor + a few sealed listings, so the buyer browse
 * experience can be built against real data before any vendor-upload UX exists.
 *
 * Idempotent: keyed on the vendor's email. Re-running clears that vendor's listings and
 * re-inserts them. Each sealed listing does a best-effort match against tcg_cards by name —
 * when found, it links catalog_product_id + image_url + game; otherwise it lists as a plain
 * snapshot (which is exactly how unmatched listings are meant to work).
 *
 * Usage:
 *   node scripts/seed-marketplace.js
 *   node scripts/seed-marketplace.js --email vendor@example.com --name "Capital City Cards"
 *
 * Requires DATABASE_URL in the environment.
 */

import { Pool } from "@neondatabase/serverless";

function parseArgs(argv) {
    const args = {};

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];

        if (arg.startsWith("--")) {
            const key = arg.slice(2);
            const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
            args[key] = value;
        }
    }

    return args;
}

// Sealed products to list. `match` is the substring we look for in tcg_cards.name.
const SEED_LISTINGS = [
    { title: "Prismatic Evolutions Elite Trainer Box", match: "Prismatic Evolutions Elite Trainer Box", price: 79.99, quantity: 4 },
    { title: "Prismatic Evolutions Booster Bundle", match: "Prismatic Evolutions Booster Bundle", price: 34.99, quantity: 6 },
    { title: "Surging Sparks Booster Box", match: "Surging Sparks Booster Box", price: 159.99, quantity: 2 },
    { title: "Stellar Crown Elite Trainer Box", match: "Stellar Crown Elite Trainer Box", price: 49.99, quantity: 3 },
];

async function main() {
    const dbUrl = process.env.DATABASE_URL;

    if (!dbUrl) {
        console.error("ERROR: DATABASE_URL environment variable is not set.");
        process.exit(1);
    }

    const args = parseArgs(process.argv.slice(2));
    const email = (args.email || "demo-vendor@wolfden.local").trim();
    const emailNormalized = email.toLowerCase();
    const displayName = args.name || "Capital City Cards";

    const pool = new Pool({ connectionString: dbUrl });

    try {
        // Upsert the demo vendor as an active, ready-to-list account (no password needed for seed
        // data; real vendors get one via the invite-accept flow).
        const vendorResult = await pool.query(
            `INSERT INTO mkt_vendor
                (email, email_normalized, display_name, status,
                 city, region, postal_code, country, location_label, accepted_at)
             VALUES ($1, $2, $3, 'active', 'Sacramento', 'CA', '95814', 'US', 'Sacramento, CA', NOW())
             ON CONFLICT (email_normalized) DO UPDATE
                SET display_name = EXCLUDED.display_name,
                    status = 'active',
                    updated_at = NOW()
             RETURNING id`,
            [email, emailNormalized, displayName]
        );

        const vendorId = vendorResult.rows[0].id;
        console.log(`Vendor ready: ${displayName} <${email}> (${vendorId})`);

        // Clear prior seed listings for this vendor so the script is idempotent.
        const cleared = await pool.query(`DELETE FROM mkt_listing WHERE vendor_id = $1`, [vendorId]);
        if (cleared.rowCount) {
            console.log(`Cleared ${cleared.rowCount} existing listing(s).`);
        }

        let matched = 0;

        for (const item of SEED_LISTINGS) {
            // Best-effort catalog match (Pokémon sealed products live in tcg_cards too).
            const catalogRow = (
                await pool.query(
                    `SELECT id, game, image_url
                     FROM tcg_cards
                     WHERE game = 'pokemon' AND name ILIKE $1
                     ORDER BY length(name) ASC
                     LIMIT 1`,
                    [`%${item.match}%`]
                )
            ).rows[0];

            if (catalogRow) {
                matched += 1;
            }

            await pool.query(
                `INSERT INTO mkt_listing
                    (vendor_id, kind, catalog_product_id, game, title, image_url, price, quantity)
                 VALUES ($1, 'sealed', $2, $3, $4, $5, $6, $7)`,
                [
                    vendorId,
                    catalogRow ? catalogRow.id : null,
                    catalogRow ? catalogRow.game : "pokemon",
                    item.title,
                    catalogRow ? catalogRow.image_url : null,
                    item.price,
                    item.quantity,
                ]
            );

            console.log(`  + ${item.title}  $${item.price}  x${item.quantity}${catalogRow ? "  (catalog matched)" : ""}`);
        }

        console.log(`\nDone. Seeded ${SEED_LISTINGS.length} sealed listing(s), ${matched} matched to the catalog.`);
    } catch (error) {
        console.error("Seed failed:", error.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

main();
