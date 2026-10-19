import "server-only";

import { createServerLogger } from "@/lib/server-logger";

const logger = createServerLogger({ source: "api", subsystem: "cogs-stock-moves" });

const SQUARE_API = "https://connect.squareup.com";

// ── THE UNITS THAT LEAVE WITHOUT A SALE ──────────────────────────────────────────────────────────────────────
// FIFO was fed by Square ORDERS alone, so a batch was only ever spent by something that rang up. Stock leaves
// the shelf three ways here and only one of them rings up:
//
//   A SALE           register or online. An order exists, the reconciler already walks it.
//   A TRADE-OUT      a customer takes a box as the OUT side of a trade, paid in store credit. Our app moves
//                    the stock itself and NO Square order is created — verified on the 30th ETB: six units
//                    left this way across three trades and Square has no order line for any of them.
//   A PULL           somebody removes stock by hand (damage, a prize, a demo box). Square records it as
//                    IN_STOCK → NONE against the team member who did it.
//
// Neither of the last two consumed a batch, so FIFO kept holding boxes that were long gone and quoting the
// price of a layer the shelf had already finished. On the 30th ETB that was 20 phantom units: it reported 30
// on hand against Square's 7, and would have charged the next sale $140 when the only boxes left cost $115.
//
// ── WHY THIS READS SQUARE AND NOT OUR OWN TRADE TABLE ────────────────────────────────────────────────────────
// `trade_line` knows about trade-outs and nothing else, and it cannot tell us whether a given trade-out was
// also rung through the register (some trade credit IS spent at the till, as a gift-card tender, and those
// sales are already costed). Square's inventory log is the one place every unit that left the shelf appears
// exactly once, whatever moved it. Driving off it means a unit is counted once by construction rather than
// once by agreement between two systems.
export const CONSUMPTION_PREFIX = "inv-";

/** Is this a synthetic consumption row rather than a real sold line? Used wherever money is reported. */
export const isConsumptionRow = (orderId) => String(orderId || "").startsWith(CONSUMPTION_PREFIX);

async function squareFetch(path, { method = "GET", body } = {}) {
    const token = process.env.SQUARE_ACCESS_TOKEN;
    if (!token) throw new Error("SQUARE_ACCESS_TOKEN missing");
    const res = await fetch(`${SQUARE_API}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...(process.env.SQUARE_API_VERSION ? { "Square-Version": process.env.SQUARE_API_VERSION } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`Square ${path} ${res.status}: ${JSON.stringify(json?.errors || {}).slice(0, 200)}`);
    return json;
}

/**
 * Every unit that left the shelf for these items between `since` and now, as consumption events FIFO can walk.
 *
 * `sales` is the order-derived list the reconciler already built. It is used to recognise the stock movements
 * that are ALREADY accounted for, so they are not consumed twice:
 *
 *   ⚠️ A SOLD MOVEMENT IS A SALE'S FOOTPRINT, NOT A SECOND EVENT. Ringing up one box produces an order line
 *   AND an IN_STOCK → SOLD change. Consuming both would charge two boxes for one sale and empty the oldest
 *   batch at double speed — the same shape of error as the double-decrement incident, and just as quiet.
 *   So a SOLD change is matched against an unconsumed order line of the same item, same units, within ten
 *   minutes, and skipped when it finds one.
 *
 *   An UNMATCHED SOLD change is only taken when OUR app made it (`source.application_id`). That is the
 *   trade-out signature, and it is deliberately the narrow rule: anything else unmatched is counted and
 *   logged rather than consumed, because inventing consumption against a sale the matcher merely failed to
 *   pair would overstate cost and understate the shelf, and nothing downstream would question it.
 *
 * Returns { events, matched, unmatchedSold, pulls, tradeOuts }.
 */
export async function nonSaleConsumption(variationIds, since, sales = []) {
    const ids = [...new Set((variationIds || []).map((v) => String(v || "").trim()).filter(Boolean))];
    const out = { events: [], matched: 0, unmatchedSold: 0, pulls: 0, tradeOuts: 0 };
    if (!ids.length) return out;

    const ourApp = String(process.env.SQUARE_APPLICATION_ID || "").trim();

    // Order lines not yet accounted for, per item, so each SOLD footprint can claim one and only one.
    const unclaimed = new Map();
    for (const s of sales) {
        const key = String(s.variationId);
        if (!unclaimed.has(key)) unclaimed.set(key, []);
        unclaimed.get(key).push({ at: new Date(s.soldAt).getTime(), units: Number(s.units) || 0, used: false });
    }

    const changes = [];
    // Chunked: Square caps the id list, and the whole catalogue goes through here on a full run.
    for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        let cursor = null;
        do {
            const body = {
                catalog_object_ids: chunk,
                // TRANSFER is rejected by this endpoint ("`TRANSFER` type is not supported"). PHYSICAL_COUNT
                // is here because a recount that lands BELOW the running balance is stock that quietly went
                // missing, and it has to spend batches like any other departure — see the walk below.
                types: ["ADJUSTMENT", "PHYSICAL_COUNT"],
                ...(since ? { updated_after: new Date(since).toISOString() } : {}),
                limit: 1000,
                ...(cursor ? { cursor } : {}),
            };
            const page = await squareFetch("/v2/inventory/changes/batch-retrieve", { method: "POST", body });
            changes.push(...(page.changes || []));
            cursor = page.cursor || null;
        } while (cursor);
    }

    // ── ONE TIMELINE PER ITEM, WALKED IN ORDER ──────────────────────────────────────────────────────────────
    // The running balance is rebuilt the way Square builds it, because a PHYSICAL_COUNT does not say what it
    // changed — it states an absolute quantity, and the loss is the difference against what was on the books
    // a moment earlier. The 30th ETB's own history has one: a recount on 27 September took it from 29 to 26,
    // three boxes gone with no sale, no trade and no adjustment to point at.
    //
    // Without this the arithmetic lands in the wrong place and looks right: consuming only the trades and the
    // hand-pulls leaves the ETB holding 10 units and quoting $120, when the shelf holds 7 and the next box
    // genuinely cost $115.
    const timeline = new Map();
    for (const c of changes) {
        const a = c.adjustment || c.physical_count;
        if (!a) continue;
        const variationId = String(a.catalog_object_id || "");
        const at = String(a.occurred_at || a.created_at || "");
        if (!variationId || !at) continue;
        if (!timeline.has(variationId)) timeline.set(variationId, []);
        timeline.get(variationId).push({ kind: c.type, a, at });
    }

    const leaving = [];
    for (const [variationId, entries] of timeline) {
        entries.sort((x, y) => x.at.localeCompare(y.at));
        let running = 0;
        for (const { kind, a, at } of entries) {
            const qty = Number(a.quantity) || 0;
            if (kind === "PHYSICAL_COUNT") {
                if (String(a.state) !== "IN_STOCK") continue;
                const missing = running - qty;
                running = qty;
                // A count that finds MORE than the books is stock arriving from somewhere unrecorded. There
                // is no purchase to price it from, so inventing a layer here would be inventing a cost — it
                // is left to the purchase ledger, which is where stock is supposed to come from.
                if (missing > 0) leaving.push({ a, at, units: missing, variationId, recount: true });
                continue;
            }
            if (a.to_state === "IN_STOCK") running += qty;
            if (a.from_state === "IN_STOCK") {
                running -= qty;
                if (qty > 0) leaving.push({ a, at, units: qty, variationId, recount: false });
            }
        }
    }
    leaving.sort((x, y) => x.at.localeCompare(y.at));

    for (const entry of leaving) {
        const { a, variationId, units, recount } = entry;
        const at = new Date(entry.at);
        if (!variationId || !units || Number.isNaN(at.getTime())) continue;

        if (recount) {
            out.pulls += 1;
            out.events.push({
                orderId: `${CONSUMPTION_PREFIX}${a.id}`, lineUid: String(a.id), variationId, soldAt: at, units,
            });
            continue;
        }

        if (a.to_state === "SOLD") {
            const pool = unclaimed.get(variationId) || [];
            const hit = pool.find((p) => !p.used && p.units === units && Math.abs(p.at - at.getTime()) <= 10 * 60 * 1000);
            if (hit) { hit.used = true; out.matched += 1; continue; }
            // ⚠️ TWO WAYS TO RECOGNISE OUR OWN APP, BECAUSE ONE OF THEM MAY NOT BE DEPLOYED.
            // SQUARE_APPLICATION_ID is set on this machine and may not be in the server's env; the source
            // NAME comes back on the change itself and needs nothing configured. Either is proof enough that
            // the movement came from our software rather than the register, and requiring both would mean a
            // missing env var silently stops costing trade-outs — a feature that fails to the old bug.
            const byId = ourApp && String(a.source?.application_id || "") === ourApp;
            const byName = /wolf\s*den/i.test(String(a.source?.name || ""));
            if (!byId && !byName) { out.unmatchedSold += 1; continue; }
            out.tradeOuts += 1;
        } else {
            // IN_STOCK → NONE / WASTE / anything else. A unit that is simply gone.
            out.pulls += 1;
        }

        out.events.push({
            // A stable id so a re-run corrects this row instead of adding another beside it. Square's change
            // id is unique and permanent, which is exactly the property the (order_id, line_uid) key needs.
            orderId: `${CONSUMPTION_PREFIX}${a.id}`,
            lineUid: String(a.id),
            variationId,
            soldAt: at,
            units,
        });
    }

    logger.info("cogs.stock_moves.scanned", {
        items: ids.length, changes: changes.length, leaving: leaving.length,
        matched: out.matched, tradeOuts: out.tradeOuts, pulls: out.pulls, unmatchedSold: out.unmatchedSold,
    });
    return out;
}
