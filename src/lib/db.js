import "server-only";

import { Pool } from "@neondatabase/serverless";

let pool = null;

function getPool() {
    if (pool) {
        return pool;
    }

    const url = process.env.DATABASE_URL;

    if (!url) {
        throw new Error("Missing DATABASE_URL environment variable.");
    }

    pool = new Pool({ connectionString: url });

    return pool;
}

export const db = {
    query: async (query, params = []) => {
        try {
            const client = await getPool().connect();

            try {
                const result = await client.query(query, params);

                return result.rows;
            } finally {
                client.release();
            }
        } catch (error) {
            throw new Error(`Database query failed: ${error.message}`);
        }
    },
    queryOne: async (query, params = []) => {
        const rows = await db.query(query, params);

        return rows[0] || null;
    },
};

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
