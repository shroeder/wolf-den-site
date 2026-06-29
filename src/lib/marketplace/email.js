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

// Notify Luke that a new vendor applied. Best-effort: returns false (no throw) if no admin address
// is configured, so a missing env var never blocks the public submission.
export async function sendNewApplicationEmail(application) {
    const adminEmail = process.env.MARKETPLACE_ADMIN_EMAIL;

    if (!adminEmail) {
        return false;
    }

    const resend = getResendClient();
    const adminUrl = new URL("/marketplace/admin", baseUrl()).toString();

    await resend.emails.send({
        from: FROM_ADDRESS,
        to: adminEmail,
        replyTo: application.email,
        subject: `New vendor application: ${application.businessName}`,
        html: `
            <h1>New vendor application</h1>
            <p><strong>${escapeHtml(application.businessName)}</strong> applied to the marketplace.</p>
            <ul>
                <li>Contact: ${escapeHtml(application.contactName || "—")} (${escapeHtml(application.email)})</li>
                <li>Phone: ${escapeHtml(application.phone || "—")}</li>
                <li>Location: ${escapeHtml(application.locationLabel || application.region || "—")}</li>
                <li>Sells: ${escapeHtml(application.sells || "—")}</li>
                <li>Links: ${escapeHtml(application.links || "—")}</li>
            </ul>
            ${application.notes ? `<p style="white-space:pre-wrap;">${escapeHtml(application.notes)}</p>` : ""}
            <p><a href="${adminUrl}">Review in the admin portal →</a></p>
        `,
    });

    return true;
}

// Email an approved vendor their single-use invite link to set a password + finish onboarding.
export async function sendVendorInviteEmail({ vendor, businessName, inviteToken }) {
    const resend = getResendClient();
    const acceptUrl = new URL("/marketplace/onboard", baseUrl());
    acceptUrl.searchParams.set("token", inviteToken);

    const goldButton =
        "display:inline-block;padding:12px 24px;background:#D4AF37;color:#0E0E0E;text-decoration:none;border-radius:6px;font-weight:bold;";

    const result = await resend.emails.send({
        from: FROM_ADDRESS,
        to: vendor.email,
        subject: "You're approved for the Wolf Den Marketplace",
        html: `
            <h1>Welcome to the Wolf Den Marketplace</h1>
            <p>${escapeHtml(businessName || vendor.displayName)} has been approved. Set your password and finish setting up your storefront to start listing inventory.</p>
            <p><a href="${acceptUrl.toString()}" style="${goldButton}">Finish setting up your account</a></p>
            <p>This link is single-use and expires in 14 days.</p>
            <hr />
            <p><small>The Wolf Den Marketplace</small></p>
        `,
    });

    if (result?.error) {
        throw new Error(result.error.message || "Failed to send invite email.");
    }

    return result;
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
