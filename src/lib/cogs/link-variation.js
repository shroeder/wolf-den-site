import "server-only";

import { createServerLogger } from "@/lib/server-logger";

const logger = createServerLogger({ source: "api", subsystem: "cogs-link" });

const SQUARE_API = "https://connect.squareup.com";

// ── MATCHING A PURCHASE TO THE THING THAT WAS BOUGHT ─────────────────────────────────────────────────────────
// FIFO needs to know WHICH item a restock was for. The intake form asks for a product name typed by hand, so
// 216 of 219 ledger rows have no catalog link and FIFO has nothing to stack.
//
// ⚠️ THIS ONLY EVER CLAIMS AN EXACT, UNAMBIGUOUS MATCH, AND THAT IS THE WHOLE DESIGN. Measured against the
// real ledger, normalised exact matching resolves 47 of 193 names (24%); the other 142 are things like
// "Coke 16.9oz", "Binder", "Champion Deck" and "Ascended Heroes EX Box (Break to Singles)" — names that are
// not Square items at all, or bulk that gets broken into singles and never exists as one item.
//
// A fuzzy matcher would "resolve" most of those and attach the wrong cost to a real product, silently, on a
// report somebody prices stock from. Wrong cost is worse than no cost: no cost shows up as an unresolved line
// that can be chased, while a wrong one looks exactly like an answer. So anything short of certain returns
// null and waits for a human.
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

let cache = null;
let cachedAt = 0;
const TTL_MS = 10 * 60 * 1000;

/** normalised item name -> [variationId]. One catalog sweep, memoised, because it is 2,500 items. */
async function catalogByName() {
    if (cache && Date.now() - cachedAt < TTL_MS) return cache;
    const token = process.env.SQUARE_ACCESS_TOKEN;
    if (!token) return cache || new Map();

    const map = new Map();
    let cursor = null;
    try {
        do {
            const res = await fetch(`${SQUARE_API}/v2/catalog/search`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ object_types: ["ITEM"], include_deleted_objects: false, limit: 200, ...(cursor ? { cursor } : {}) }),
            });
            const json = await res.json();
            if (json?.errors) throw new Error(JSON.stringify(json.errors).slice(0, 160));
            for (const item of json.objects || []) {
                const key = norm(item.item_data?.name);
                if (!key) continue;
                for (const v of item.item_data?.variations || []) {
                    if (!map.has(key)) map.set(key, []);
                    map.get(key).push(v.id);
                }
            }
            cursor = json.cursor || null;
        } while (cursor);
    } catch (error) {
        logger.warn("cogs.link.catalog_failed", { message: error?.message });
        return cache || new Map();
    }

    cache = map;
    cachedAt = Date.now();
    return map;
}

/**
 * The single Square variation this product name certainly means, or null.
 *
 * Returns null for "no match" AND for "more than one match" — both mean a person has to say which, and the
 * caller cannot tell them apart without guessing. `reason` is there for the review list.
 */
export async function resolveVariationByName(productName) {
    const key = norm(productName);
    if (!key) return { variationId: null, reason: "empty" };
    const map = await catalogByName();
    const hit = map.get(key);
    if (!hit?.length) return { variationId: null, reason: "no_match" };
    if (hit.length > 1) return { variationId: null, reason: "ambiguous", candidates: hit.length };
    return { variationId: hit[0], reason: "exact" };
}
