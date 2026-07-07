import "server-only";

import { db } from "@/lib/db";

// Syncs a vendor's Square inventory into their marketplace listings. Square is the source of truth:
// rows present here are upserted (price + quantity updated, or inserted if new), and any prior
// square-synced listing NOT in this set is delisted. Listings the vendor added by hand or via CSV
// (source IS NULL) are never touched — we only manage rows we created (source = 'square_sync').
//
// Each row: { catalogProductId, kind: 'single'|'sealed', condition, title, setName, cardNumber,
//             imageUrl, game, price, quantity }. Matching key is (catalog_product_id, condition,
//             kind) scoped to this vendor's square_sync rows.
//
// Pass { dryRun: true } to compute the same counts without writing anything (used for the preview).

const SOURCE = "square_sync";

function keyOf(catalogProductId, condition, kind) {
    return `${catalogProductId}|${condition ?? ""}|${kind}`;
}

export async function syncListingsFromSquare(vendorId, rows, { dryRun = false } = {}) {
    if (!vendorId) throw new Error("vendorId is required");

    // Normalize + validate incoming rows, de-duped by (catalog id, condition, kind).
    const incoming = new Map();
    for (const r of Array.isArray(rows) ? rows : []) {
        const cid = Number(r?.catalogProductId);
        const price = Number(r?.price);
        const qty = Math.trunc(Number(r?.quantity));
        if (!Number.isInteger(cid) || cid <= 0) continue;
        if (!Number.isFinite(price) || price < 0) continue;
        if (!Number.isFinite(qty) || qty <= 0) continue;
        if (!r?.title) continue;
        const kind = r.kind === "single" ? "single" : "sealed";
        const condition = kind === "single" ? (r.condition || "NM") : null;
        incoming.set(keyOf(cid, condition, kind), {
            cid, price, qty, kind, condition,
            title: String(r.title),
            setName: r.setName || null,
            cardNumber: r.cardNumber || null,
            imageUrl: r.imageUrl || null,
            game: r.game || null,
        });
    }

    // Guard the FK: only keep rows whose catalog id actually exists in tcg_cards.
    const cids = [...new Set([...incoming.values()].map((v) => v.cid))];
    const validCids = new Set();
    if (cids.length) {
        const found = await db.query(`SELECT id FROM tcg_cards WHERE id = ANY($1)`, [cids]);
        found.forEach((row) => validCids.add(Number(row.id)));
    }

    // Existing square-synced listings for this vendor, to decide update-vs-insert and what to prune.
    const existing = await db.query(
        `SELECT id, kind, catalog_product_id, condition, status
           FROM mkt_listing
          WHERE vendor_id = $1 AND source = $2`,
        [vendorId, SOURCE],
    );
    const existingByKey = new Map();
    for (const e of existing) {
        existingByKey.set(keyOf(Number(e.catalog_product_id), e.condition, e.kind), e);
    }

    let created = 0;
    let updated = 0;
    let delisted = 0;
    let skipped = 0;
    const seen = new Set();

    for (const [key, v] of incoming) {
        if (!validCids.has(v.cid)) { skipped += 1; continue; }
        seen.add(key);
        const match = existingByKey.get(key);
        if (match) {
            updated += 1;
            if (!dryRun) {
                await db.query(
                    `UPDATE mkt_listing
                        SET price = $1, quantity = $2, title = $3, set_name = $4, card_number = $5,
                            image_url = $6, game = $7, status = 'active', source = $8, updated_at = NOW()
                      WHERE id = $9`,
                    [v.price, v.qty, v.title, v.setName, v.cardNumber, v.imageUrl, v.game, SOURCE, match.id],
                );
            }
        } else {
            created += 1;
            if (!dryRun) {
                await db.query(
                    `INSERT INTO mkt_listing
                        (vendor_id, kind, catalog_product_id, game, title, set_name, card_number,
                         image_url, condition, price, quantity, status, source)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active', $12)`,
                    [vendorId, v.kind, v.cid, v.game, v.title, v.setName, v.cardNumber,
                     v.imageUrl, v.condition, v.price, v.qty, SOURCE],
                );
            }
        }
    }

    // Square is source of truth: delist any active square-synced listing that's no longer in Square.
    const toDelist = existing
        .filter((e) => e.status === "active" && !seen.has(keyOf(Number(e.catalog_product_id), e.condition, e.kind)))
        .map((e) => e.id);
    delisted = toDelist.length;
    if (!dryRun && toDelist.length) {
        await db.query(
            `UPDATE mkt_listing SET status = 'deleted', quantity = 0, updated_at = NOW() WHERE id = ANY($1)`,
            [toDelist],
        );
    }

    return { created, updated, delisted, skipped, dryRun };
}
