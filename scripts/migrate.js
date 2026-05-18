#!/usr/bin/env node

/**
 * Simple database migration runner for PostgreSQL/Neon.
 * 
 * Tracks migrations in a pgmigrations table and runs SQL files in order.
 * Usage:
 *   node scripts/migrate.js       # Run pending migrations
 *   node scripts/migrate.js --status    # Show migration status
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "@neondatabase/serverless";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../migrations");

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
    console.error("ERROR: DATABASE_URL environment variable is not set.");
    process.exit(1);
}

const pool = new Pool({ connectionString: dbUrl });

/**
 * Ensure the migrations tracking table exists.
 */
async function ensureMigrationsTable(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS pgmigrations (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            hash TEXT NOT NULL,
            executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
}

/**
 * Get list of applied migrations.
 */
async function getAppliedMigrations(client) {
    const result = await client.query(
        "SELECT name FROM pgmigrations ORDER BY name ASC"
    );
    return result.rows.map((r) => r.name);
}

/**
 * Get list of pending migration files.
 */
function getPendingMigrationFiles() {
    if (!fs.existsSync(migrationsDir)) {
        return [];
    }

    return fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();
}

/**
 * Compute simple hash of SQL content for integrity checking.
 */
function computeHash(content) {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
}

/**
 * Run pending migrations.
 */
async function runMigrations() {
    const client = await pool.connect();

    try {
        console.log("[migrations] Connecting to database...");

        // Ensure migrations table exists
        await ensureMigrationsTable(client);
        console.log("[migrations] Migrations table ready.");

        const appliedNames = await getAppliedMigrations(client);
        const pendingFiles = getPendingMigrationFiles();

        const pending = pendingFiles.filter((f) => !appliedNames.includes(f));

        if (pending.length === 0) {
            console.log("[migrations] All migrations applied. No action taken.");
            return;
        }

        console.log(`[migrations] Found ${pending.length} pending migration(s).`);

        for (const migrationFile of pending) {
            const filePath = path.join(migrationsDir, migrationFile);
            const sql = fs.readFileSync(filePath, "utf8");
            const hash = computeHash(sql);

            console.log(`[migrations] Applying: ${migrationFile}...`);

            try {
                await client.query(sql);
                await client.query(
                    "INSERT INTO pgmigrations (name, hash) VALUES ($1, $2)",
                    [migrationFile, hash]
                );
                console.log(`[migrations] ✓ ${migrationFile} applied successfully.`);
            } catch (error) {
                console.error(`[migrations] ✗ ${migrationFile} FAILED:`, error.message);
                throw error;
            }
        }

        console.log(
            `[migrations] All ${pending.length} migration(s) applied successfully.`
        );
    } finally {
        client.release();
        await pool.end();
    }
}

/**
 * Show migration status.
 */
async function showStatus() {
    const client = await pool.connect();

    try {
        await ensureMigrationsTable(client);

        const applied = await getAppliedMigrations(client);
        const pending = getPendingMigrationFiles().filter((f) => !applied.includes(f));

        console.log("[migrations] Applied migrations:");
        if (applied.length === 0) {
            console.log("  (none)");
        } else {
            applied.forEach((m) => console.log(`  ✓ ${m}`));
        }

        console.log("[migrations] Pending migrations:");
        if (pending.length === 0) {
            console.log("  (none)");
        } else {
            pending.forEach((m) => console.log(`  ○ ${m}`));
        }
    } finally {
        client.release();
        await pool.end();
    }
}

async function main() {
    const args = process.argv.slice(2);

    if (args.includes("--status")) {
        await showStatus();
    } else {
        await runMigrations();
    }
}

main().catch((error) => {
    console.error("[migrations] Fatal error:", error.message);
    process.exit(1);
});
