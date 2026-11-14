// ── CAN A LABEL SCAN STILL HAND A CUSTOMER HER OWN ZIP CODE? ────────────────────────────────────────────────
// Order #E83FA83B shipped on 2026-11-12 to New Braunfels TX 78132-9595. The tracking number saved against it,
// and emailed to the customer, was:
//
//     9595346148010163164677
//      ^^^^ her ZIP+4
//
// It fails the USPS check digit and it tracks on nothing. She wrote in two days later: "I have tried it
// multiple times and it does not seem to be working."
//
// WHY: USPS_ROUTING was anchored — /^420\d{5}(\d{4})?/ — so it only stripped the routing prefix when the
// scan STARTED with it. A 2D barcode's rawValue does; an OCR pass over the same label does not, because it
// reads the words above the bars first. One character in front of the 420 and the prefix survived, and
// USPS_22_ANY — which scans left to right and takes the FIRST match — started its match inside the ZIP+4.
//
//   node scripts/test-tracking-scan.mjs
import { parseTrackingFromScan, uspsCheckOk } from "../src/lib/shipping/tracking-scan.js";

let fails = 0;
const check = (ok, msg, extra = "") => {
    console.log(`  ${ok ? "✓" : "✗"} ${msg}${extra ? `  ${extra}` : ""}`);
    if (!ok) fails += 1;
};

// Real USPS numbers off real orders in this database, all of which pass their own check digit.
const REAL = [
    "9534614801016316467814",
    "9505514801016316467846",
    "9534614801016317468070",
    "9505514801016309466870",
];
const ZIP5 = "78132";
const PLUS4 = "9595";   // the +4 that got glued to the front of #E83FA83B

console.log("\nthe check digit itself");
for (const t of REAL) check(uspsCheckOk(t), `${t} validates`);
check(!uspsCheckOk("9595346148010163164677"), "the number we actually emailed does NOT validate");

console.log("\na scan that starts at the barcode (what a 2D rawValue gives)");
for (const real of REAL) {
    for (const routing of [`420${ZIP5}`, `420${ZIP5}${PLUS4}`]) {
        const got = parseTrackingFromScan(routing + real)?.tracking;
        check(got === real, `${routing} + tracking`, got === real ? "" : `got ${got}`);
    }
}

// ── ⚠️ THE CASE THAT BROKE. Anything at all in front of the 420.
console.log("\na scan with label text in front of it (what OCR gives)");
const NOISE = ["USPS", "USPOSTAGE", "PRIORITYMAIL", "USPSTRACKING", "C", "1", "PRIORITYMAILUSPOSTAGEPAID"];
for (const real of REAL) {
    for (const n of NOISE) {
        const scan = `${n}420${ZIP5}${PLUS4}${real}`;
        const got = parseTrackingFromScan(scan)?.tracking;
        check(got === real, `${n.slice(0, 14).padEnd(14)} + 420 + ZIP+4 + tracking`, got === real ? "" : `got ${got}`);
    }
}

console.log("\nno routing prefix at all");
for (const real of REAL) {
    const got = parseTrackingFromScan(real)?.tracking;
    check(got === real, `bare ${real}`, got === real ? "" : `got ${got}`);
}

// ⚠️ A ZIP+4 THAT LOOKS LIKE THE START OF A TRACKING NUMBER IS THE WHOLE TRAP, so it gets its own row:
// 9xxx is a perfectly ordinary +4, and there are thousands of them.
console.log("\nevery ZIP+4 that can start a tracking-shaped run");
for (const p4 of ["9200", "9300", "9400", "9500", "9595", "9234"]) {
    const scan = `USPS420${ZIP5}${p4}${REAL[0]}`;
    const got = parseTrackingFromScan(scan)?.tracking;
    check(got === REAL[0], `+4 = ${p4}`, got === REAL[0] ? "" : `got ${got}`);
}

console.log("\nUPS is unaffected");
check(parseTrackingFromScan("[)>01961Z999AA10123456784")?.tracking === "1Z999AA10123456784", "1Z out of a 2D block");

console.log(fails ? `\n✗ ${fails} failed\n` : "\n✓ a scan cannot hand the customer her own ZIP code any more\n");
process.exit(fails ? 1 : 0);
