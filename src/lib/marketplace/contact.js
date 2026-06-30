import "server-only";

import { db } from "@/lib/db";
import { sendVendorContactEmail } from "@/lib/marketplace/email.js";
import { markListingSold } from "@/lib/marketplace/sales.js";
import { createServerLogger } from "@/lib/server-logger";

const contactLogger = createServerLogger({ source: "api", subsystem: "marketplace-contact" });

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_MESSAGE_LENGTH = 2000;

export function isValidEmail(value) {
    return EMAIL_PATTERN.test(String(value || "").trim().toLowerCase());
}

// Log a buyer's inquiry on a listing and email the vendor (reply-to the buyer). Returns the created
// request, or throws on bad input / send failure.
export async function createContactRequest({ listingId, buyerName, buyerEmail, message }) {
    if (!isValidEmail(buyerEmail)) {
        throw new Error("A valid email address is required.");
    }

    // Resolve the listing + its (active) vendor in one shot.
    const listing = await db.queryOne(
        `SELECT l.id, l.title, l.price, l.catalog_product_id,
                v.id AS vendor_id, v.email AS vendor_email, v.display_name AS vendor_name, v.status AS vendor_status
         FROM mkt_listing l
         JOIN mkt_vendor v ON v.id = l.vendor_id
         WHERE l.id = $1 AND l.status = 'active'`,
        [listingId]
    );

    if (!listing || listing.vendor_status !== "active") {
        throw new Error("That listing is no longer available.");
    }

    const trimmedMessage = message ? String(message).slice(0, MAX_MESSAGE_LENGTH) : null;

    // Record the request first so we never lose an inquiry even if the email send hiccups.
    const request = await db.queryOne(
        `INSERT INTO mkt_contact_request (listing_id, vendor_id, buyer_name, buyer_email, message)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [listing.id, listing.vendor_id, buyerName || null, String(buyerEmail).trim(), trimmedMessage]
    );

    try {
        await sendVendorContactEmail({
            vendor: { id: listing.vendor_id, email: listing.vendor_email, displayName: listing.vendor_name },
            listing: {
                title: listing.title,
                price: listing.price !== null && listing.price !== undefined ? Number(listing.price) : null,
                catalogProductId: listing.catalog_product_id ? String(listing.catalog_product_id) : null,
            },
            buyerName,
            buyerEmail: String(buyerEmail).trim(),
            message: trimmedMessage,
        });

        await db.query(`UPDATE mkt_contact_request SET sent_at = NOW() WHERE id = $1`, [request.id]);

        contactLogger.info("marketplace.contact.sent", {
            step: "contact_sent",
            requestId: request.id,
            vendorId: listing.vendor_id,
        });
    } catch (error) {
        // Inquiry is already persisted; surface the send failure but don't lose the record.
        contactLogger.error("marketplace.contact.send_failed", error, {
            step: "contact_send_failed",
            requestId: request.id,
        });

        throw new Error("We saved your inquiry but couldn't email the vendor just now. Please try again.");
    }

    return { id: request.id };
}

const REQUEST_STATUSES = new Set(["new", "responded", "sold", "closed"]);

function toIso(value) {
    return value ? new Date(value).toISOString() : null;
}

function mapRequest(row) {
    return {
        id: row.id,
        listingId: row.listing_id,
        status: row.status,
        buyerName: row.buyer_name,
        buyerEmail: row.buyer_email,
        message: row.message,
        itemTitle: row.item_title || null,
        listingActive: row.listing_status === "active",
        createdAt: toIso(row.created_at),
        respondedAt: toIso(row.responded_at),
    };
}

// A vendor's inbound inquiries, newest first. Joins the listing title (even if since sold/deleted).
export async function listVendorContactRequests(vendorId) {
    const rows = await db.query(
        `SELECT r.id, r.listing_id, r.status, r.buyer_name, r.buyer_email, r.message,
                r.created_at, r.responded_at,
                l.title AS item_title, l.status AS listing_status
         FROM mkt_contact_request r
         LEFT JOIN mkt_listing l ON l.id = r.listing_id
         WHERE r.vendor_id = $1
         ORDER BY r.created_at DESC`,
        [vendorId]
    );

    return rows.map(mapRequest);
}

// Funnel counts for a vendor: total leads and how many converted to a sale.
export async function getVendorRequestStats(vendorId) {
    const row = await db.queryOne(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'sold')::int AS sold,
                COUNT(*) FILTER (WHERE responded_at IS NOT NULL)::int AS responded,
                AVG(EXTRACT(EPOCH FROM (responded_at - created_at)))
                    FILTER (WHERE responded_at IS NOT NULL) AS avg_response_seconds
         FROM mkt_contact_request
         WHERE vendor_id = $1`,
        [vendorId]
    );

    const total = row?.total || 0;
    const sold = row?.sold || 0;

    return {
        total,
        sold,
        responded: row?.responded || 0,
        closeRate: total > 0 ? sold / total : null,
        avgResponseSeconds: row?.avg_response_seconds != null ? Number(row.avg_response_seconds) : null,
    };
}

// Vendor moves a lead through the funnel. Vendor-scoped. Marking 'sold' also closes out the linked
// listing (if still active) and attributes the resulting sale back to this lead. 'responded' (and any
// first action) stamps responded_at once — that's the response-time signal. Returns the updated row.
export async function setContactRequestStatus(requestId, vendorId, status) {
    if (!REQUEST_STATUSES.has(status)) {
        throw new Error(`Invalid request status: ${status}`);
    }

    const existing = await db.queryOne(
        `SELECT id, listing_id, status, responded_at
         FROM mkt_contact_request
         WHERE id = $1 AND vendor_id = $2`,
        [requestId, vendorId]
    );

    if (!existing) {
        return null;
    }

    // Best-effort: if the lead converted and its listing is still live, record the sale + attribute it.
    if (status === "sold" && existing.listing_id) {
        try {
            await markListingSold(existing.listing_id, vendorId, { contactRequestId: requestId });
        } catch (error) {
            contactLogger.warn("marketplace.contact.sold_link_failed", {
                requestId,
                reason: error.message,
            });
        }
    }

    const row = await db.queryOne(
        `UPDATE mkt_contact_request
         SET status = $3,
             responded_at = COALESCE(responded_at, NOW()),
             updated_at = NOW()
         WHERE id = $1 AND vendor_id = $2
         RETURNING id, listing_id, status, buyer_name, buyer_email, message, created_at, responded_at`,
        [requestId, vendorId, status]
    );

    contactLogger.info("marketplace.contact.status_changed", {
        step: "contact_status_changed",
        requestId,
        vendorId,
        status,
    });

    return row ? mapRequest(row) : null;
}
