import "server-only";

import { db } from "@/lib/db";
import { sendDealerOfferEmail, sendDealerOfferResponseEmail } from "@/lib/marketplace/email.js";
import { createServerLogger } from "@/lib/server-logger";

// Dealer-to-dealer offers. Negotiation happens over identified email relay (the recipient can reply
// straight to the other dealer); this records the structured offer + outcome.

const offersLogger = createServerLogger({ source: "api", subsystem: "marketplace-offers" });

function toNumber(v) {
    return v !== null && v !== undefined ? Number(v) : null;
}

function mapOffer(row) {
    return {
        id: row.id,
        listingId: row.listing_id,
        listingTitle: row.listing_title,
        kind: row.kind,
        amount: toNumber(row.amount),
        quantity: row.quantity,
        note: row.note,
        status: row.status,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        counterpartyId: row.counterparty_id,
        counterpartyName: row.counterparty_name,
    };
}

export async function createDealerOffer({ fromVendorId, listingId, kind = "buy", amount = null, quantity = 1, note = null }) {
    const listing = await db.queryOne(
        `SELECT id, vendor_id, (dealer_available OR vendor_only) AS dealer_available
         FROM mkt_listing WHERE id = $1 AND status = 'active'`,
        [listingId]
    );
    if (!listing || listing.dealer_available !== true) {
        throw new Error("That listing isn't available to dealers.");
    }
    if (listing.vendor_id === fromVendorId) {
        throw new Error("You can't make an offer on your own listing.");
    }

    const row = await db.queryOne(
        `INSERT INTO mkt_dealer_offer (listing_id, from_vendor_id, to_vendor_id, kind, amount, quantity, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
            listingId,
            fromVendorId,
            listing.vendor_id,
            kind === "trade" ? "trade" : "buy",
            amount != null && amount !== "" ? Number(amount) : null,
            Math.max(1, Number(quantity) || 1),
            note ? String(note).slice(0, 1000) : null,
        ]
    );

    // Identified email to the listing owner (reply-to = offering dealer).
    try {
        await sendDealerOfferEmail(row.id);
    } catch (error) {
        offersLogger.warn("marketplace.offer.email_failed", { offerId: row.id, reason: error.message });
    }

    offersLogger.info("marketplace.offer.created", { offerId: row.id });
    return row.id;
}

// Incoming (offers ON your listings) + outgoing (offers YOU made), with the other dealer's name.
export async function listDealerOffers(vendorId) {
    const rows = await db.query(
        `SELECT o.id, o.listing_id, o.kind, o.amount, o.quantity, o.note, o.status, o.created_at,
                o.from_vendor_id, o.to_vendor_id,
                l.title AS listing_title,
                CASE WHEN o.to_vendor_id = $1 THEN o.from_vendor_id ELSE o.to_vendor_id END AS counterparty_id,
                CASE WHEN o.to_vendor_id = $1 THEN vf.display_name ELSE vt.display_name END AS counterparty_name
         FROM mkt_dealer_offer o
         JOIN mkt_listing l ON l.id = o.listing_id
         JOIN mkt_vendor vf ON vf.id = o.from_vendor_id
         JOIN mkt_vendor vt ON vt.id = o.to_vendor_id
         WHERE (o.to_vendor_id = $1 OR o.from_vendor_id = $1)
         ORDER BY o.created_at DESC
         LIMIT 100`,
        [vendorId]
    );

    const incoming = [];
    const outgoing = [];
    for (const row of rows) {
        const mapped = mapOffer(row);
        if (row.to_vendor_id === vendorId) incoming.push(mapped);
        else outgoing.push(mapped);
    }
    return { incoming, outgoing };
}

// accept/decline by the listing owner; withdraw by the offering dealer. Emails the other side.
export async function respondToDealerOffer(offerId, vendorId, action) {
    const offer = await db.queryOne(
        `SELECT id, from_vendor_id, to_vendor_id, status FROM mkt_dealer_offer WHERE id = $1`,
        [offerId]
    );
    if (!offer) {
        throw new Error("Offer not found.");
    }
    if (offer.status !== "pending") {
        throw new Error("That offer has already been resolved.");
    }

    const isOwner = offer.to_vendor_id === vendorId;
    const isOfferer = offer.from_vendor_id === vendorId;
    let status = null;
    if ((action === "accept" || action === "decline") && isOwner) {
        status = action === "accept" ? "accepted" : "declined";
    } else if (action === "withdraw" && isOfferer) {
        status = "withdrawn";
    } else {
        throw new Error("You can't take that action on this offer.");
    }

    await db.query(
        `UPDATE mkt_dealer_offer SET status = $2, responded_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [offerId, status]
    );

    // Tell the other side (accepted/declined -> the offerer; withdrawn -> the owner).
    try {
        await sendDealerOfferResponseEmail(offerId, status);
    } catch (error) {
        offersLogger.warn("marketplace.offer.response_email_failed", { offerId, reason: error.message });
    }

    offersLogger.info("marketplace.offer.responded", { offerId, status });
    return status;
}
