// ── READING A TRACKING NUMBER OFF A SHIPPING LABEL ───────────────────────────────────────────────────────────
// Luke: "when we ship it should let us scan or take a picture of the shipping label and email the tracking
// info to the customer."
//
// ⚠️ THE BARCODE IS NOT THE TRACKING NUMBER. That is the whole reason this file exists. Point a scanner at a
// real label and what comes back is almost never the clean number a customer can paste into a carrier's site:
//
//   UPS       the 1Z is in there, but the PDF417 block around it is a structured blob —
//             "[)>\x1E01\x1D96...1Z999AA10123456784\x1D..." — with the tracking buried mid-string
//   USPS      the IMpb barcode is routing FIRST: 420 + the destination ZIP (5 or 9 digits), and only then
//             the 22-digit tracking. Scan it raw and you email the customer their own ZIP code with a
//             number stuck to it, which tracks on nothing
//   FedEx     a Code 128 that often carries a leading application identifier and a 20-digit form where the
//             real 12-digit number is the tail
//
// So a scan is PARSED, never trusted. And when nothing here matches with confidence, this returns null and
// the screen asks a human — an unrecognised label is a thing to look at, not a thing to guess at.
//
// Pure, no imports: the client calls it on a camera frame and the API calls it on an OCR result, and both
// have to agree about what a tracking number is.

/** Everything that is not an alphanumeric, including the GS/RS control bytes carriers put in 2D blocks. */
const clean = (s) => String(s || "").toUpperCase().replace(/[^0-9A-Z]/g, "");

// ── UPS ──────────────────────────────────────────────────────────────────────────────────────────────
// 1Z + 6 shipper + 2 service + 7 package + 1 check = 18 characters.
const UPS = /1Z[0-9A-Z]{16}/;

/**
 * UPS's check digit. Used ONLY to pick between candidates when a 2D block yields more than one 1Z-looking
 * string — never to reject a lone match. A validator that turns away a real label because its own arithmetic
 * is subtly wrong is worse than no validator: the label in the owner's hand is the ground truth, and the
 * screen shows him what was read before anything is sent.
 */
export function upsCheckOk(code) {
    const s = clean(code);
    if (!/^1Z[0-9A-Z]{16}$/.test(s)) return false;
    const body = s.slice(2, 17);
    let odd = 0;
    let even = 0;
    for (let i = 0; i < body.length; i += 1) {
        const c = body[i];
        const v = c >= "0" && c <= "9" ? Number(c) : (c.charCodeAt(0) - 63) % 10;
        if (i % 2 === 0) odd += v; else even += v;
    }
    const total = odd + even * 2;
    return ((10 - (total % 10)) % 10) === Number(s[17]);
}

// ── USPS ─────────────────────────────────────────────────────────────────────────────────────────────
// An IMpb scan is routing-then-tracking. Strip "420" + ZIP5 or ZIP9 before looking at anything else.
const USPS_ROUTING = /^420\d{5}(\d{4})?/;
// 22-digit (most retail, starts 92/93/94/95) and 20-digit (starts 91/94, and the older 03/70/23 forms).
//
// ⚠️ ANCHORED AT THE FRONT, NOT WORD-BOUNDED. These were written with a trailing \b, which is wrong for a
// scan: a word boundary after 22 digits needs a NON-digit next, so a single stray character of scanner noise
// on the end made the match fail and the label came back unreadable. Once the routing prefix is off, the
// tracking is what the string STARTS with — read that many characters and ignore whatever trails.
const USPS_22 = /^(9[2-5]\d{20})/;
const USPS_20 = /^((?:9[1-5]|03|70|23)\d{18})/;
// The same shapes for a scan that never carried a routing prefix, where the number can sit anywhere.
const USPS_22_ANY = /(9[2-5]\d{20})/;
const USPS_20_ANY = /((?:9[1-5]|03|70|23)\d{18})/;

// ── FEDEX ────────────────────────────────────────────────────────────────────────────────────────────
// 12 is the common express/ground number. A 20-digit Code 128 is usually "96" + routing + the 12 at the end.
const FEDEX_20 = /\b96\d{18}\b/;
const FEDEX_12 = /\b\d{12}\b/;
const FEDEX_15 = /\b\d{15}\b/;

// ── DHL ──────────────────────────────────────────────────────────────────────────────────────────────
const DHL_10 = /\b\d{10}\b/;

/**
 * Pull a carrier + tracking number out of whatever a scanner or an OCR pass produced.
 *
 * Returns `{ carrier, tracking, confident }` or null. `confident` is false when the shape matched but
 * nothing corroborated it — the screen uses that to ask rather than to assume.
 *
 * @param {string} raw the barcode's rawValue, or a line of OCR text
 */
export function parseTrackingFromScan(raw) {
    const s = clean(raw);
    if (s.length < 10) return null;

    // ── UPS FIRST, because "1Z" is the one unambiguous marker on any label in the pile. Every candidate in
    // the string is collected and the check digit picks the winner — a PDF417 block can legitimately contain
    // the number twice, and a MaxiCode payload can contain a near-miss alongside the real one.
    const upsAll = s.match(new RegExp(UPS.source, "g")) || [];
    if (upsAll.length) {
        const good = upsAll.find((c) => upsCheckOk(c));
        return { carrier: "UPS", tracking: good || upsAll[0], confident: Boolean(good) };
    }

    // ── USPS. Routing prefix off first, or the ZIP leads and everything after is misread.
    const routed = USPS_ROUTING.test(s);
    const noRoute = s.replace(USPS_ROUTING, "");
    // A routed scan is read from its front — that is where the tracking begins once the ZIP is off.
    const u22 = (routed && noRoute.match(USPS_22)) || s.match(USPS_22_ANY);
    if (u22) return { carrier: "USPS", tracking: u22[1], confident: true };
    const u20 = (routed && noRoute.match(USPS_20)) || s.match(USPS_20_ANY);
    if (u20) return { carrier: "USPS", tracking: u20[1], confident: true };

    // ── FEDEX. The 20-digit form carries the real number in its last 12.
    const f20 = s.match(FEDEX_20);
    if (f20) return { carrier: "FedEx", tracking: f20[0].slice(-12), confident: true };

    // ⚠️ BARE DIGIT RUNS ARE THE LEAST TRUSTWORTHY THING ON A LABEL. A 12-digit run is also a weight field,
    // a postage meter number, an order id, half a phone number. These are returned so the owner has
    // something to confirm, and flagged `confident: false` so the screen never sends on them by itself.
    const digitsOnly = /^\d+$/.test(s);
    if (digitsOnly) {
        if (s.length === 12) return { carrier: "FedEx", tracking: s, confident: false };
        if (s.length === 15) return { carrier: "FedEx", tracking: s, confident: false };
        if (s.length === 10) return { carrier: "DHL", tracking: s, confident: false };
    }
    const f15 = s.match(FEDEX_15);
    if (f15) return { carrier: "FedEx", tracking: f15[0], confident: false };
    const f12 = s.match(FEDEX_12);
    if (f12) return { carrier: "FedEx", tracking: f12[0], confident: false };
    const d10 = s.match(DHL_10);
    if (d10) return { carrier: "DHL", tracking: d10[0], confident: false };

    return null;
}

/** The public tracking page, so the email can link it rather than make the customer go and find one. */
export function trackingUrlFor(carrier, tracking) {
    const t = encodeURIComponent(String(tracking || "").trim());
    if (!t) return null;
    switch (String(carrier || "").toUpperCase()) {
        case "UPS": return `https://www.ups.com/track?tracknum=${t}`;
        case "USPS": return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${t}`;
        case "FEDEX": return `https://www.fedex.com/fedextrack/?trknbr=${t}`;
        case "DHL": return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${t}`;
        default: return null;
    }
}

/** The barcode symbologies that actually appear on shipping labels. */
export const LABEL_FORMATS = ["code_128", "pdf417", "data_matrix", "qr_code", "code_39", "itf", "codabar"];
