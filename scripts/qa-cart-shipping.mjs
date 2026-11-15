// ── DOES THE CART SAY "FREE SHIPPING" BEFORE ANYONE HAS CHOSEN HOW TO GET IT? ───────────────────────────────
// Luke, 2026-11-15, after refunding $213.11: "test the ui out locally with mocks to see if its an us problem".
//
// Andres Quang: "It was free shipping on my screen when I checked out, but when I see the receipt, it charged
// me for shipping." This reproduces his screen rather than arguing about it.
//
// ⚠️ THE MOCK IS THE SERVER'S OWN ANSWER, NOT AN INVENTED ONE. /api/shop/cart is intercepted and fulfilled
// with exactly what getCartSummary returns for his basket with NO fulfilment mode chosen — six poster
// collections, $168.00, and shippingCents 0, because shopShippingCents answers 0 for any mode that is not
// "shipping". A mock that made up its own numbers would prove nothing about our code.
//
//   PORT=3100 node scripts/qa-cart-shipping.mjs
import { writeFileSync, mkdirSync } from "node:fs";

import { attach, launchChrome, requireDevServer } from "./lib/qa-chrome.mjs";

const PORT = process.env.PORT || "3000";
const OUT = "scratch/cart-shipping";
mkdirSync(OUT, { recursive: true });

await requireDevServer(PORT);
const chrome = launchChrome(9368, "qa-cart-profile");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ws = new WebSocket(await attach(9368));
await new Promise((r) => { ws.addEventListener("open", r, { once: true }); });
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
    if (m.method === "Fetch.requestPaused") onPaused(m.params);
});
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value;

// His actual basket. subtotal 16800 = 6 x $28.00.
const ITEM = {
    id: "mock-unova", name: "Unova Poster Collection", quantity: 6,
    priceCents: 2800, unitPriceCents: 2800, lineTotalCents: 16800, imageUrl: null, maxQuantity: 12,
};
const CART = {
    items: [ITEM], itemCount: 6,
    subtotalCents: 16800,
    // ⚠️ ZERO, AND THAT IS THE POINT. No mode chosen -> shopShippingCents returns 0 before it ever reaches
    // the weight table. The question this rig asks is what the SCREEN does with that zero.
    shippingCents: 0,
    // What postage WOULD be for this basket, from the same function that bills it.
    shippingIfDeliveredCents: 2500,
    onlineFeeCents: 588,
    taxCents: 1155,
    totalCents: 18543,
    taxRate: 0.06875,
    hasUnavailableItems: false,
    pickupOnly: false,
    insuranceOffered: false,
};

async function onPaused({ requestId, request }) {
    const url = String(request.url || "");
    if (url.includes("/api/shop/cart")) {
        const body = Buffer.from(JSON.stringify(CART)).toString("base64");
        await send("Fetch.fulfillRequest", {
            requestId, responseCode: 200, body,
            responseHeaders: [{ name: "content-type", value: "application/json" }],
        });
        return;
    }
    await send("Fetch.continueRequest", { requestId });
}

await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 430, height: 940, deviceScaleFactor: 1, mobile: true });
await send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });

await send("Page.navigate", { url: `http://localhost:${PORT}/cart` });
for (let k = 0; k < 90; k += 1) {
    if (await ev(`/Unova|Your cart|Subtotal/i.test(document.body.innerText||"")`)) break;
    await sleep(500);
}
await sleep(2500);

const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
if (shot?.data) writeFileSync(`${OUT}/cart.png`, Buffer.from(shot.data, "base64"));

// ⚠️ READ THE WORDS, NOT THE SCREENSHOT. A picture needs a human; this is the assertion.
const text = await ev(`(document.body.innerText || "").replace(/\\s+/g, " ")`);

// ⚠️ A RIG THAT JUDGES AN EMPTY PAGE IS A RIG THAT LIES. The first run of this reported a clean pass
// against a 404: /cart calls notFound() unless PAYMENTS_ENABLED and NEXT_PUBLIC_PAYMENTS_ENABLED are both
// "true", so there was no cart to test and "no free shipping found" was true and worthless.
if (!/Unova|Subtotal|cart/i.test(text || "")) {
    console.log("");
    console.log("✗ THE CART DID NOT RENDER — nothing below would mean anything.");
    console.log("   page said: " + String(text || "(empty)").slice(0, 160));
    console.log("   /cart 404s unless PAYMENTS_ENABLED=true AND NEXT_PUBLIC_PAYMENTS_ENABLED=true.");
    try { chrome.kill(); } catch { /* gone */ }
    process.exit(2);
}
// ── ⚠️ THE DEFECT IS A TOTAL, NOT THE WORD "FREE" ────────────────────────────────────────
// The first version looked for the word "free" and passed on BOTH the broken and the fixed build,
// because the screen never says it. What it does is quieter: it prints a definite
//     Subtotal $168.00  Tax $11.55  Online fee $5.88  Total $185.43
// with no shipping line, before any delivery method is chosen. The customer reads $185.43 and is
// charged $213.11. "Free shipping" is simply what a person calls a total with no postage in it.
// So: with no mode chosen, THERE MUST BE NO FINAL TOTAL.
// ⚠️ "$185.43 + shipping" IS NOT A COMMITTED TOTAL -- it is the honest withheld form, and counting
// it as a commitment made this rig report the FIX as broken. Only a total with nothing after it counts.
// ⚠️ THE ELEMENT, NOT A REGEX OVER THE PAGE. Two earlier versions of this check matched a line
// item total and then the honest "$185.43 + shipping" form, reporting the bug as fixed and then
// the fix as broken. .shop-payment-total is the one number the buyer pays.
const payTotal = await ev(`(() => {
    const el = document.querySelector(".shop-payment-total strong");
    return el ? (el.textContent || "").replace(/\s+/g, " ").trim() : null;
})()`);
// ⚠️ THE TEST FLIPPED. The question is no longer "is a total withheld" -- it is "does the cart show
// the number they will actually pay". Delivered on this basket is $168.00 + $25.00 postage + tax +
// fee. A total that is MISSING postage is the defect; a withheld total is now also a failure, because
// the buyer still cannot see what they owe.
// ── THE ASSERTION ──────────────────────────────────────────────────────────────────────────
// ⚠️ IT WAS "is the total withheld". That was right for ten minutes and is now wrong. Luke:
// "we should be showing them the number that they are going to pay." So the test is whether
// the cart, with NO delivery method chosen, shows BOTH a real postage figure and a real
// total that contains it.
const shipRow = await ev(`(() => {
    const rows = [...document.querySelectorAll(".shop-payment-breakdown p, .shop-payment-total")];
    const r = rows.find((x) => /shipping/i.test(x.querySelector("span")?.textContent || ""));
    return r ? (r.querySelector("strong")?.textContent || "").trim() : null;
})()`);
const moneyOf = (t) => { const m = String(t || "").match(/\$([\d,]+\.\d\d)/); return m ? Number(m[1].replace(/,/g, "")) : null; };
const shipAmount = moneyOf(shipRow);
const totalAmount = moneyOf(payTotal);
const totalIsBare = Boolean(payTotal) && !String(payTotal).includes("+");
// A total that contains the postage must exceed subtotal + postage.
const totalIncludesShipping = totalIsBare && shipAmount != null && totalAmount != null
    && totalAmount >= 168.00 + shipAmount;

console.log(`\ncart, with no delivery method chosen:`);
console.log(`  shipping row:   ${shipRow || "NOT SHOWN"}`);
console.log(`  payment total:  ${payTotal || "NOT SHOWN"}`);
console.log(`\n  ${totalIncludesShipping
    ? "✓ the postage AND a total containing it are both on screen before any choice is made"
    : `✗ IT IS AN US PROBLEM — shipping=${shipRow || "missing"}, total=${payTotal || "missing"}`}`);
console.log(`  shot ${OUT}/cart.png`);

try { chrome.kill(); } catch { /* gone */ }
process.exit(totalIncludesShipping ? 0 : 1);
