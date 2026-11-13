import "server-only";
import { db } from "@/lib/db";
import { cartPreorderDate, getItemRules, preorderSentence } from "@/lib/shop-item-rules.js";

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

/**
 * ── A VAULT HAND-OVER IS A DIFFERENT RECEIPT ────────────────────────────────────────────────────────────────
 * Luke: "when we mark their cards as shipped or picked up, it should send them an email with an itemized list
 * of cards that are either being shipped to them or ... hey, you picked these up in the store."
 *
 * itemsHtml above is right for a shop order: a name, a quantity and a line total. A vault card has none of
 * those problems and all of a different one -- every line is quantity one, every line is £0 because it was
 * paid for when the pack was opened, and the NAME DOES NOT IDENTIFY IT. "Pikachu" is several hundred objects
 * at several hundred prices. Set, number and condition are what let somebody check this list against the
 * cards in their hand, which is the only thing a hand-over receipt is for.
 *
 * ⚠️ FALLS BACK TO itemsHtml. An order written before vault items carried set/number/condition still renders
 * -- as the plain list it always did, rather than as a column of "undefined".
 */
/** "3 cards" / "1 card", for a subject line that says how much is in the parcel before it is opened. */
function count(order) {
    let n = 0;
    try {
        const items = Array.isArray(order.items_json) ? order.items_json : JSON.parse(order.items_json || "[]");
        n = items.length;
    } catch { n = 0; }
    return `${n || "your"} card${n === 1 ? "" : "s"}`;
}
const plural = (order, one, many) => (count(order).startsWith("1 ") ? one : many);

function vaultItemsHtml(itemsJson) {
    let items = [];
    try {
        items = Array.isArray(itemsJson) ? itemsJson : JSON.parse(itemsJson || "[]");
    } catch {
        items = [];
    }
    if (!items.length) return "<li>(cards unavailable)</li>";
    if (!items.some((i) => i.setName || i.cardNumber || i.condition)) return itemsHtml(itemsJson);

    return items
        .map((i) => {
            const name = escapeHtml(i.name || "Card");
            const detail = [i.setName, i.cardNumber, i.condition].filter(Boolean).map(escapeHtml).join(" &middot; ");
            const value = Number(i.valueCents || 0);
            return `<li style="margin-bottom:6px">`
                + `<strong>${name}</strong>`
                + (detail ? `<br/><span style="color:#666;font-size:13px">${detail}</span>` : "")
                + (value ? `<br/><span style="color:#666;font-size:13px">Valued at ${money(value)}</span>` : "")
                + `</li>`;
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
/**
 * The latest pre-order arrival date in an order, or null.
 *
 * ⚠️ READ OFF THE ORDER'S OWN LINES, NOT THE HOLDS LEDGER. The ledger is written a moment later in the
 * checkout and this email is sent in the same breath; depending on it would make the sentence appear or
 * not depending on which of two awaits finished first.
 */
async function orderPreorderDate(order) {
    let items = order?.items_json;
    if (typeof items === "string") { try { items = JSON.parse(items); } catch { items = []; } }
    if (!Array.isArray(items) || !items.length) return null;
    const rules = await getItemRules(items.map((i) => i?.catalogObjectId)).catch(() => ({}));
    return cartPreorderDate(items, rules);
}

/**
 * It landed. Sent once per order per item, from the arrival screen.
 *
 * ⚠️ THIS IS NOT sendOrderStatusEmail. That one reports a fulfilment status the owner set and says the
 * thing is bagged and waiting. This one says the stock is in the building — which is news the customer has
 * been waiting weeks for, and is NOT a promise that anybody has picked their copy yet. Luke's call: email
 * only, the orders are then worked from the Orders screen like any other, so this must not imply a status
 * it has not got.
 */
export async function sendPreorderArrivedEmail(order, itemName) {
    const resend = getResendClient();
    const to = recipientEmail(order);
    if (!resend || !to) return false;
    const isPickup = order.fulfillment_mode === "pickup";
    const number = confirmationNumber(order);
    const what = escapeHtml(itemName || "Your pre-order");
    const html = shellHtml(`
        <h1>${what} has arrived</h1>
        <p>The pre-order on your order <strong>#${number}</strong> is in the shop.</p>
        <p>${
            isPickup
                ? `We&rsquo;re getting it onto the shelf for you now, and you&rsquo;ll get a second email the moment it&rsquo;s ready to collect at ${escapeHtml(PICKUP_LOCATION)}. ` +
                  `No need to come down until then.`
                : `Your order is being packed and will ship shortly. We&rsquo;ll email you a tracking number as soon as it leaves us.`
        }</p>
        <ul>${itemsHtml(order.items_json)}</ul>
        ${footerHtml()}
    `);
    return deliver({
        kind: "preorder_arrived",
        orderId: order?.id || null,
        to,
        subject: `${itemName ? `${itemName} has arrived` : "Your pre-order has arrived"} — order #${number}`,
        html,
    });
}


// ── EVERY SHOP EMAIL GOES THROUGH HERE, AND EVERY ATTEMPT IS WRITTEN DOWN ───────────────────────────────────
// Six senders in this file each called resend.emails.send directly and returned a boolean nobody kept. So
// "did the customer get their confirmation" had no answer — not whether it was sent, not where to, not
// whether Resend took it. For a pre-order that is worse than untidy: the customer agreed to wait weeks on
// the promise we would email them when it landed, and `notified_at` only ever proved we TRIED.
//
// ⚠️ THE LOG WRITE CAN NEVER FAIL A SEND. It is a record of what happened, not part of making it happen —
// a logging table that could throw would turn a delivered email into a 500 on the checkout path.
async function deliver({ kind, orderId = null, to, subject, html }) {
    const resend = getResendClient();
    if (!resend || !to) return false;
    let result = null;
    let thrown = null;
    try {
        result = await resend.emails.send({ from: FROM, to, subject, html });
    } catch (error) {
        thrown = error instanceof Error ? error.message : String(error);
    }
    const ok = Boolean(!thrown && result && !result.error);
    const errorText = thrown
        || (result?.error ? (result.error.message || JSON.stringify(result.error)).slice(0, 400) : null);
    await db.query(
        `INSERT INTO shop_email_log (order_id, kind, to_email, subject, provider_id, ok, error)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [orderId, kind, String(to).slice(0, 320), String(subject || "").slice(0, 300),
            result?.data?.id || null, ok, errorText],
    ).catch(() => { /* a log that breaks the thing it logs is worse than no log */ });
    return ok;
}

export async function sendOrderConfirmationEmail(order) {
    const resend = getResendClient();
    const to = recipientEmail(order);
    if (!resend || !to) {
        return false;
    }
    const isPickup = order.fulfillment_mode === "pickup";
    const number = confirmationNumber(order);
    // ── ⚠️ A PRE-ORDER HAS TO CONTRADICT THE LINE BELOW IT, SO IT GOES ABOVE IT ──────────────────
    // Luke: text "both when they're ordering and when they get the confirmation email that the item is
    // not going to be shipped until the expected arrival date".
    //
    // The two sentences underneath promise "we're packing it now" and "a tracking number as soon as it
    // ships", and on a pre-order both are false by three weeks. Rather than fork them into four variants,
    // the arrival sentence is stated FIRST and in bold -- a customer reads it before the paragraph it
    // qualifies, which is the order the two facts actually happen in.
    const preorderOn = await orderPreorderDate(order);
    const preorderLine = preorderSentence(preorderOn, isPickup ? "pickup" : "ship");
    const html = shellHtml(`
        <h1>Thanks for your order!</h1>
        <p>Your order is confirmed. Your confirmation number is:</p>
        <p style="font-size:24px;font-weight:bold;letter-spacing:2px;margin:12px 0;">#${number}</p>
        <ul>${itemsHtml(order.items_json)}</ul>
        <p>${totalsHtml(order)}</p>
        ${preorderLine ? `<p style="padding:12px 14px;border-radius:8px;background:#fff6e6;border:1px solid #f0c67a;color:#6b4a10;"><strong>${escapeHtml(preorderLine)}</strong></p>` : ""}
        <p>${
            isPickup
                ? `<strong>Pickup in store.</strong> We&rsquo;re packing it now and will email you the moment it&rsquo;s ready. ` +
                  `Come to ${escapeHtml(PICKUP_LOCATION)} and ask for it ${pickupNameLine(order)}.`
                : `<strong>Shipping to:</strong><br/>${shipToHtml(order)}<br/><br/>We&rsquo;ll email you a tracking number as soon as it ships.`
        }</p>
        ${order.receipt_url ? `<p><a href="${escapeHtml(order.receipt_url)}">View your payment receipt &rarr;</a></p>` : ""}
        ${footerHtml()}
    `);
    return deliver({
        kind: "confirmation",
        orderId: order?.id || null,
        to,
        subject: `Your Wolf Den order #${number} is confirmed`,
        html,
    });
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
    // Vault orders say "your cards", never "order #1234" -- the member's mental model is a collection they
    // are taking delivery of, not a purchase. See the two branches below.
    const isVault = Boolean(order.vault_order);
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
        // ⚠️ A VAULT SHIPMENT IS CARDS LEAVING A COLLECTION, not merchandise being sold. It says so, and
        //    it names them properly -- see vaultItemsHtml.
        subject = isVault
            ? `Your ${count(order)} from the vault ${plural(order, "is", "are")} on the way`
            : `Order #${number} has shipped`;
        body = isVault ? `
            <h1>Your cards are on their way</h1>
            <p>These came out of your Card Vault and shipped today. They are no longer in your vault.</p>
            ${trackingHtml(order)}
            ${order.shipping_name ? `<p><strong>Shipping to:</strong><br/>${shipToHtml(order)}</p>` : ""}
            <ul>${vaultItemsHtml(order.items_json)}</ul>
        ` : `
            <h1>Your order is on its way</h1>
            <p>Order <strong>#${number}</strong> shipped today.</p>
            ${trackingHtml(order)}
            ${order.shipping_name ? `<p><strong>Shipping to:</strong><br/>${shipToHtml(order)}</p>` : ""}
            <ul>${itemsHtml(order.items_json)}</ul>
        `;
    } else if (status === "picked_up") {
        subject = isVault
            ? `You picked up ${count(order)} from the vault`
            : `Order #${number} was picked up`;
        body = isVault ? `
            <h1>Thanks for coming in!</h1>
            <p>You collected these from your Card Vault at ${escapeHtml(PICKUP_LOCATION)}. They have been
               taken out of your vault, so they will not show there any more.</p>
            <ul>${vaultItemsHtml(order.items_json)}</ul>
            <p>If you did NOT pick these up, reply to this email and we&rsquo;ll sort it out straight away.</p>
        ` : `
            <h1>Thanks for coming in!</h1>
            <p>Order <strong>#${number}</strong> is marked picked up. Enjoy it.</p>
            <ul>${itemsHtml(order.items_json)}</ul>
            <p>If you did NOT pick this up, reply to this email and we&rsquo;ll sort it out straight away.</p>
        `;
    } else {
        return false;
    }

    return deliver({
        kind: `status_${status}`,
        orderId: order?.id || null,
        to,
        subject,
        html: shellHtml(`${body}${footerHtml()}`),
    });
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
    return deliver({
        kind: "cancelled",
        orderId: order?.id || null,
        to,
        subject: `Your Wolf Den order #${shortId(order.id)} was cancelled`,
        html,
    });
}

/**
 * Some of an order could not be filled, so those lines were refunded and the rest handed over anyway.
 *
 * ⚠️ NOT sendOrderCancelledEmail, WHICH IS THE ONE THAT WAS ALREADY HERE AND IS WRONG FOR THIS. That one
 * says "your order was cancelled" and lists the whole basket. Sent to somebody whose parcel is already in
 * the post with eleven of twelve items in it, that reads as "your parcel is not coming" — the opposite of
 * what happened, to a customer who is already mildly let down. Eric, 2026-11-12, on the first one of these:
 * "an email to the customer apologizing for the inconvenience and noting that we're refunding the item we
 * did not have in stock."
 *
 * ⚠️ IT NAMES WHAT IS MISSING, AND NAMES WHAT IS LEFT ONLY WHEN THERE IS LITTLE OF IT. Listing the whole
 * basket invites a re-read of an order that no longer needs checking, which is why the first version of this
 * said nothing but "everything else is unaffected". That holds for eleven of twelve. It fails for FOUR of
 * five — Eric, 2026-11-13: "The only card we have is Lucario. So I refunded on everything except for
 * Lucario." Told only that four cards were missing and everything else was fine, that customer cannot work
 * out what he is actually coming to collect. So when three or fewer lines survive they are named; above that
 * the basket is big enough that "everything else" is the clearer sentence.
 *
 * ⚠️ AND THE SURVIVORS ARE DERIVED FROM THE ORDER, NOT PASSED IN. The caller says what is MISSING and the
 * remainder is items_json minus those names, so the two halves of the email cannot contradict each other. If
 * a named item fails to match a line — a typo, a renamed variation — the diff is untrustworthy, so it falls
 * back to the generic wording rather than confidently listing the wrong cards at somebody.
 *
 * ⚠️ AND IT DOES NOT PROMISE A RESHIP. We did not have it; whether it comes back into stock is not a thing
 * this email can know, and "we'll send it when it arrives" is a promise nobody is tracking.
 *
 * The refund amount is passed in rather than read off the order, because a PARTIAL refund has nowhere to
 * live on shop_orders yet — refund_id and refund_amount_cents are read by the cancel flow as "this order was
 * cancelled". Until that path exists the number comes from whoever issued the refund in Square.
 */
export async function sendOrderItemRefundedEmail(order, { itemNames, itemName, refundAmountCents } = {}) {
    const resend = getResendClient();
    const to = recipientEmail(order);
    const missing = (Array.isArray(itemNames) ? itemNames : [itemNames ?? itemName])
        .map((n) => String(n || "").trim())
        .filter(Boolean);
    if (!resend || !to || !missing.length) {
        return false;
    }

    let lines = [];
    try {
        lines = Array.isArray(order?.items_json) ? order.items_json : JSON.parse(order?.items_json || "[]");
    } catch {
        lines = [];
    }
    const lineNames = lines.map((i) => String(i?.name || i?.itemName || i?.title || "").trim()).filter(Boolean);

    // One occurrence struck off per named item, so two copies of a card with one missing leaves one behind.
    const pool = [...lineNames];
    let allMatched = lineNames.length > 0;
    for (const n of missing) {
        const at = pool.indexOf(n);
        if (at === -1) {
            allMatched = false;
            break;
        }
        pool.splice(at, 1);
    }
    const remaining = allMatched ? pool : [];
    const nameTheRest = remaining.length > 0 && remaining.length <= 3;

    const name = buyerName(order);
    const isPickup = String(order?.fulfillment_mode || "") === "pickup";
    const shipped = String(order?.fulfillment_status || "") === "shipped";
    const ready = String(order?.fulfillment_status || "") === "ready";
    const many = missing.length > 1;

    // "one of the cards" / "4 of the 5 cards" — the fraction is the apology's actual size, and somebody who
    // ordered five and is getting one should read that in the first sentence rather than count a list.
    const howMany = many
        ? `${missing.length}${lineNames.length ? ` of the ${lineNames.length}` : ""} cards on it`
        : "one of the cards on it";

    // ⚠️ THE LIST AND THE SENTENCE AFTER IT MUST NOT BOTH NAME THE SURVIVORS. The first draft printed
    // "The one card we did have:", the card, and then "The card we did have is packed and waiting for you" —
    // the same noun three lines apart, which reads like a mail merge. Once the list is on the page the
    // sentence takes a pronoun, and it is only when there is no list that it has to say what it refers to.
    const ref = nameTheRest
        ? (remaining.length === 1 ? { it: "It", be: "is", has: "has" } : { it: "Those", be: "are", has: "have" })
        : { it: "Everything else on the order", be: "is", has: "has" };

    const restSentence = (() => {
        if (shipped) {
            return `${ref.it} ${ref.has} already shipped, and the tracking number is in the shipping email we sent you.`;
        }
        if (isPickup) {
            return ready
                ? `${ref.it} ${ref.be} packed and waiting for you at ${escapeHtml(PICKUP_LOCATION)}, ${pickupNameLine(order)}.`
                : `${ref.it} ${ref.be} being set aside for you, and we will email you as soon as the order is ready to collect.`;
        }
        return `${ref.it} ${ref.be} unaffected and on the way to you.`;
    })();

    const html = shellHtml(`
        <h1>${many ? "Some items in your order were out of stock" : "One item in your order was out of stock"}</h1>
        <p>${name ? `Hi ${escapeHtml(name.split(" ")[0])},` : "Hi,"}</p>
        <p>We&rsquo;re sorry &mdash; when we went to pack order <strong>#${shortId(order.id)}</strong> we could not
           find ${howMany}:</p>
        <ul>${missing.map((n) => `<li><strong>${escapeHtml(n)}</strong></li>`).join("")}</ul>
        <p>Our stock count was wrong, and that is our mistake rather than anything to do with your order.
           We&rsquo;ve refunded <strong>${money(refundAmountCents)}</strong> for ${many ? "them" : "it"} &mdash; the
           ${many ? "items" : "item"} plus the sales tax charged on ${many ? "them" : "it"} &mdash; to your original
           payment method. Refunds usually take a few business days to show up on a card statement.</p>
        ${nameTheRest ? `<p>${remaining.length === 1 ? "The one card we did have:" : "What we did have:"}</p>
        <ul>${remaining.map((n) => `<li><strong>${escapeHtml(n)}</strong></li>`).join("")}</ul>` : ""}
        <p>${restSentence}</p>
        <p>Sorry again for the inconvenience.</p>
        <p style="color:#777;font-size:13px;">Questions? Just reply to this email and it comes straight to us.</p>
    `);
    return deliver({
        kind: "item_refunded",
        orderId: order?.id || null,
        to,
        subject: many
            ? `Some items on your Wolf Den order #${shortId(order.id)} were out of stock — refunded`
            : `An item on your Wolf Den order #${shortId(order.id)} was out of stock — refunded`,
        html,
    });
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
    return deliver({
        kind: "cancel_request",
        orderId: order?.id || null,
        to: ownerEmail(),
        subject: `Cancellation request — order #${shortId(order.id)}`,
        html,
    });
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
    return deliver({
        kind: "new_order_alert",
        orderId: order?.id || null,
        to: ownerEmail(),
        subject: `New order #${shortId(order.id)} — ${money(order.total_cents)}`,
        html,
    });
}
