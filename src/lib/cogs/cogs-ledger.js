import "server-only";

import { db } from "@/lib/db";

function num(v) {
    return v == null ? null : Number(v);
}

function mapRow(r) {
    const on = r.occurred_on instanceof Date ? r.occurred_on.toISOString().slice(0, 10) : String(r.occurred_on).slice(0, 10);
    return {
        id: r.id,
        occurredOn: on,
        product: r.product || "",
        quantity: Number(r.quantity),
        paidEach: Number(r.paid_each),
        paidTotal: Number(r.paid_total),
        marketEach: num(r.market_each),
        marketTotal: num(r.market_total),
        listEach110: num(r.list_each_110),
        listTotal110: num(r.list_total_110),
        entryId: r.entry_id || null,
        source: r.source,
    };
}

export async function listCogs({ limit = 5000, offset = 0 } = {}) {
    const rows = await db.query(
        `SELECT * FROM cogs_ledger ORDER BY occurred_on DESC, created_at DESC LIMIT $1 OFFSET $2`,
        [Number(limit), Number(offset)],
    );
    return rows.map(mapRow);
}

function normalize(input) {
    if (input?.occurredOn == null) throw new Error("occurredOn is required.");
    return {
        occurredOn: input.occurredOn,
        product: String(input.product || ""),
        quantity: Number(input.quantity) || 0,
        paidEach: Number(input.paidEach) || 0,
        paidTotal: Number(input.paidTotal) || 0,
        marketEach: input.marketEach != null ? Number(input.marketEach) : null,
        marketTotal: input.marketTotal != null ? Number(input.marketTotal) : null,
        listEach110: input.listEach110 != null ? Number(input.listEach110) : null,
        listTotal110: input.listTotal110 != null ? Number(input.listTotal110) : null,
        entryId: input.entryId ? String(input.entryId).trim() : null,
    };
}

const COLS = `occurred_on, product, quantity, paid_each, paid_total, market_each, market_total, list_each_110, list_total_110, entry_id, source`;

function params(e, source) {
    return [e.occurredOn, e.product, e.quantity, e.paidEach, e.paidTotal, e.marketEach, e.marketTotal, e.listEach110, e.listTotal110, e.entryId, source];
}

// Insert an intake row. Rows synced from an Inventory entry carry an entry_id and upsert (dedupe);
// COGS-Entry rows have no entry_id and always insert fresh.
export async function insertCogs(input) {
    const e = normalize(input);
    if (e.entryId) {
        const rows = await db.query(
            `INSERT INTO cogs_ledger (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             ON CONFLICT (entry_id) WHERE entry_id IS NOT NULL
             DO UPDATE SET occurred_on=EXCLUDED.occurred_on, product=EXCLUDED.product, quantity=EXCLUDED.quantity,
                 paid_each=EXCLUDED.paid_each, paid_total=EXCLUDED.paid_total, market_each=EXCLUDED.market_each,
                 market_total=EXCLUDED.market_total, list_each_110=EXCLUDED.list_each_110, list_total_110=EXCLUDED.list_total_110
             RETURNING *`,
            params(e, "app"),
        );
        return mapRow(rows[0]);
    }
    const rows = await db.query(
        `INSERT INTO cogs_ledger (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        params(e, "app"),
    );
    return mapRow(rows[0]);
}

export async function deleteCogsByEntryId(entryId) {
    const id = entryId ? String(entryId).trim() : "";
    if (!id) return 0;
    const rows = await db.query(`DELETE FROM cogs_ledger WHERE entry_id = $1 RETURNING id`, [id]);
    return rows.length;
}

export async function deleteCogsRow(id) {
    const rid = id ? String(id).trim() : "";
    if (!rid) return 0;
    const rows = await db.query(`DELETE FROM cogs_ledger WHERE id = $1 RETURNING id`, [rid]);
    return rows.length;
}

// One-time cutover: replace the table with a verbatim copy of the current sheet intake rows.
export async function replaceAllFromImport(rows) {
    const list = Array.isArray(rows) ? rows : [];
    return db.tx(async (client) => {
        await client.query(`TRUNCATE cogs_ledger`);
        let inserted = 0;
        for (const raw of list) {
            let e;
            try {
                e = normalize(raw);
            } catch {
                continue;
            }
            if (e.entryId) {
                await client.query(
                    `INSERT INTO cogs_ledger (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'sheets-import')
                     ON CONFLICT (entry_id) WHERE entry_id IS NOT NULL DO UPDATE SET product=EXCLUDED.product`,
                    params(e, "sheets-import").slice(0, 10),
                );
            } else {
                await client.query(
                    `INSERT INTO cogs_ledger (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'sheets-import')`,
                    params(e, "sheets-import").slice(0, 10),
                );
            }
            inserted += 1;
        }
        return inserted;
    });
}
