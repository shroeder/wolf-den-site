import "server-only";

import { Pool } from "@neondatabase/serverless";

import { createServerLogger } from "@/lib/server-logger";

let pool = null;
const dbLogger = createServerLogger({ source: "db", subsystem: "neon" });

function getPool() {
    if (pool) {
        return pool;
    }

    dbLogger.info("db.env.validation.started", {
        step: "env_validation_started",
    });

    const url = process.env.DATABASE_URL;

    if (!url) {
        dbLogger.error("db.env.validation.failed", {
            step: "env_validation_failed",
            reason: "missing_database_url",
        });

        throw new Error("Missing DATABASE_URL environment variable.");
    }

    dbLogger.info("db.env.validation.passed", {
        step: "env_validation_passed",
    });

    pool = new Pool({ connectionString: url });

    return pool;
}

export const db = {
    query: async (query, params = []) => {
        const normalizedQuery = typeof query === "string" ? query.replace(/\s+/g, " ").trim() : "<non_string_query>";

        dbLogger.info("db.query.started", {
            step: "database_query_started",
            queryPreview: normalizedQuery.slice(0, 140),
            paramCount: Array.isArray(params) ? params.length : 0,
        });

        try {
            const client = await getPool().connect();

            try {
                const result = await client.query(query, params);

                dbLogger.info("db.query.succeeded", {
                    step: "database_query_succeeded",
                    rowCount: result.rowCount,
                    queryPreview: normalizedQuery.slice(0, 140),
                });

                return result.rows;
            } finally {
                client.release();
            }
        } catch (error) {
            dbLogger.error("db.query.failed", error, {
                step: "database_query_failed",
                queryPreview: normalizedQuery.slice(0, 140),
                dbCode: error?.code,
            });

            const wrappedError = new Error(`Database query failed: ${error.message}`);

            wrappedError.code = "db_query_failed";
            wrappedError.dbCode = error?.code;

            throw wrappedError;
        }
    },
    queryOne: async (query, params = []) => {
        const rows = await db.query(query, params);

        return rows[0] || null;
    },
};

/**
 * Deprecated: Schema is now managed by migrations (migrations/ directory).
 * This function is kept for backward compatibility with existing setup scripts.
 * 
 * New schema changes should be added as SQL migrations files, not here.
 * Run: npm run db:migrate
 */
export async function ensureSchema() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS consignors (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            slug TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            square_category_id TEXT NOT NULL,
            payout_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.5000,
            password_hash TEXT,
            must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS consignor_setup_tokens (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            consignor_id UUID NOT NULL REFERENCES consignors(id) ON DELETE CASCADE,
            token_hash TEXT NOT NULL,
            expires_at TIMESTAMPTZ NOT NULL,
            used_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    await db.query(`
        CREATE INDEX IF NOT EXISTS idx_setup_tokens_consignor_id ON consignor_setup_tokens(consignor_id);
        CREATE INDEX IF NOT EXISTS idx_setup_tokens_token_hash ON consignor_setup_tokens(token_hash);
    `);
}
