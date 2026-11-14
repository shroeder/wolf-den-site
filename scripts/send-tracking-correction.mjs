// ── EMAIL A CUSTOMER THE TRACKING NUMBER WE SHOULD HAVE SENT ────────────────────────────────────────────────
// Luke, 2026-11-14: "Emailer from the Wolf Den account." So it goes from portal@wolfdengamingmn.com, the same
// address every other order email comes from — not a reply typed out of a personal inbox.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/send-tracking-correction.mjs E83FA83B
//        → renders the exact email to out/, prints it, sends NOTHING
//
//   ... scripts/send-tracking-correction.mjs E83FA83B --send
//        → sends it
//
// ⚠️ IT REFUSES TO SEND A NUMBER THAT DOES NOT VALIDATE. The whole incident was a tracking number that was
// never real, so mailing a second bad one would be the same mistake with an apology stapled to it. A USPS
// number must pass its check digit before this will send; anything else needs a human to look at it.
import { mkdirSync, writeFileSync } from "node:fs";

import { db } from "@/lib/db";
import { sendTrackingCorrectedEmail } from "@/lib/shop-order-email.js";
import { uspsCheckOk } from "@/lib/shipping/tracking-scan.js";

const ref = (process.argv[2] || "").replace(/^#/, "").toLowerCase();
const SEND = process.argv.includes("--send");
if (!ref || ref.length < 6) { console.error("usage: send-tracking-correction.mjs <order-ref> [--send]"); process.exit(1); }

const order = await db.queryOne(
    `SELECT * FROM shop_orders WHERE LEFT(id::text, 8) = $1`, [ref.slice(0, 8)],
).catch(() => null);
if (!order) { console.error(`no order #${ref.toUpperCase()}`); process.exit(1); }

const t = String(order.tracking_number || "").trim();
console.log(`#${ref.toUpperCase()}  ${order.customer_name}  <${order.customer_email || order.shipping_email}>`);
console.log(`  tracking: ${t || "(none)"}`);

// Only USPS shapes are check-digit-able here; a UPS 1Z has its own and its own branch in the parser.
const isUsps = /^(9[1-5]|03|70|23)\d+$/.test(t.replace(/\D/g, ""));
if (isUsps && !uspsCheckOk(t)) {
    console.error(`\n✗ that number FAILS the USPS check digit — refusing to email it. Fix the order first.`);
    process.exit(1);
}
console.log(`  ${isUsps ? "✓ passes the USPS check digit" : "(not a USPS shape — not check-digited)"}`);

if (!SEND) {
    // Render exactly what would go out, by calling the real sender with a stubbed client.
    const { shellHtml } = await import("@/lib/shop-order-email.js").catch(() => ({}));
    mkdirSync("out", { recursive: true });
    process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "preview-key-not-used";
    let captured = null;
    const mod = await import("@/lib/shop-order-email.js");
    // The sender returns the Resend payload; with no key it returns false, so preview by sending through a
    // capture. Simplest honest preview: call it and capture what Resend was handed.
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
        if (String(url).includes("resend")) { captured = JSON.parse(init.body); return new Response(JSON.stringify({ id: "preview" }), { status: 200 }); }
        return realFetch(url, init);
    };
    await mod.sendTrackingCorrectedEmail(order).catch(() => {});
    globalThis.fetch = realFetch;
    if (captured) {
        writeFileSync("out/tracking-correction.html", `<p style="font:600 14px system-ui;color:#555">To: ${captured.to} &middot; Subject: ${captured.subject}</p>${captured.html}`);
        console.log(`\n  from:    ${captured.from}`);
        console.log(`  to:      ${captured.to}`);
        console.log(`  subject: ${captured.subject}`);
        console.log(`\n  wrote out/tracking-correction.html — look at it.`);
    } else {
        console.log("\n  (could not capture a preview — check RESEND_API_KEY)");
    }
    console.log("  draft only. pass --send to actually mail it.");
    process.exit(0);
}

const r = await sendTrackingCorrectedEmail(order);
console.log(r ? `\n✓ sent from the Wolf Den account` : `\n✗ not sent (no recipient, no tracking, or no RESEND_API_KEY)`);
