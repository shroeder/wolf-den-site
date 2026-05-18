/**
 * Optional setup/migration script for consignors table.
 * Run with: node scripts/setup-consignors.js
 */

import { ensureSchema } from "../src/lib/db.js";

async function run() {
    try {
        console.log("Creating consignors table if it does not exist...");
        await ensureSchema();
        console.log("✓ Schema ready.");
    } catch (error) {
        console.error("✗ Setup failed:", error.message);
        process.exit(1);
    }
}

run();
