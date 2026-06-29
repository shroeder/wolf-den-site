import "server-only";

import { db } from "@/lib/db";
import { sendVendorContactEmail } from "@/lib/marketplace/email.js";
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
