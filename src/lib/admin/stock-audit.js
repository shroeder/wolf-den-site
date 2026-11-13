import "server-only";

import { db } from "@/lib/db";
import { writeOffInventory } from "@/lib/consignment/square";
import { createServerLogger } from "@/lib/server-logger";

const logger = createServerLogger({ source: "api", subsystem: "stock-audit" });

// ── COUNTING THE CASE ────────────────────────────────────────────────────────────────────────────────────────
// Luke, 2026-11-13: "we need something in both apps to manually verify what we have for singles, that way we
// can conclusively say what we dont have once we finish a comprehensive review."
//
// 1,465 singles are in stock, worth about $16,500. The order that started this had four cards that Square
// believed were in the case and were not, with no system event between being counted in last spring and being
// sold in November — so there is nothing to trace and nothing to fix in code. Somebody has to look.
//
// ⚠️ THE WORKLIST IS ORDERED BY HOW LONG SINCE ANYTHING HAPPENED TO THE CARD, not alphabetically. 320 singles
// have had no event in over 90 days and another 236 were never stamped at all; those are where the next four
// missing cards are, because a card that moved last week was in somebody's hand last week. Alphabetical order
// would spend the first hour of a 1,465-card audit on cards that are provably fine.

/** The round a sweep belongs to. Month granularity: a comprehensive review is not a one-afternoon job. */
export function currentRound(now = new Date()) {
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

const TIERS = {
    all: [0, 1e9],
    under5: [0, 500],
    "5to20": [500, 2000],
    "20to50": [2000, 5000],
    "50plus": [5000, 1e9],
};

/**
 * The cards still to look at, worst-known-first.
 *
 * ⚠️ IT EXCLUDES WHAT HAS ALREADY BEEN SEEN THIS ROUND, which is what makes two people on two phones safe:
 * the employee's next card is never the one the owner just confirmed. The unique index on (round,
 * variation_id) is the backstop if both ask at the same instant.
 */
export async function auditWorklist({
    round = currentRound(),
    category = null,
    tier = "all",
    limit = 50,
    includeDone = false,
} = {}) {
    const [lo, hi] = TIERS[tier] || TIERS.all;
    const rows = await db.query(
        `SELECT f.variation_id, f.name, f.image_url, f.price, f.quantity, f.category_names AS category,
                f.last_change_at, f.last_change_kind,
                a.status AS audit_status, a.verified_at, a.verified_by
           FROM inventory_feed f
           LEFT JOIN mkt_stock_audit a
                  ON a.variation_id = f.variation_id AND a.round = $1
          WHERE f.in_stock = TRUE
            AND f.quantity > 0
            AND f.category_names ILIKE '%single%'
            AND ($2::text IS NULL OR f.category_names = $2)
            AND f.price * 100 >= $3 AND f.price * 100 < $4
            AND ($5::boolean OR a.status IS NULL)
          ORDER BY f.last_change_at ASC NULLS FIRST, f.price DESC
          LIMIT $6`,
        [round, category, lo, hi, includeDone, Math.min(300, Math.max(1, Number(limit) || 50))]
    ).catch((error) => { logger.warn("worklist failed", { message: error?.message }); return []; });

    return rows.map((r) => ({
        variationId: r.variation_id,
        name: r.name,
        imageUrl: r.image_url,
        priceCents: Math.round(Number(r.price || 0) * 100),
        quantity: Number(r.quantity) || 0,
        category: r.category,
        // How stale it is, which is the whole reason it is near the top of the list.
        lastChangeAt: r.last_change_at,
        daysQuiet: r.last_change_at
            ? Math.floor((Date.now() - new Date(r.last_change_at).getTime()) / 86400000)
            : null,
        auditStatus: r.audit_status || null,
        verifiedAt: r.verified_at || null,
        verifiedBy: r.verified_by || null,
    }));
}

/** How far through a round the shop is — the number that answers "have we finished". */
export async function auditProgress({ round = currentRound() } = {}) {
    const total = await db.queryOne(
        `SELECT COUNT(*)::int n, ROUND(SUM(price))::int value
           FROM inventory_feed
          WHERE in_stock AND quantity > 0 AND category_names ILIKE '%single%'`
    ).catch(() => null);
    const seen = await db.query(
        `SELECT status, COUNT(*)::int n, COALESCE(SUM(price_cents), 0)::bigint cents
           FROM mkt_stock_audit WHERE round = $1 GROUP BY status`,
        [round]
    ).catch(() => []);

    const by = Object.fromEntries(seen.map((r) => [r.status, { count: r.n, cents: Number(r.cents) }]));
    return {
        round,
        inStock: total?.n ?? 0,
        inStockValue: Number(total?.value ?? 0),
        present: by.present?.count ?? 0,
        missing: by.missing?.count ?? 0,
        missingValueCents: by.missing?.cents ?? 0,
        skipped: by.skipped?.count ?? 0,
        checked: (by.present?.count ?? 0) + (by.missing?.count ?? 0),
    };
}

/**
 * Record one verdict, and act on it.
 *
 * ⚠️ 'missing' WRITES OFF IN SQUARE AND ZEROES THE LOCAL MIRROR IN THE SAME CALL. Square alone would be
 * correct within half an hour — the feed syncs on a 30-minute cron — and for that half hour the card is
 * still buyable on the website and still drawable by a virtual pack, which is precisely the failure this
 * whole feature exists to stop. Writing the mirror too closes the window immediately; the next sync agrees
 * with it rather than undoing it, because Square is the one being corrected.
 *
 * ⚠️ AND THE AUDIT ROW IS WRITTEN FIRST. If Square refuses, the shop still knows a person looked in the case
 * and did not find the card — that observation is the expensive part and the irreplaceable one. A failed
 * write-off leaves a card to pull by hand; a lost observation sends somebody back through the same drawer.
 */
export async function recordAudit({
    variationId,
    round = currentRound(),
    status,
    quantity = null,
    note = null,
    verifiedBy = null,
} = {}) {
    const id = String(variationId || "").trim();
    if (!id) return { ok: false, error: "no_variation" };
    if (!["present", "missing", "skipped"].includes(status)) return { ok: false, error: "bad_status" };

    const item = await db.queryOne(
        `SELECT name, price, quantity FROM inventory_feed WHERE variation_id = $1`,
        [id]
    ).catch(() => null);
    const priceCents = Math.round(Number(item?.price || 0) * 100);
    const expected = Number(item?.quantity) || 0;

    await db.query(
        `INSERT INTO mkt_stock_audit (variation_id, round, status, quantity, expected, name, price_cents, note, verified_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (round, variation_id) DO UPDATE
            SET status = EXCLUDED.status, quantity = EXCLUDED.quantity, expected = EXCLUDED.expected,
                note = EXCLUDED.note, verified_by = EXCLUDED.verified_by, verified_at = NOW()`,
        [id, round, status, quantity, expected, item?.name || null, priceCents, note, verifiedBy]
    );

    if (status !== "missing") return { ok: true, status, wroteOff: 0 };

    let wroteOff = 0;
    try {
        const res = await writeOffInventory([{ catalogObjectId: id, quantity: Math.max(1, expected) }], {
            idempotencyKey: `audit-${round}-${id}`,
        });
        wroteOff = res?.applied || 0;
        await db.query(
            `UPDATE inventory_feed SET quantity = 0, in_stock = FALSE, updated_at = NOW() WHERE variation_id = $1`,
            [id]
        ).catch(() => {});
        logger.info("stock_audit.written_off", { variationId: id, expected, priceCents });
    } catch (error) {
        logger.error("stock_audit.write_off_failed", error, { variationId: id });
        return { ok: true, status, wroteOff: 0, writeOffError: error?.message || "unknown" };
    }
    return { ok: true, status, wroteOff };
}
