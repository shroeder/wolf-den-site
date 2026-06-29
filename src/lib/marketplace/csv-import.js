import "server-only";

import { db } from "@/lib/db";
import { createListing } from "@/lib/marketplace/listings.js";

// Singles CSV import (TCGplayer seller export). The reliable match key is the "TCGplayer Id" column,
// which IS our tcg_cards.id — so matching is an exact id lookup, not fuzzy. Rows whose id isn't in
// our catalog still import as snapshot listings (catalog_product_id null); rows without a usable
// price are flagged and skipped. Flow: buildImportPreview() -> vendor reviews -> commitImport().

const CONDITION_PREFIX = [
    ["near mint", "NM"],
    ["lightly played", "LP"],
    ["moderately played", "MP"],
    ["heavily played", "HP"],
    ["damaged", "DMG"],
];

// Minimal RFC-4180 CSV parser (handles quoted fields, escaped quotes, CRLF).
export function parseCsv(text) {
    const rows = [];
    let field = "";
    let row = [];
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const c = text[i];

        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += c;
            }
        } else if (c === '"') {
            inQuotes = true;
        } else if (c === ",") {
            row.push(field);
            field = "";
        } else if (c === "\n") {
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
        } else if (c !== "\r") {
            field += c;
        }
    }

    if (field.length || row.length) {
        row.push(field);
        rows.push(row);
    }

    return rows;
}

function normalizeHeader(h) {
    return String(h || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function pick(obj, candidates) {
    for (const key of candidates) {
        if (obj[key] !== undefined && String(obj[key]).trim() !== "") {
            return String(obj[key]).trim();
        }
    }
    return null;
}

function mapCondition(raw) {
    const value = String(raw || "").toLowerCase();
    for (const [prefix, code] of CONDITION_PREFIX) {
        if (value.startsWith(prefix)) {
            return code;
        }
    }
    return null;
}

function normalizeGame(raw) {
    const value = String(raw || "").toLowerCase();
    if (value.includes("pok")) return "pokemon";
    if (value.includes("magic")) return "magic";
    return null;
}

function parsePrice(raw) {
    if (raw === null || raw === undefined) return null;
    const cleaned = String(raw).replace(/[^0-9.]/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
}

// Parse raw CSV text into reviewable rows, resolving each against the catalog by TCGplayer Id.
export async function buildImportPreview(text) {
    const grid = parseCsv(text);

    if (grid.length < 2) {
        return { rows: [], summary: { total: 0, importable: 0, inCatalog: 0, snapshot: 0, skipped: 0 } };
    }

    const headers = grid[0].map(normalizeHeader);
    const records = grid.slice(1).filter((r) => r.some((c) => String(c).trim() !== "")).map((r) => {
        const obj = {};
        headers.forEach((h, idx) => {
            obj[h] = r[idx];
        });
        return obj;
    });

    // Resolve all TCGplayer ids against the catalog in one query.
    const ids = [];
    for (const rec of records) {
        const id = pick(rec, ["tcgplayerid", "productid", "tcgplayerproductid"]);
        if (id && /^\d+$/.test(id)) {
            ids.push(Number(id));
        }
    }

    const catalog = new Map();
    if (ids.length) {
        const catalogRows = await db.query(
            `SELECT c.id, c.name, c.number, c.image_url, c.game, s.name AS set_name
             FROM tcg_cards c JOIN tcg_sets s ON s.id = c.set_id
             WHERE c.id = ANY($1)`,
            [ids]
        );
        for (const row of catalogRows) {
            catalog.set(String(row.id), row);
        }
    }

    const rows = records.map((rec, index) => {
        const rawId = pick(rec, ["tcgplayerid", "productid", "tcgplayerproductid"]);
        const catalogId = rawId && /^\d+$/.test(rawId) ? rawId : null;
        const match = catalogId ? catalog.get(catalogId) : null;

        const csvName = pick(rec, ["productname", "name", "title"]);
        const conditionRaw = pick(rec, ["condition"]);
        const condition = mapCondition(conditionRaw);
        const kind = conditionRaw && !/unopened|sealed/i.test(conditionRaw) ? "single" : "sealed";

        const price = parsePrice(
            pick(rec, ["tcgmarketplaceprice", "marketplaceprice", "myprice", "price"]) ||
                pick(rec, ["tcgmarketprice", "marketprice"])
        );
        const quantity = Number(pick(rec, ["totalquantity", "quantity", "addtoquantity"]) || "0");

        const title = match ? match.name : csvName;
        const reasons = [];
        if (!title) reasons.push("no product name");
        if (price === null) reasons.push("no price");
        if (!Number.isFinite(quantity) || quantity <= 0) reasons.push("no quantity");

        return {
            index,
            // matchType: catalog (linked to tcg_cards), snapshot (id/name only), or skip.
            matchType: reasons.length ? "skip" : match ? "catalog" : "snapshot",
            reasons,
            catalogProductId: match ? String(match.id) : null,
            title,
            setName: match ? match.set_name : pick(rec, ["setname", "set"]),
            cardNumber: match ? match.number : pick(rec, ["number", "cardnumber", "collectornumber"]),
            imageUrl: match ? match.image_url : pick(rec, ["photourl", "imageurl", "image"]),
            game: match ? match.game : normalizeGame(pick(rec, ["productline", "game"])),
            kind,
            condition: kind === "single" ? condition : null,
            price,
            quantity: Number.isFinite(quantity) ? Math.max(0, Math.trunc(quantity)) : 0,
        };
    });

    const importable = rows.filter((r) => r.matchType !== "skip");

    return {
        rows,
        summary: {
            total: rows.length,
            importable: importable.length,
            inCatalog: rows.filter((r) => r.matchType === "catalog").length,
            snapshot: rows.filter((r) => r.matchType === "snapshot").length,
            skipped: rows.filter((r) => r.matchType === "skip").length,
        },
    };
}

// Create listings for the supplied (already-reviewed) rows. Re-validates each and guards the catalog
// FK by confirming the id still exists. Returns created/failed counts.
export async function commitImport(vendorId, rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
        return { created: 0, failed: 0 };
    }

    // Confirm any claimed catalog ids actually exist (guards the FK).
    const claimedIds = rows.map((r) => r.catalogProductId).filter((id) => id && /^\d+$/.test(id)).map(Number);
    const valid = new Set();
    if (claimedIds.length) {
        const found = await db.query(`SELECT id FROM tcg_cards WHERE id = ANY($1)`, [claimedIds]);
        found.forEach((row) => valid.add(String(row.id)));
    }

    let created = 0;
    let failed = 0;

    for (const row of rows) {
        const price = Number(row.price);
        const quantity = Number(row.quantity);

        if (!row.title || !Number.isFinite(price) || price < 0 || !Number.isFinite(quantity) || quantity <= 0) {
            failed += 1;
            continue;
        }

        const catalogProductId = row.catalogProductId && valid.has(String(row.catalogProductId)) ? row.catalogProductId : null;

        try {
            await createListing({
                vendorId,
                kind: row.kind === "single" ? "single" : "sealed",
                catalogProductId,
                game: row.game || null,
                title: row.title,
                setName: row.setName || null,
                cardNumber: row.cardNumber || null,
                imageUrl: row.imageUrl || null,
                condition: row.kind === "single" ? row.condition : null,
                price,
                quantity: Math.trunc(quantity),
            });
            created += 1;
        } catch {
            failed += 1;
        }
    }

    return { created, failed };
}
