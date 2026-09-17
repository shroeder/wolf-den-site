// ── LOOK AT THE ORDER EMAILS ─────────────────────────────────────────────────────────────────────────────────
// Renders every email an online order can send, for a PICKUP order and a SHIPPED one, onto one page — subject
// line included, because the subject is the half of an email a customer reads first and the half no test ever
// looks at. Nothing is delivered: `resend` is stubbed by lib/email-loader.mjs.
//
//   node --import ./scripts/lib/register-email-loader.mjs scripts/email-preview.mjs
//   node scripts/shot.mjs "file:///<out>" out/emails.png 700 2200      ← and then look at it
//
// The pickup order here is the shape that was going unemailed: shipping_email NULL, the address living in
// customer_email. If a panel below comes out saying "NOT SENT", that is the bug, on screen.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { SENT } from "./lib/resend-capture.mjs";

process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "preview-key-not-used";

const {
    sendOrderCancelledEmail,
    sendOrderConfirmationEmail,
    sendOrderStatusEmail,
} = await import("@/lib/shop-order-email.js");

const ITEMS = JSON.stringify([
    { name: "Alolan Ninetales 145/236 Holo Rare NM", quantity: 1, priceCents: 1299, lineTotalCents: 1299 },
    { name: "Prismatic Evolutions Booster Bundle", quantity: 2, priceCents: 2999, lineTotalCents: 5998 },
]);

// A guest pickup order: no shipping block at all, so customer_email is the ONLY address in the row.
const pickup = {
    id: "9f3c21ab-7e55-4d20-8a11-6b0e42f7c918",
    fulfillment_mode: "pickup",
    fulfillment_status: "unfulfilled",
    customer_email: "guest@example.com",
    customer_name: "Casey Mercer",
    shipping_email: null,
    shipping_name: null,
    items_json: ITEMS,
    subtotal_cents: 7297,
    tax_cents: 528,
    online_fee_cents: 255,
    shipping_cents: 0,
    total_cents: 8080,
    receipt_url: "https://squareup.com/receipt/preview",
};

const shipped = {
    ...pickup,
    id: "41ba7730-1c92-4f0b-9c6d-2d5f8ee41d07",
    fulfillment_mode: "shipping",
    customer_email: null,
    customer_name: null,
    shipping_email: "buyer@example.com",
    shipping_name: "Dana Whitlock",
    shipping_address_line1: "1184 Birchwood Ave",
    shipping_city: "Saint Paul",
    shipping_state: "MN",
    shipping_postal_code: "55106",
    tracking_number: "9405511899223197428490",
    shipping_carrier: "USPS",
    shipping_cents: 495,
    total_cents: 8575,
};

// Each panel: what a customer receives, and at which step. Ordered the way an order actually moves.
const CASES = [
    ["Pickup · confirmation", () => sendOrderConfirmationEmail(pickup)],
    ["Pickup · ready to collect", () => sendOrderStatusEmail({ ...pickup, fulfillment_status: "ready" }, "ready")],
    ["Pickup · picked up", () => sendOrderStatusEmail({ ...pickup, fulfillment_status: "picked_up" }, "picked_up")],
    ["Pickup · cancelled + refunded", () => sendOrderCancelledEmail(pickup, { reason: "One of the boosters was damaged in the case and we'd rather not send it.", refundAmountCents: 8080 })],
    ["Shipping · confirmation", () => sendOrderConfirmationEmail(shipped)],
    ["Shipping · shipped with tracking", () => sendOrderStatusEmail({ ...shipped, fulfillment_status: "shipped" }, "shipped")],
    ["Shipping · cancelled, no refund yet", () => sendOrderCancelledEmail(shipped, { reason: "Sold in store before we could pack it.", refundAmountCents: 0 })],
    // `unfulfilled` is a correction the owner makes, not news — it must send NOTHING, and that is worth seeing.
    ["Pickup · moved back to unfulfilled (should send nothing)", () => sendOrderStatusEmail(pickup, "unfulfilled")],
];

const panels = [];
for (const [label, send] of CASES) {
    const before = SENT.length;
    const ok = await send();
    const mail = SENT.length > before ? SENT[SENT.length - 1] : null;
    panels.push({ label, ok, mail });
    console.log(`${mail ? "sent " : "NONE "} ${label}${mail ? ` → ${mail.to} · ${mail.subject}` : ""}`);
}

const esc = (v) => String(v).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const page = `<!doctype html><meta charset="utf-8"><title>Order emails</title><style>
  body { margin: 0; background: #12121a; font: 14px/1.5 system-ui, sans-serif; color: #e9e4d8; }
  h2 { font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: #ffcf7a; margin: 0 0 6px; }
  .case { padding: 14px 16px; border-top: 1px solid #2a2a34; }
  .meta { font: 12px/1.5 ui-monospace, monospace; color: #9b93a6; margin: 0 0 8px; }
  .mail { background: #fff; color: #111; border-radius: 8px; padding: 14px 16px; }
  .mail h1 { font-size: 20px; margin: 0 0 8px; }
  .mail p, .mail ul { margin: 8px 0; }
  .none { color: #ff8d7a; font-weight: 600; }
</style>
${panels.map(({ label, ok, mail }) => `<section class="case">
  <h2>${esc(label)}</h2>
  ${mail
      ? `<p class="meta">to ${esc(mail.to)} &middot; subject: <strong>${esc(mail.subject)}</strong></p><div class="mail">${mail.html}</div>`
      : `<p class="meta none">nothing sent${ok ? "" : " (sender returned false)"}</p>`}
</section>`).join("\n")}`;

const out = resolve(process.argv[2] || "out/order-emails.html");
writeFileSync(out, page);
console.log(`\n${panels.filter((p) => p.mail).length}/${panels.length} panels carry an email → ${out}`);
