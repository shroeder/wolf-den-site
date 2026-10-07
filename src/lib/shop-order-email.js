import "server-only";

import { Resend } from "resend";

import { parseTrackingFromScan, trackingUrlFor } from "@/lib/shipping/tracking-scan.js";
import { SITE_URL, STORE_ADDRESS, STORE_NAME } from "@/lib/site";

// Order emails for the online shop — customer confirmation, fulfillment-status updates, and a
// new-order alert to the owner. Reuses the same Resend setup as the auth emails. Takes a raw
// shop_orders row (snake_case).

const FROM = "The Wolf Den <portal@wolfdengamingmn.com>";

function ownerEmail() {
    return process.env.MARKETPLACE_ADMIN_EMAIL || "luke@wolfdengamingmn.com";
}

function getResendClient() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        return null;
    }
    return new Resend(apiKey);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function money(cents) {
    return "$" + (Number(cents || 0) / 100).toFixed(2);
}

function shortId(id) {
    return String(id || "").slice(0, 8).toUpperCase();
}

// Who to write to. A PICKUP order has no shipping block at all, so shipping_email is NULL and only
// customer_email (from the signed-in account, or the email typed into the pickup form) exists. Reading
// shipping_email alone is why pickup buyers — 7 of the first 8 orders ever placed — were never emailed.
function recipientEmail(order) {
    const email = String(order?.customer_email || order?.shipping_email || "").trim();
    return email || null;
}

function buyerName(order) {
    return String(order?.customer_name || order?.shipping_name || "").trim() || null;
}

// The confirmation number the buyer quotes at the counter. Same value everywhere it is shown — email
// subject, email body, the owner's alert and the order page — so the two sides of the counter match.
function confirmationNumber(order) {
    return shortId(order?.id);
}

// Where to come and get it. From the shared constant, because this email is the reason someone drives
// somewhere, and the hand-typed copy this replaced had the building number wrong.
const PICKUP_LOCATION = `${STORE_NAME}, ${STORE_ADDRESS}`;

function pickupNameLine(order) {
    const name = buyerName(order);
    return name ? `under the name <strong>${escapeHtml(name)}</strong>` : "under your confirmation number";
}

// ⚠️ THE CARRIER FIELD IS AN INTERNAL NAME AND MUST NOT GO OUT AS ONE. EasyPost calls UPS "UPSDAP" and
// FedEx "FedExDefault"; a customer reading "Tracking (UPSDAP)" has been shown a routing code, not a carrier.
const CARRIER_NAMES = [
    [/^ups/i, "UPS"],
    [/^usps|^uspsreturns/i, "USPS"],
    [/^fedex/i, "FedEx"],
    [/^dhl/i, "DHL"],
];
function carrierName(raw) {
    const s = String(raw || "").trim();
    if (!s) return "";
    for (const [re, name] of CARRIER_NAMES) if (re.test(s)) return name;
    return s;
}

// ── WHAT THE CUSTOMER ACTUALLY NEEDS ─────────────────────────────────────────────────────────────────────────
// A tracking number on its own is homework: copy it, work out which carrier, find their site, paste it. The
// number is a link now, so the next thing after "it shipped" is one tap.
//
// The carrier is taken from the order when the label was bought here, and DERIVED FROM THE NUMBER'S OWN SHAPE
// when it was not — a label bought at the post office and scanned in has no EasyPost rate behind it, and a
// 1Z or a 22-digit IMpb says perfectly well who carries it.
export function trackingCarrierFor(order) {
    const tracking = String(order?.tracking_number || "").trim();
    const quoted = carrierName(order?.shipping_carrier);
    const parsed = tracking ? parseTrackingFromScan(tracking)?.carrier || "" : "";

    // ⚠️ shipping_carrier IS WHAT WAS QUOTED, NOT WHAT ACTUALLY CARRIED IT. It is written at CHECKOUT from
    // the rate the customer picked, long before anything is posted. So an order quoted UPS at checkout and then
    // walked to the post office has shipping_carrier = "UPSDAP" and a USPS tracking number — and the old
    // precedence (quoted first, always) emailed the customer "Tracking (UPS)" with a link to UPS's site that
    // their USPS number will never match.
    //
    // A label bought through us is the only case where the quoted carrier is also the real one, and
    // shipping_label_url is exactly that fact. Everywhere else the NUMBER'S OWN SHAPE wins, because a 22-digit
    // IMpb or a 1Z is evidence and a stale quote is not.
    if (order?.shipping_label_url && quoted) return quoted;
    return parsed || quoted || "";
}

function trackingHtml(order) {
    const tracking = String(order?.tracking_number || "").trim();
    if (!tracking) return "";
    const carrier = trackingCarrierFor(order);
    const url = trackingUrlFor(carrier, tracking);

    // Luke: "tracking link as a button." The number is still printed under it, because a customer who wants to
    // paste it into their own carrier app should not have to dig it out of a link.
    return `
        <p style="margin:18px 0 0;"><strong>${carrier ? `${escapeHtml(carrier)} tracking` : "Tracking"}</strong></p>
        ${url ? buttonHtml(url, "Track your package") : ""}
        <p style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:14px;color:#555;">${escapeHtml(tracking)}</p>
    `;
}

// ── THE WOLF DEN SHELL ───────────────────────────────────────────────────────────────────────────────────────
// Luke: "have it email the customer using our branding and tracking link as a button."
//
// Every order email went out as bare <h1> and <p> on default white: no logo, no colour, nothing that said who
// it was from except the words. For most customers the shipping email is the only thing The Wolf Den ever
// sends them, so it was the one piece of the shop with no shop on it.
//
// ⚠️ EMAIL HTML IS NOT WEB HTML, and everything below is shaped by that:
//
//   · TABLES, NOT FLEX OR GRID. Outlook renders through Word, which has no support for either.
//   · INLINE STYLES. Gmail strips <style> blocks from the head on most clients.
//   · NO WEBFONTS. A font stack only, so it degrades to something sane rather than to Times.
//   · THE CARD STAYS LIGHT. Dark-mode clients invert aggressively and inconsistently; a white card with dark
//     text survives that, while a dark card with light text can come out white-on-white. The brand lives in
//     the header and footer bands, which are safe to lose.
//   · ABSOLUTE IMAGE URL with an explicit width, and alt text that reads as the shop name if images are
//     blocked — which, for a first email from an unknown sender, they usually are.
const BRAND_GOLD = "#D4AF37";
const BRAND_DARK = "#141414";
const LOGO_URL = `${SITE_URL}/logo/wolf-den-full-logo.png`;

function shellHtml(body) {
    const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light"/><meta name="supported-color-schemes" content="light"/></head>
<body style="margin:0;padding:0;background:${BRAND_DARK};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND_DARK};">
  <tr><td align="center" style="padding:28px 14px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">

      <tr><td align="center" style="padding:0 0 20px;">
        <a href="${SITE_URL}" style="text-decoration:none;">
          <img src="${LOGO_URL}" width="190" alt="The Wolf Den" style="display:block;border:0;width:190px;max-width:70%;height:auto;"/>
        </a>
      </td></tr>

      <tr><td style="background:#ffffff;border-radius:14px;padding:30px 28px;font-family:${font};font-size:15px;line-height:1.6;color:#1b1b1b;">
        ${body}
      </td></tr>

      <tr><td align="center" style="padding:20px 10px 4px;font-family:${font};font-size:12px;line-height:1.7;color:#8a8a8a;">
        <strong style="color:${BRAND_GOLD};">The Wolf Den</strong><br/>
        ${escapeHtml(PICKUP_LOCATION)}<br/>
        <a href="${SITE_URL}/shop" style="color:#8a8a8a;">wolfdengamingmn.com</a>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

// ⚠️ A "BULLETPROOF" BUTTON, which is a table and not a styled <a>. Outlook ignores padding on an inline
// anchor, so a CSS button collapses to a bare line of text there — the one client where it most needs to
// look deliberate. The anchor keeps its own padding too, so it stays a big tap target everywhere else.
function buttonHtml(url, label) {
    const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
  <tr><td align="center" bgcolor="${BRAND_GOLD}" style="border-radius:10px;">
    <a href="${escapeHtml(url)}" style="display:inline-block;padding:15px 30px;font-family:${font};font-size:16px;font-weight:700;color:${BRAND_DARK};text-decoration:none;border-radius:10px;">${escapeHtml(label)}</a>
  </td></tr>
</table>`;
}

function footerHtml() {
    return `<p style="color:#777;font-size:13px;">Questions? Just reply to this email.</p>`;
}

function itemsHtml(itemsJson) {
    let items = [];
    try {
        items = Array.isArray(itemsJson) ? itemsJson : JSON.parse(itemsJson || "[]");
    } catch {
        items = [];
    }
    if (!items.length) {
        return "<li>(items unavailable)</li>";
    }
    return items
        .map((i) => {
            const name = i.name || i.itemName || i.title || "Item";
            const qty = Number(i.quantity || 1);
            const lineCents = Number(i.lineTotalCents ?? (Number(i.priceCents || i.unitPriceCents || 0) * qty));
            return `<li>${escapeHtml(name)} &times; ${qty}${lineCents ? ` — ${money(lineCents)}` : ""}</li>`;
        })
        .join("");
}

function totalsHtml(order) {
    const lines = [`Subtotal: ${money(order.subtotal_cents)}`];
    if (order.tax_cents) lines.push(`Tax: ${money(order.tax_cents)}`);
    if (order.shipping_cents) lines.push(`Shipping: ${money(order.shipping_cents)}`);
    if (order.online_fee_cents) lines.push(`Online fee: ${money(order.online_fee_cents)}`);
    lines.push(`<strong>Total: ${money(order.total_cents)}</strong>`);
    return lines.join("<br/>");
}

function shipToHtml(order) {
    return (
        `${escapeHtml(order.shipping_name)}<br/>` +
        `${escapeHtml(order.shipping_address_line1)}` +
        (order.shipping_address_line2 ? `<br/>${escapeHtml(order.shipping_address_line2)}` : "") +
        `<br/>${escapeHtml(order.shipping_city)}, ${escapeHtml(order.shipping_state)} ${escapeHtml(order.shipping_postal_code)}`
    );
}

/**
 * Customer order confirmation — sent for BOTH pickup and shipping. Leads with the confirmation number
 * so a pickup buyer has something to say at the counter. Skips silently only when we genuinely have no
 * address to write to (a guest who gave none).
 */
export async function sendOrderConfirmationEmail(order) {
    const resend = getResendClient();
    const to = recipientEmail(order);
    if (!resend || !to) {
        return false;
    }
    const isPickup = order.fulfillment_mode === "pickup";
    const number = confirmationNumber(order);
    const html = shellHtml(`
        <h1>Thanks for your order!</h1>
        <p>Your order is confirmed. Your confirmation number is:</p>
        <p style="font-size:24px;font-weight:bold;letter-spacing:2px;margin:12px 0;">#${number}</p>
        <ul>${itemsHtml(order.items_json)}</ul>
        <p>${totalsHtml(order)}</p>
        <p>${
            isPickup
                ? `<strong>Pickup in store.</strong> We&rsquo;re packing it now and will email you the moment it&rsquo;s ready. ` +
                  `Come to ${escapeHtml(PICKUP_LOCATION)} and ask for it ${pickupNameLine(order)}.`
                : `<strong>Shipping to:</strong><br/>${shipToHtml(order)}<br/><br/>We&rsquo;ll email you a tracking number as soon as it ships.`
        }</p>
        ${order.receipt_url ? `<p><a href="${escapeHtml(order.receipt_url)}">View your payment receipt &rarr;</a></p>` : ""}
        ${footerHtml()}
    `);
    const result = await resend.emails.send({
        from: FROM,
        to,
        subject: `Your Wolf Den order #${number} is confirmed`,
        html,
    });
    return !result?.error;
}

/**
 * Fulfillment-status update — what the buyer gets when the owner moves an order along in the admin app.
 * One email per status a customer actually cares about:
 *   ready     → their pickup order is on the shelf with their name on it
 *   shipped   → it left the store, with tracking when we have it
 *   picked_up → a receipt that they walked out with it, so a wrong tap is visible to them too
 * `unfulfilled` is a correction, not news, so it sends nothing. Cancellations keep their own email
 * (sendOrderCancelledEmail) because they carry a refund and a reason.
 */
export async function sendOrderStatusEmail(order, status) {
    const resend = getResendClient();
    const to = recipientEmail(order);
    if (!resend || !to) {
        return false;
    }

    const number = confirmationNumber(order);
    let subject = null;
    let body = null;

    if (status === "ready") {
        subject = `Order #${number} is ready for pickup`;
        body = `
            <h1>Your order is ready!</h1>
            <p>Order <strong>#${number}</strong> is packed and waiting for you at ${escapeHtml(PICKUP_LOCATION)}.</p>
            <p>Just come in and ask for it ${pickupNameLine(order)} &mdash; or show this email.</p>
            <ul>${itemsHtml(order.items_json)}</ul>
        `;
    } else if (status === "shipped") {
        subject = `Order #${number} has shipped`;
        body = `
            <h1>Your order is on its way</h1>
            <p>Order <strong>#${number}</strong> shipped today.</p>
            ${trackingHtml(order)}
            ${order.shipping_name ? `<p><strong>Shipping to:</strong><br/>${shipToHtml(order)}</p>` : ""}
            <ul>${itemsHtml(order.items_json)}</ul>
        `;
    } else if (status === "picked_up") {
        subject = `Order #${number} was picked up`;
        body = `
            <h1>Thanks for coming in!</h1>
            <p>Order <strong>#${number}</strong> is marked picked up. Enjoy it.</p>
            <ul>${itemsHtml(order.items_json)}</ul>
            <p>If you did NOT pick this up, reply to this email and we&rsquo;ll sort it out straight away.</p>
        `;
    } else {
        return false;
    }

    const result = await resend.emails.send({
        from: FROM,
        to,
        subject,
        html: shellHtml(`${body}${footerHtml()}`),
    });
    return !result?.error;
}

/**
 * Customer cancellation + refund notice with the owner's reason. Skips only if we have no address.
 * Reads the same recipient as every other order email, so a PICKUP cancellation reaches the buyer too.
 */
export async function sendOrderCancelledEmail(order, { reason, refundAmountCents } = {}) {
    const resend = getResendClient();
    const to = recipientEmail(order);
    if (!resend || !to) {
        return false;
    }
    const refunded = Number(refundAmountCents || 0) > 0;
    const html = shellHtml(`
        <h1>Your order was cancelled</h1>
        <p>Order <strong>#${shortId(order.id)}</strong> has been cancelled.</p>
        ${reason ? `<p><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : ""}
        <ul>${itemsHtml(order.items_json)}</ul>
        ${
            refunded
                ? `<p>We&rsquo;ve refunded <strong>${money(refundAmountCents)}</strong> to your original payment method. It may take a few business days to appear.</p>`
                : `<p>No charge was captured, so there&rsquo;s nothing to refund.</p>`
        }
        <p style="color:#777;font-size:13px;">Sorry for the inconvenience — questions? Just reply to this email.</p>
    `);
    const result = await resend.emails.send({
        from: FROM,
        to,
        subject: `Your Wolf Den order #${shortId(order.id)} was cancelled`,
        html,
    });
    return !result?.error;
}

/** Owner alert: a customer requested to cancel an order (owner decides whether to honor it). */
// ⚠️ THE TWO OWNER ALERTS BELOW ARE DELIBERATELY NOT SHELLED. They go to Luke, not to a customer: a
// logo and a gold footer on an internal alert is a slower read and a taller phone notification, and there is
// nobody to reassure about who sent it.
export async function sendOrderCancelRequestAlertEmail(order, { reason } = {}) {
    const resend = getResendClient();
    if (!resend || !order) {
        return false;
    }
    const html = `
        <h1>🙋 Cancellation request</h1>
        <p>A customer asked to cancel order <strong>#${shortId(order.id)}</strong> (${money(order.total_cents)}, ${order.fulfillment_mode === "pickup" ? "Pickup" : "Ship"}).</p>
        <p><strong>Customer:</strong> ${escapeHtml(order.customer_name || order.shipping_name || "—")} &middot; ${escapeHtml(order.customer_email || order.shipping_email || "—")}</p>
        ${reason ? `<p><strong>Their reason:</strong> ${escapeHtml(reason)}</p>` : ""}
        <ul>${itemsHtml(order.items_json)}</ul>
        <p>Review it in the admin app — you decide whether to <strong>Cancel &amp; refund</strong> or keep the order.</p>
    `;
    const result = await resend.emails.send({
        from: FROM,
        to: ownerEmail(),
        subject: `Cancellation request — order #${shortId(order.id)}`,
        html,
    });
    return !result?.error;
}

/** New-order alert to the store owner so an order is never missed. */
export async function sendNewOrderAlertEmail(order) {
    const resend = getResendClient();
    if (!resend || !order) {
        return false;
    }
    const isPickup = order.fulfillment_mode === "pickup";
    const html = `
        <h1>🛒 New online order</h1>
        <p><strong>#${shortId(order.id)}</strong> &middot; ${money(order.total_cents)} &middot; ${isPickup ? "Pickup" : "Ship"}</p>
        <ul>${itemsHtml(order.items_json)}</ul>
        <p>${totalsHtml(order)}</p>
        <p><strong>Customer:</strong> ${escapeHtml(order.customer_name || order.shipping_name || "—")}<br/>
           ${escapeHtml(order.customer_email || order.shipping_email || "—")} &middot; ${escapeHtml(order.shipping_phone || "—")}</p>
        ${isPickup ? "" : `<p><strong>Ship to:</strong><br/>${shipToHtml(order)}</p>`}
        ${order.receipt_url ? `<p><a href="${escapeHtml(order.receipt_url)}">Square receipt →</a></p>` : ""}
    `;
    const result = await resend.emails.send({
        from: FROM,
        to: ownerEmail(),
        subject: `New order #${shortId(order.id)} — ${money(order.total_cents)}`,
        html,
    });
    return !result?.error;
}
