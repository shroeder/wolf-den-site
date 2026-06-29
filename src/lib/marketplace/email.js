import "server-only";

import { Resend } from "resend";

import { SITE_URL } from "@/lib/site";

// Buyer -> vendor contact email. Reply-To is the buyer, so the vendor just hits reply and the two
// of them take it off-platform (no on-platform messaging in v1).

const FROM_ADDRESS = "The Wolf Den Marketplace <portal@wolfdengamingmn.com>";

const currency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
});

function getResendClient() {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
        throw new Error("Missing RESEND_API_KEY environment variable.");
    }

    return new Resend(apiKey);
}

function baseUrl() {
    return process.env.NEXT_PUBLIC_BASE_URL || SITE_URL;
}

function formatPrice(value) {
    return value === null || value === undefined ? "" : currency.format(Number(value));
}

export async function sendVendorContactEmail({ vendor, listing, buyerName, buyerEmail, message }) {
    const resend = getResendClient();

    const productUrl = listing?.catalogProductId
        ? new URL(`/marketplace/product/${listing.catalogProductId}`, baseUrl()).toString()
        : null;

    const safeName = buyerName ? String(buyerName).trim() : "A buyer";
    const priceLine = listing?.price !== undefined && listing?.price !== null
        ? ` (listed at ${formatPrice(listing.price)})`
        : "";

    const result = await resend.emails.send({
        from: FROM_ADDRESS,
        to: vendor.email,
        replyTo: buyerEmail,
        subject: `Marketplace inquiry: ${listing?.title || "your listing"}`,
        html: `
            <h1>You have a buyer inquiry</h1>
            <p><strong>${safeName}</strong> is interested in <strong>${listing?.title || "one of your listings"}</strong>${priceLine}.</p>
            ${message ? `<p style="white-space:pre-wrap;border-left:3px solid #D4AF37;padding-left:12px;color:#333;">${escapeHtml(message)}</p>` : ""}
            <p>Reply directly to this email to reach them at <a href="mailto:${buyerEmail}">${buyerEmail}</a>.</p>
            ${productUrl ? `<p><a href="${productUrl}">View the listing</a></p>` : ""}
            <hr />
            <p><small>The Wolf Den Marketplace</small></p>
        `,
    });

    if (result?.error) {
        throw new Error(result.error.message || "Failed to send contact email.");
    }

    return result;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
