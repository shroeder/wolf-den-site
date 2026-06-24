#!/usr/bin/env node

/**
 * Seed the first admin-app owner account.
 *
 * The /api/admin-app/users routes are gated by the `staff.manage` permission,
 * which only an owner has — so the very first owner must be created out-of-band.
 *
 * Usage:
 *   node scripts/seed-admin-app-owner.js --email you@example.com --name "Luke" --password "secret123"
 *
 * Or via env vars: ADMIN_APP_OWNER_EMAIL, ADMIN_APP_OWNER_NAME, ADMIN_APP_OWNER_PASSWORD
 *
 * If the email already exists, it is promoted to an active owner and its
 * password is reset to the supplied value (idempotent / recovery friendly).
 */

import { Pool } from "@neondatabase/serverless";
import bcryptjs from "bcryptjs";

const SALT_ROUNDS = 10;

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

async function main() {
    const dbUrl = process.env.DATABASE_URL;

    if (!dbUrl) {
        console.error("ERROR: DATABASE_URL environment variable is not set.");
        process.exit(1);
    }

    const args = parseArgs(process.argv.slice(2));
    const email = (args.email || process.env.ADMIN_APP_OWNER_EMAIL || "").trim();
    const displayName = (args.name || process.env.ADMIN_APP_OWNER_NAME || "").trim();
    const password = args.password || process.env.ADMIN_APP_OWNER_PASSWORD || "";

    if (!email || !displayName || !password) {
        console.error("ERROR: --email, --name and --password are all required.");
        console.error('Example: node scripts/seed-admin-app-owner.js --email you@example.com --name "Luke" --password "secret123"');
        process.exit(1);
    }

    if (password.length < 8) {
        console.error("ERROR: password must be at least 8 characters.");
        process.exit(1);
    }

    const emailNormalized = email.toLowerCase();
    const passwordHash = await bcryptjs.hash(password, SALT_ROUNDS);
    const pool = new Pool({ connectionString: dbUrl });
    const client = await pool.connect();

    try {
        const existing = await client.query(
            "SELECT id FROM admin_app_users WHERE email_normalized = $1",
            [emailNormalized]
        );

        if (existing.rows.length) {
            await client.query(
                `UPDATE admin_app_users
                 SET role = 'owner', active = TRUE, password_hash = $1,
                     must_change_password = FALSE, updated_at = NOW()
                 WHERE email_normalized = $2`,
                [passwordHash, emailNormalized]
            );

            console.log(`[seed] Existing user ${email} promoted to active owner and password reset.`);
        } else {
            const result = await client.query(
                `INSERT INTO admin_app_users (email, email_normalized, display_name, password_hash, role, active, must_change_password)
                 VALUES ($1, $2, $3, $4, 'owner', TRUE, FALSE)
                 RETURNING id`,
                [email, emailNormalized, displayName, passwordHash]
            );

            console.log(`[seed] Owner created: ${email} (id ${result.rows[0].id}).`);
        }
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((error) => {
    console.error("[seed] Fatal error:", error.message);
    process.exit(1);
});
