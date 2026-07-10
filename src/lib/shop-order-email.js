import "server-only";

import { Resend } from "resend";

// Order emails for the online shop — customer confirmation + a new-order alert to the owner. Reuses
// the same Resend setup as the auth emails. Takes a raw shop_orders row (snake_case).

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

/** Customer order confirmation. Skips silently if there's no email on the order (e.g. guest pickup). */
export async function sendOrderConfirmationEmail(order) {
    const resend = getResendClient();
    if (!resend || !order?.shipping_email) {
        return false;
    }
    const isPickup = order.fulfillment_mode === "pickup";
    const html = `
        <h1>Thanks for your order!</h1>
        <p>Order <strong>#${shortId(order.id)}</strong> is confirmed.</p>
        <ul>${itemsHtml(order.items_json)}</ul>
        <p>${totalsHtml(order)}</p>
        <p>${
            isPickup
                ? "Ready for <strong>pickup</strong> at The Wolf Den in Montgomery — we&rsquo;ll let you know when it&rsquo;s ready."
                : `Shipping to:<br/>${shipToHtml(order)}`
        }</p>
        ${order.receipt_url ? `<p><a href="${escapeHtml(order.receipt_url)}">View your payment receipt →</a></p>` : ""}
        <p style="color:#777;font-size:13px;">Questions? Just reply to this email.</p>
    `;
    const result = await resend.emails.send({
        from: FROM,
        to: order.shipping_email,
        subject: `Your Wolf Den order #${shortId(order.id)}`,
        html,
    });
    return !result?.error;
}

/** Customer cancellation + refund notice with the owner's reason. Skips if no email on the order. */
export async function sendOrderCancelledEmail(order, { reason, refundAmountCents } = {}) {
    const resend = getResendClient();
    if (!resend || !order?.shipping_email) {
        return false;
    }
    const refunded = Number(refundAmountCents || 0) > 0;
    const html = `
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
    `;
    const result = await resend.emails.send({
        from: FROM,
        to: order.shipping_email,
        subject: `Your Wolf Den order #${shortId(order.id)} was cancelled`,
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
        <p><strong>Customer:</strong> ${escapeHtml(order.shipping_name || "—")}<br/>
           ${escapeHtml(order.shipping_email || "—")} &middot; ${escapeHtml(order.shipping_phone || "—")}</p>
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
