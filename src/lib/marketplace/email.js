import "server-only";

import { Resend } from "resend";

import { db } from "@/lib/db";
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

// Notify the marketplace admin that a new vendor applied. Recipient is resolved by the caller
// (MARKETPLACE_ADMIN_EMAIL env, else the store owner's email). Best-effort: returns false (no throw)
// if there's no recipient, so it never blocks the public submission.
export async function sendNewApplicationEmail(application, toEmail) {
    if (!toEmail) {
        return false;
    }

    const adminEmail = toEmail;
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

// Tell a buyer that a product on their "notify me" list was just listed by a vendor.
export async function sendWantAvailableEmail(email, product) {
    const resend = getResendClient();
    const url = new URL(`/marketplace/product/${product.catalogProductId}`, baseUrl()).toString();
    const goldButton =
        "display:inline-block;padding:12px 24px;background:#D4AF37;color:#0E0E0E;text-decoration:none;border-radius:6px;font-weight:bold;";

    const result = await resend.emails.send({
        from: FROM_ADDRESS,
        to: email,
        subject: `Now available: ${product.name}`,
        html: `
            <h1>A vendor just listed what you were looking for</h1>
            <p><strong>${escapeHtml(product.name)}</strong>${product.setName ? ` — ${escapeHtml(product.setName)}` : ""}${product.number ? ` (#${escapeHtml(product.number)})` : ""} is now on the Wolf Den Marketplace.</p>
            <p><a href="${url}" style="${goldButton}">See vendor offers</a></p>
            <p>Get in early — vendor stock moves fast.</p>
            <hr />
            <p><small>The Wolf Den Marketplace</small></p>
        `,
    });

    if (result?.error) {
        throw new Error(result.error.message || "Failed to send want-available email.");
    }

    return result;
}

// Weekly vendor-only digest of Vendor Missions (network opportunities). Private per-vendor — never
// sent to buyers.
export async function sendVendorMissionsEmail({ vendor, demandGaps = [], uniques = [] }) {
    const resend = getResendClient();
    const portalUrl = new URL("/marketplace/portal", baseUrl()).toString();
    const goldButton =
        "display:inline-block;padding:12px 24px;background:#D4AF37;color:#0E0E0E;text-decoration:none;border-radius:6px;font-weight:bold;";

    const gapItems = demandGaps
        .slice(0, 8)
        .map(
            (m) =>
                `<li><strong>${escapeHtml(m.name)}</strong>${m.setName ? ` — ${escapeHtml(m.setName)}` : ""} · ` +
                `${m.wantCount} buyer${m.wantCount === 1 ? "" : "s"} want it · ` +
                `${m.sellerCount === 0 ? "nobody stocks it yet" : `${m.sellerCount} seller${m.sellerCount === 1 ? "" : "s"} carry it`}</li>`
        )
        .join("");
    const uniqueItems = uniques
        .slice(0, 5)
        .map(
            (m) =>
                `<li><strong>${escapeHtml(m.name)}</strong>${m.setName ? ` — ${escapeHtml(m.setName)}` : ""}` +
                `${m.wantCount > 0 ? ` · ${m.wantCount} want it` : ""}</li>`
        )
        .join("");

    const sections = [];
    if (gapItems) sections.push(`<h2>Buyers want these — you don't list them</h2><ul>${gapItems}</ul>`);
    if (uniqueItems) sections.push(`<h2>You're the only seller in the network</h2><ul>${uniqueItems}</ul>`);

    const result = await resend.emails.send({
        from: FROM_ADDRESS,
        to: vendor.email,
        subject: "Your Wolf Den Marketplace missions",
        html: `
            <h1>Opportunities from the network</h1>
            <p>Hi ${escapeHtml(vendor.displayName)} — here's what buyers are after and where you stand out this week.</p>
            ${sections.join("")}
            <p><a href="${portalUrl}" style="${goldButton}">Open your portal</a></p>
            <hr />
            <p><small>The Wolf Den Marketplace · sent to you as an active vendor.</small></p>
        `,
    });

    if (result?.error) {
        throw new Error(result.error.message || "Failed to send missions email.");
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

// --- Dealer-to-dealer offer emails (identified relay: recipient can reply straight to the other dealer) ---

async function loadOfferContext(offerId) {
    return db.queryOne(
        `SELECT o.kind, o.amount, o.quantity, o.note,
                l.title AS listing_title,
                vf.id AS from_id, vf.display_name AS from_name, vf.email AS from_email,
                vt.id AS to_id, vt.display_name AS to_name, vt.email AS to_email
         FROM mkt_dealer_offer o
         JOIN mkt_listing l ON l.id = o.listing_id
         JOIN mkt_vendor vf ON vf.id = o.from_vendor_id
         JOIN mkt_vendor vt ON vt.id = o.to_vendor_id
         WHERE o.id = $1`,
        [offerId]
    );
}

export async function sendDealerOfferEmail(offerId) {
    const o = await loadOfferContext(offerId);
    if (!o) return null;
    const resend = getResendClient();
    const portalUrl = new URL("/marketplace/portal", baseUrl()).toString();
    const storefrontUrl = new URL(`/marketplace/vendor/${o.from_id}`, baseUrl()).toString();
    const terms = o.kind === "trade" ? "proposes a trade for" : "wants to buy";
    const amountLine = o.amount != null ? ` — ${currency.format(Number(o.amount))}` : "";
    const qtyLine = o.quantity > 1 ? ` (qty ${o.quantity})` : "";

    const result = await resend.emails.send({
        from: FROM_ADDRESS,
        to: o.to_email,
        replyTo: o.from_email,
        subject: `Dealer offer on ${o.listing_title}`,
        html: `
            <h1>Another dealer made you an offer</h1>
            <p><strong>${escapeHtml(o.from_name)}</strong> ${terms} your <strong>${escapeHtml(o.listing_title)}</strong>${amountLine}${qtyLine}.</p>
            ${o.note ? `<p>They said: &ldquo;${escapeHtml(o.note)}&rdquo;</p>` : ""}
            <p><strong>Just reply to this email</strong> to talk to ${escapeHtml(o.from_name)} directly, or accept/decline in your <a href="${portalUrl}">portal</a>.</p>
            <p><a href="${storefrontUrl}">See ${escapeHtml(o.from_name)}'s storefront</a></p>
            <hr /><p><small>The Wolf Den Marketplace · dealer network</small></p>
        `,
    });
    if (result?.error) throw new Error(result.error.message || "Failed to send offer email.");
    return result;
}

export async function sendDealerOfferResponseEmail(offerId, status) {
    const o = await loadOfferContext(offerId);
    if (!o) return null;
    const resend = getResendClient();
    const portalUrl = new URL("/marketplace/portal", baseUrl()).toString();

    // accepted/declined -> tell the offerer (reply-to owner); withdrawn -> tell the owner (reply-to offerer).
    const toOfferer = status === "accepted" || status === "declined";
    const to = toOfferer ? o.from_email : o.to_email;
    const replyTo = toOfferer ? o.to_email : o.from_email;
    const actorName = toOfferer ? o.to_name : o.from_name;
    const verb =
        status === "accepted" ? "accepted your offer on" : status === "declined" ? "declined your offer on" : "withdrew their offer on";

    const result = await resend.emails.send({
        from: FROM_ADDRESS,
        to,
        replyTo,
        subject: `Dealer offer ${status}: ${o.listing_title}`,
        html: `
            <h1>Dealer offer ${escapeHtml(status)}</h1>
            <p><strong>${escapeHtml(actorName)}</strong> ${verb} <strong>${escapeHtml(o.listing_title)}</strong>.</p>
            ${status === "accepted" ? `<p><strong>Reply to this email</strong> to arrange the handoff.</p>` : ""}
            <p><a href="${portalUrl}">Open your portal</a></p>
            <hr /><p><small>The Wolf Den Marketplace · dealer network</small></p>
        `,
    });
    if (result?.error) throw new Error(result.error.message || "Failed to send offer response email.");
    return result;
}
