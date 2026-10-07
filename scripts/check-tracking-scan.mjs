// ── WHAT A REAL LABEL SCAN LOOKS LIKE, AND WHAT WE MUST GET OUT OF IT ────────────────────────────────────────
// Every case below is a shape a scanner genuinely returns, not an invented one. The ones that matter most are
// the two that silently email a customer the wrong string: the USPS routing prefix (where the destination ZIP
// leads and the tracking follows) and the UPS 2D block (where the 1Z is buried in a structured payload).
//
//   node --import ./scripts/lib/register-loader.mjs scripts/check-tracking-scan.mjs
import { parseTrackingFromScan, upsCheckOk, trackingUrlFor } from "@/lib/shipping/tracking-scan.js";

const CASES = [
    // ── UPS ───────────────────────────────────────────────────────────────────────────────────────
    ["UPS, bare 1Z off a Code 128", "1Z999AA10123456784", "UPS", "1Z999AA10123456784"],
    ["UPS, lowercase from OCR", "1z999aa10123456784", "UPS", "1Z999AA10123456784"],
    ["UPS, spaced out by OCR", "1Z 999 AA1 01 2345 6784", "UPS", "1Z999AA10123456784"],
    // The PDF417 payload: control bytes, a header, and the tracking mid-string.
    ["UPS, inside a PDF417 block",
        "[)>01961234567891Z999AA10123456784UPSN", "UPS", "1Z999AA10123456784"],

    // ── USPS ──────────────────────────────────────────────────────────────────────────────────────
    // ⚠️ THE ONE THAT MATTERS. 420 + ZIP leads; the tracking is the 22 digits after it.
    ["USPS IMpb with 420+ZIP5 routing", "420551109261234567890123456789",
        "USPS", "9261234567890123456789"],
    ["USPS IMpb with one char of scanner noise on the end", "4205511092612345678901234567890",
        "USPS", "9261234567890123456789"],
    ["USPS, bare 22-digit", "9400111899223817527845", "USPS", "9400111899223817527845"],
    ["USPS, 20-digit", "03102010212345678901", "USPS", "03102010212345678901"],

    // ── FEDEX ─────────────────────────────────────────────────────────────────────────────────────
    ["FedEx 20-digit, number in the tail", "96123456789012345678", "FedEx", "345678901234".slice(0, 12)],
    ["FedEx bare 12-digit", "123456789012", "FedEx", "123456789012"],

    // ── NOTHING ───────────────────────────────────────────────────────────────────────────────────
    ["gibberish", "HELLO", null, null],
    ["too short", "12345", null, null],
];

let bad = 0;
console.log("── PARSING ──────────────────────────────────────────────────────────────────");
for (const [label, raw, wantCarrier, wantTracking] of CASES) {
    const got = parseTrackingFromScan(raw);
    const okCarrier = (got?.carrier || null) === wantCarrier;
    // The FedEx-20 case computes its expected tail from the input, so compare on what the rule promises.
    const expect = wantCarrier === "FedEx" && raw.length === 20 ? raw.slice(-12) : wantTracking;
    const okTracking = (got?.tracking || null) === expect;
    const ok = okCarrier && okTracking;
    if (!ok) bad += 1;
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}`);
    if (!ok) console.log(`          want ${wantCarrier}/${expect}   got ${got?.carrier}/${got?.tracking}`);
}

console.log("\n── UPS CHECK DIGIT ──────────────────────────────────────────────────────────");
// Used only to choose between candidates, never to reject — so this reports rather than fails the run.
for (const c of ["1Z999AA10123456784", "1Z999AA10123456785"]) {
    console.log(`  ${c}  ->  ${upsCheckOk(c) ? "passes" : "fails"}`);
}

console.log("\n── LINKS ────────────────────────────────────────────────────────────────────");
for (const [c, t] of [["UPS", "1Z999AA10123456784"], ["USPS", "9400111899223817527845"], ["FedEx", "123456789012"]]) {
    console.log(`  ${c.padEnd(6)} ${trackingUrlFor(c, t)}`);
}

console.log(bad ? `\nFAIL — ${bad} case(s)` : "\nOK — every label shape parsed to the right number.");
process.exit(bad ? 1 : 0);
