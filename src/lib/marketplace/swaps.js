import "server-only";

import { db } from "@/lib/db";
import { sendSwapEmail, sendSwapResponseEmail } from "@/lib/marketplace/email.js";
import { createServerLogger } from "@/lib/server-logger";

// Inventory Swaps: two-sided barter between vendors. The proposer bundles what they'll give (offer)
// and what they want (request) into one proposal; the recipient approves or declines. Negotiation
// happens over identified email relay.

const swapsLogger = createServerLogger({ source: "api", subsystem: "marketplace-swaps" });

export async function createSwap({
    fromVendorId,
    toVendorId,
    offerListingIds = [],
    requestListingIds = [],
    cash = null,
    note = null,
}) {
    if (!toVendorId || toVendorId === fromVendorId) {
        throw new Error("Pick another vendor to swap with.");
    }
    const offerIds = [...new Set(offerListingIds)].slice(0, 30);
    const requestIds = [...new Set(requestListingIds)].slice(0, 30);
    if (offerIds.length === 0 || requestIds.length === 0) {
        throw new Error("Add at least one item to each side of the swap.");
    }

    const offerRows = await db.query(
        `SELECT id FROM mkt_listing WHERE id = ANY($1::uuid[]) AND vendor_id = $2 AND status = 'active'`,
        [offerIds, fromVendorId]
    );
    if (offerRows.length !== offerIds.length) {
        throw new Error("Some of your items are no longer available.");
    }
    const requestRows = await db.query(
        `SELECT id FROM mkt_listing WHERE id = ANY($1::uuid[]) AND vendor_id = $2 AND status = 'active' AND (dealer_available = TRUE OR vendor_only = TRUE)`,
        [requestIds, toVendorId]
    );
    if (requestRows.length !== requestIds.length) {
        throw new Error("Some of their items are no longer available to dealers.");
    }

    const cashVal = cash != null && cash !== "" && Number(cash) > 0 ? Number(cash) : null;
    const swap = await db.queryOne(
        `INSERT INTO mkt_swap (from_vendor_id, to_vendor_id, cash, note) VALUES ($1, $2, $3, $4) RETURNING id`,
        [fromVendorId, toVendorId, cashVal, note ? String(note).slice(0, 1000) : null]
    );

    const values = [];
    const params = [swap.id];
    for (const id of offerIds) {
        params.push(id);
        values.push(`($1, $${params.length}, 'offer')`);
    }
    for (const id of requestIds) {
        params.push(id);
        values.push(`($1, $${params.length}, 'request')`);
    }
    await db.query(`INSERT INTO mkt_swap_item (swap_id, listing_id, side) VALUES ${values.join(", ")}`, params);

    try {
        await sendSwapEmail(swap.id);
    } catch (error) {
        swapsLogger.warn("marketplace.swap.email_failed", { swapId: swap.id, reason: error.message });
    }
    swapsLogger.info("marketplace.swap.created", { swapId: swap.id });
    return swap.id;
}

// A vendor's swaps: incoming (proposals to approve) + outgoing (proposals they sent).
export async function listSwaps(vendorId) {
    const swaps = await db.query(
        `SELECT s.id, s.from_vendor_id, s.to_vendor_id, s.cash, s.note, s.status, s.created_at,
                vf.display_name AS from_name, vt.display_name AS to_name
         FROM mkt_swap s
         JOIN mkt_vendor vf ON vf.id = s.from_vendor_id
         JOIN mkt_vendor vt ON vt.id = s.to_vendor_id
         WHERE s.from_vendor_id = $1 OR s.to_vendor_id = $1
         ORDER BY s.created_at DESC
         LIMIT 60`,
        [vendorId]
    );
    if (swaps.length === 0) {
        return { incoming: [], outgoing: [] };
    }
    const ids = swaps.map((s) => s.id);
    const items = await db.query(
        `SELECT si.swap_id, si.side, l.title, l.set_name, l.price
         FROM mkt_swap_item si
         JOIN mkt_listing l ON l.id = si.listing_id
         WHERE si.swap_id = ANY($1::uuid[])`,
        [ids]
    );
    const bySwap = new Map();
    for (const it of items) {
        if (!bySwap.has(it.swap_id)) bySwap.set(it.swap_id, { offer: [], request: [] });
        bySwap.get(it.swap_id)[it.side].push({
            title: it.title,
            setName: it.set_name,
            price: it.price != null ? Number(it.price) : null,
        });
    }

    const incoming = [];
    const outgoing = [];
    for (const s of swaps) {
        const grouped = bySwap.get(s.id) || { offer: [], request: [] };
        const mapped = {
            id: s.id,
            status: s.status,
            cash: s.cash != null ? Number(s.cash) : null,
            note: s.note,
            createdAt: s.created_at ? new Date(s.created_at).toISOString() : null,
            offerItems: grouped.offer, // what the proposer gives
            requestItems: grouped.request, // what the recipient gives
            fromName: s.from_name,
            toName: s.to_name,
        };
        if (s.to_vendor_id === vendorId) incoming.push(mapped);
        else outgoing.push(mapped);
    }
    return { incoming, outgoing };
}

export async function respondToSwap(swapId, vendorId, action) {
    const swap = await db.queryOne(
        `SELECT id, from_vendor_id, to_vendor_id, status FROM mkt_swap WHERE id = $1`,
        [swapId]
    );
    if (!swap) {
        throw new Error("Swap not found.");
    }
    if (swap.status !== "pending") {
        throw new Error("That swap has already been resolved.");
    }
    const isOwner = swap.to_vendor_id === vendorId;
    const isProposer = swap.from_vendor_id === vendorId;
    let status = null;
    if ((action === "accept" || action === "decline") && isOwner) {
        status = action === "accept" ? "accepted" : "declined";
    } else if (action === "withdraw" && isProposer) {
        status = "withdrawn";
    } else {
        throw new Error("You can't take that action on this swap.");
    }
    await db.query(`UPDATE mkt_swap SET status = $2, responded_at = NOW(), updated_at = NOW() WHERE id = $1`, [
        swapId,
        status,
    ]);
    try {
        await sendSwapResponseEmail(swapId, status);
    } catch (error) {
        swapsLogger.warn("marketplace.swap.response_email_failed", { swapId, reason: error.message });
    }
    swapsLogger.info("marketplace.swap.responded", { swapId, status });
    return status;
}
