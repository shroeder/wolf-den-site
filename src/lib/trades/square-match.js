import "server-only";

import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings.js";
import { createServerLogger } from "@/lib/server-logger";

const log = createServerLogger({ source: "job", subsystem: "trade-square-match" });

// ── TYING A TRADE TO THE SALE THAT SETTLED IT ────────────────────────────────────────────────────────────────
// A customer trades cards in and takes more value than they traded. The difference is collected on the Square
// POS, which happens AFTER the phone app has already written the trade — so there is no order id to store at
// the moment it is saved. This job supplies it afterwards.
//
// The fingerprint is exact and was validated against real data before any of this was written: across 71 cash
// trades and every Square order carrying an OTHER tender since 2026-06-05, this rule found all three known
// cases and produced no false positives.
//
//   same location · order within the window · an OTHER tender equal to the trade's own figure to the cent
//
// ⚠️ IT WILL NOT REWRITE MONEY ON ITS OWN. Attaching an order id is pure enrichment and always happens. Moving
// an amount out of cash_total is a change to somebody's books, so it is gated behind a setting that is OFF by
// default: the job reports what it WOULD move, and Luke turns it on once he has read a report he believes.
const WINDOW_MIN = 30;
const SETTING_AUTOFIX = "trade.autofix_cash_to_applied";

const SQUARE_API = "https://connect.squareup.com";
const sqHeaders = () => ({
    Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
    "Square-Version": process.env.SQUARE_API_VERSION || "2024-06-04",
});

async function squareOrdersWithOtherTender(startIso, endIso) {
    const locRes = await fetch(`${SQUARE_API}/v2/locations`, { headers: sqHeaders() });
    const locations = (await locRes.json())?.locations || [];
    const ids = locations.map((l) => l.id);
    if (!ids.length) return [];

    const out = [];
    let cursor;
    do {
        const body = {
            location_ids: ids,
            query: {
                filter: { date_time_filter: { created_at: { start_at: startIso, end_at: endIso } } },
                sort: { sort_field: "CREATED_AT", sort_order: "ASC" },
            },
            limit: 500,
            ...(cursor ? { cursor } : {}),
        };
        const res = await fetch(`${SQUARE_API}/v2/orders/search`, { method: "POST", headers: sqHeaders(), body: JSON.stringify(body) });
        const json = await res.json();
        if (json?.errors) throw new Error(`Square: ${JSON.stringify(json.errors)}`);
        for (const order of json?.orders || []) {
            for (const tender of order.tenders || []) {
                // "OTHER" is how a trade value gets tendered on the POS today. Naming that tender "Trade credit"
                // in Square would make this unambiguous — until then the amount is the only signal.
                if (tender.type !== "OTHER") continue;
                out.push({
                    orderId: order.id,
                    at: new Date(order.created_at).getTime(),
                    amount: Math.round((tender.amount_money?.amount || 0)) / 100,
                    orderTotal: Math.round((order.total_money?.amount || 0)) / 100,
                });
            }
        }
        cursor = json?.cursor;
    } while (cursor);
    return out;
}

/**
 * Match unlinked trades to the Square sale that settled them.
 *
 * Returns a report; sends nothing and (unless the autofix setting is on) changes no money. `dryRun` additionally
 * suppresses even the order-id attachment, so the job can always be inspected before it is trusted.
 */
export async function matchTradesToSquareSales({ dryRun = false, sinceDays = 45 } = {}) {
    const out = { dryRun, window: `${WINDOW_MIN}min`, linked: [], wouldCorrect: [], corrected: [], ambiguous: [], skipped: null };
    if (!process.env.SQUARE_ACCESS_TOKEN) { out.skipped = "square_not_configured"; return out; }

    const autofix = String(await getSetting(SETTING_AUTOFIX, "off").catch(() => "off")) === "on";
    out.autofix = autofix;

    const since = new Date(Date.now() - sinceDays * 86400000).toISOString();
    const trades = await db.query(
        `SELECT id, traded_at, offer_total, cash_total, applied_total
           FROM trade
          WHERE square_order_id IS NULL
            AND traded_at >= $1
            AND (applied_total > 0 OR cash_total > 0)
          ORDER BY traded_at ASC`,
        [since]
    ).catch(() => []);
    if (!trades.length) return out;

    const first = new Date(trades[0].traded_at).getTime() - WINDOW_MIN * 60000;
    const orders = await squareOrdersWithOtherTender(new Date(first).toISOString(), new Date().toISOString());
    out.otherTenderOrders = orders.length;

    for (const t of trades) {
        const at = new Date(t.traded_at).getTime();
        // The trade's own figure: what it says it settled with. For an applied trade that is applied_total;
        // for one recorded as cash it is the cash it claims to have paid out — which is the thing in doubt.
        const figure = Number(t.applied_total) > 0 ? Number(t.applied_total) : Number(t.cash_total);
        const hits = orders.filter((o) => Math.abs(o.at - at) <= WINDOW_MIN * 60000 && Math.abs(o.amount - figure) < 0.005);
        if (!hits.length) continue;
        if (hits.length > 1) {
            // Never guess between two. A human picks from a short list; a wrong silent link is worse than none.
            out.ambiguous.push({ trade: t.id, figure, candidates: hits.map((h) => h.orderId) });
            continue;
        }
        const hit = hits[0];
        const claimedCash = Number(t.cash_total) > 0;

        if (!dryRun) {
            await db.query(`UPDATE trade SET square_order_id = $2, square_matched_at = NOW() WHERE id = $1`, [t.id, hit.orderId]).catch(() => {});
        }
        out.linked.push({ trade: t.id, order: hit.orderId, figure, orderTotal: hit.orderTotal });

        if (!claimedCash) continue;
        // It says cash left the drawer, and Square says that amount was tendered against a sale instead.
        const fix = { trade: t.id, order: hit.orderId, moved: figure, from: "cash_total", to: "applied_total" };
        if (!autofix || dryRun) { out.wouldCorrect.push(fix); continue; }
        const note = `Cash payout reclassified to applied-to-sale by the matcher: Square order ${hit.orderId} tendered OTHER $${figure.toFixed(2)} against a $${hit.orderTotal.toFixed(2)} sale. No cash left the drawer.`;
        await db.query(
            `UPDATE trade
                SET cash_total = 0, applied_total = $2,
                    review_reason = NULL,
                    notes = CASE WHEN notes IS NULL OR notes = '' THEN $3 ELSE notes || ' | ' || $3 END
              WHERE id = $1`,
            [t.id, figure, note]
        ).catch(() => {});
        out.corrected.push(fix);
    }

    // Anything we would correct but are not allowed to, gets a standing flag so it is visible without re-running.
    for (const f of out.wouldCorrect) {
        if (dryRun) break;
        await db.query(
            `UPDATE trade SET review_reason = $2 WHERE id = $1 AND review_reason IS DISTINCT FROM $2`,
            [f.trade, `cash payout looks like trade value applied to Square order ${f.order}`]
        ).catch(() => {});
    }

    log.info("trade.square_match.done", {
        step: "done", linked: out.linked.length, corrected: out.corrected.length,
        wouldCorrect: out.wouldCorrect.length, ambiguous: out.ambiguous.length, autofix,
    });
    return out;
}
