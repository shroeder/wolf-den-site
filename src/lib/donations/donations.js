import "server-only";

import { db } from "@/lib/db";

// Donations data layer: a flat record of what customers gave to the store. Recorded from the admin app.
function mapDonation(row) {
    return {
        id: row.id,
        amount: Number(row.amount || 0),
        itemDescription: row.item_description || null,
        donorName: row.donor_name || null,
        notes: row.notes || null,
        createdBy: row.created_by || null,
        createdAt: row.created_at,
    };
}

// Idempotent on the donation id, so an app retry never double-posts.
export async function createDonation(input) {
    const id = String(input?.id || "").trim();
    if (!id) throw new Error("A donation id is required.");
    const existing = await db.queryOne(`SELECT id FROM donation WHERE id = $1`, [id]).catch(() => null);
    if (existing) {
        return { donation: mapDonation(await db.queryOne(`SELECT * FROM donation WHERE id = $1`, [id])), created: false };
    }
    await db.query(
        `INSERT INTO donation (id, amount, item_description, donor_name, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
            id,
            Math.max(0, Number(input.amount) || 0),
            input.itemDescription ? String(input.itemDescription).trim() : null,
            input.donorName ? String(input.donorName).trim() : null,
            input.notes ? String(input.notes).trim() : null,
            input.createdBy || null,
        ]
    );
    return { donation: mapDonation(await db.queryOne(`SELECT * FROM donation WHERE id = $1`, [id])), created: true };
}

export async function listDonations({ limit = 100, offset = 0 } = {}) {
    const rows = await db
        .query(`SELECT * FROM donation ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [Math.max(1, Math.min(200, Number(limit) || 100)), Math.max(0, Number(offset) || 0)])
        .catch(() => []);
    return rows.map(mapDonation);
}

// Total donated to date (for the admin tab header).
export async function donationTotals() {
    const row = await db.queryOne(`SELECT COUNT(*)::int AS n, COALESCE(SUM(amount), 0) AS total FROM donation`).catch(() => null);
    return { count: row?.n || 0, total: Number(row?.total || 0) };
}
