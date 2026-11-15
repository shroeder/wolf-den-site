// ── SAY SORRY AND CONFIRM THE REFUND, FROM THE WOLF DEN ACCOUNT ─────────────────────────────────────────────
// For a refund that is OUR mistake rather than a change of mind. Different letter from the ordinary
// cancellation notice: it opens by agreeing with the customer, and it names the thing they wrote in about.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/send-order-apology.mjs 0C83F3BC
//        → renders it to out/, prints it, sends NOTHING
//   ... --send   → sends it
//
// ⚠️ THE `what` LINE IS NOT BOILERPLATE. It is edited per incident, below. A refund letter that does not
// repeat the customer's own complaint back to them reads as a form, and the one thing somebody who has been
// overcharged can tell instantly is whether a person actually read their message.
import { mkdirSync, writeFileSync } from "node:fs";

import { db } from "@/lib/db";
import { sendOrderRefundApologyEmail } from "@/lib/shop-order-email.js";

const ref = (process.argv[2] || "").replace(/^#/, "").toLowerCase().slice(0, 8);
const SEND = process.argv.includes("--send");
if (ref.length < 6) { console.error("usage: send-order-apology.mjs <order-ref> [--send]"); process.exit(1); }

// The incident this was written for. Change this line, not the sender, for the next one.
const WHAT = {
    "0c83f3bc": "You were right, and thank you for the clear description — our cart was showing shipping as "
        + "free before you had chosen pickup or delivery, and then the real postage was added when the order "
        + "was priced. That is our bug, not a mistake on your end.",
};

const order = await db.queryOne(`SELECT * FROM shop_orders WHERE LEFT(id::text, 8) = $1`, [ref]).catch(() => null);
if (!order) { console.error(`no order #${ref.toUpperCase()}`); process.exit(1); }

const what = WHAT[ref];
if (!what) { console.error(`no 'what' line written for #${ref.toUpperCase()} — add one before sending.`); process.exit(1); }

console.log(`#${ref.toUpperCase()}  ${order.customer_name}  <${order.customer_email || order.shipping_email}>`);
console.log(`  refunding: $${(Number(order.total_cents || 0) / 100).toFixed(2)}`);

if (!SEND) {
    process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "preview-key-not-used";
    let captured = null;
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
        if (String(url).includes("resend")) { captured = JSON.parse(init.body); return new Response(JSON.stringify({ id: "preview" }), { status: 200 }); }
        return realFetch(url, init);
    };
    await sendOrderRefundApologyEmail(order, { what, refundAmountCents: order.total_cents }).catch(() => {});
    globalThis.fetch = realFetch;
    if (captured) {
        mkdirSync("out", { recursive: true });
        writeFileSync("out/order-apology.html", `<p style="font:600 14px system-ui;color:#555">To: ${captured.to} &middot; Subject: ${captured.subject}</p>${captured.html}`);
        console.log(`\n  to:      ${captured.to}`);
        console.log(`  subject: ${captured.subject}`);
        console.log(`\n  wrote out/order-apology.html — look at it.`);
    }
    console.log("  draft only. pass --send to actually mail it.");
    process.exit(0);
}

const r = await sendOrderRefundApologyEmail(order, { what, refundAmountCents: order.total_cents });
console.log(r ? "\n✓ sent from the Wolf Den account" : "\n✗ not sent (no recipient or no RESEND_API_KEY)");
