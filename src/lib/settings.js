import "server-only";

import { db } from "@/lib/db";

// Tiny key/value settings store (mkt_setting). Used for marketplace-wide values like the default sprite.
export async function getSetting(key, fallback = null) {
    const row = await db.queryOne(`SELECT value FROM mkt_setting WHERE key = $1`, [key]).catch(() => null);
    return row?.value ?? fallback;
}

export async function setSetting(key, value) {
    await db.query(
        `INSERT INTO mkt_setting (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, value == null ? null : String(value)]
    );
    return value;
}
