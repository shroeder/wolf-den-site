/**
 * Seed helper script for consignors with email-based setup tokens.
 * Usage: node scripts/seed-consignor.js --slug pedro --name "Pedro" --email pedro@example.com --category CATEGORY_ID --rate 0.5
 */

import { argv } from "node:process";
import { db, ensureSchema } from "../src/lib/db.js";
import { createSetupToken } from "../src/lib/consignment/tokens.js";
import { sendSetupEmail } from "../src/lib/consignment/email.js";

function parseArgs() {
    const args = {};

    for (let i = 2; i < argv.length; i += 2) {
        const key = argv[i].replace(/^--/, "");
        const value = argv[i + 1];

        args[key] = value;
    }

    return args;
}

function validateArgs(args) {
    const required = ["slug", "name", "email", "category", "rate"];
    const missing = required.filter((key) => !args[key]);

    if (missing.length > 0) {
        throw new Error(`Missing required args: ${missing.join(", ")}`);
    }

    const rate = Number(args.rate);

    if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
        throw new Error("Rate must be a number between 0 and 1");
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(args.email)) {
        throw new Error("Invalid email address");
    }

    return {
        slug: args.slug.toLowerCase(),
        displayName: args.name,
        email: args.email.toLowerCase(),
        squareCategoryId: args.category,
        payoutRate: rate,
    };
}

async function seed() {
    try {
        const args = parseArgs();

        console.log("Setting up schema...");
        await ensureSchema();

        const config = validateArgs(args);

        console.log(`Inserting consignor: ${config.slug}...`);
        const result = await db.query(
            `INSERT INTO consignors (slug, display_name, email, square_category_id, payout_rate, active)
             VALUES ($1, $2, $3, $4, $5, TRUE)
             ON CONFLICT (slug) DO UPDATE
             SET display_name = $2, email = $3, square_category_id = $4, payout_rate = $5, updated_at = NOW()
             RETURNING id`,
            [config.slug, config.displayName, config.email, config.squareCategoryId, config.payoutRate]
        );

        const consignorId = result[0]?.id;

        if (!consignorId) {
            throw new Error("Failed to insert consignor");
        }

        console.log(`Generating setup token for ${config.slug}...`);
        const setupToken = await createSetupToken(consignorId);

        console.log(`Sending setup email to ${config.email}...`);
        await sendSetupEmail(
            {
                display_name: config.displayName,
                email: config.email,
            },
            setupToken
        );

        console.log(`✓ Consignor '${config.slug}' created. Setup email sent to ${config.email}`);
    } catch (error) {
        console.error("✗ Seed failed:", error.message);
        process.exit(1);
    }
}

seed();
