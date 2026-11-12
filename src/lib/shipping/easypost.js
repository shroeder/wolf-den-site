import "server-only";

import { createServerLogger } from "@/lib/server-logger";

// EasyPost integration for the online shop: live USPS rates at checkout + one-click label buying
// from the admin orders screen. Everything here is a no-op until EASYPOST_API_KEY is set, so the
// checkout keeps working (flat-rate fallback) with the key absent. The buyer pays the calculated
// postage at checkout, so shipping is cost-neutral to the shop.
//
// Required env before this activates:
//   EASYPOST_API_KEY            your EasyPost production key
//   SHOP_SHIP_FROM_NAME         e.g. "The Wolf Den"
//   SHOP_SHIP_FROM_STREET1      shop street address
//   SHOP_SHIP_FROM_CITY         e.g. "Montgomery"
//   SHOP_SHIP_FROM_STATE        e.g. "MN"
//   SHOP_SHIP_FROM_ZIP          e.g. "56069"
// Optional:
//   SHOP_SHIP_FROM_STREET2, SHOP_SHIP_FROM_PHONE
//   EASYPOST_PARCEL_BASE_OZ     packaging weight (default 3)
//   EASYPOST_PARCEL_SAFETY      over-declare multiplier on contents weight (default 1.25, min 1)

const EASYPOST_API_BASE = "https://api.easypost.com/v2";
const easyPostLogger = createServerLogger({ source: "api", subsystem: "easypost" });

export function isEasyPostEnabled() {
    return Boolean(String(process.env.EASYPOST_API_KEY || "").trim());
}

function getApiKey() {
    const key = String(process.env.EASYPOST_API_KEY || "").trim();
    if (!key) {
        throw new Error("EASYPOST_API_KEY is not configured.");
    }
    return key;
}

function getShipFromAddress() {
    // Ship-from / return address, set via env so the owner's personal address isn't committed to git.
    // Returns + undeliverables should go to the owner's home, NOT the shop (theft risk).
    const street1 = String(process.env.SHOP_SHIP_FROM_STREET1 || "").trim();
    const city = String(process.env.SHOP_SHIP_FROM_CITY || "").trim();
    const state = String(process.env.SHOP_SHIP_FROM_STATE || "").trim().toUpperCase();
    const zip = String(process.env.SHOP_SHIP_FROM_ZIP || "").trim();

    if (!street1 || !city || !state || !zip) {
        throw new Error("Shop ship-from address is not fully configured (SHOP_SHIP_FROM_*).");
    }

    return {
        name: String(process.env.SHOP_SHIP_FROM_NAME || "The Wolf Den").trim(),
        street1,
        street2: String(process.env.SHOP_SHIP_FROM_STREET2 || "").trim() || undefined,
        city,
        state,
        zip,
        country: "US",
        phone: String(process.env.SHOP_SHIP_FROM_PHONE || "").trim() || undefined,
    };
}

async function easyPostFetch(path, init = {}) {
    const key = getApiKey();
    // EasyPost uses HTTP Basic auth with the API key as the username and an empty password.
    const auth = Buffer.from(`${key}:`).toString("base64");

    const response = await fetch(`${EASYPOST_API_BASE}${path}`, {
        ...init,
        headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/json",
            ...(init.headers || {}),
        },
    });

    const text = await response.text();
    let payload = null;
    try {
        payload = text ? JSON.parse(text) : null;
    } catch {
        payload = null;
    }

    if (!response.ok) {
        // ⚠️ EASYPOST NESTS THE USEFUL PART. `error.message` is sometimes a string and sometimes an ARRAY
        // of field errors, and `error.errors` carries the per-field detail that actually names the problem
        // ("rate is expired", "payment method required"). Flattening the lot is the difference between
        // "EasyPost request failed (422)" and a sentence somebody can act on.
        const err = payload?.error || {};
        const parts = [];
        if (typeof err.message === "string") parts.push(err.message);
        else if (Array.isArray(err.message)) parts.push(err.message.map((m) => m?.message || m).filter(Boolean).join("; "));
        for (const sub of err.errors || []) {
            const field = sub?.field ? `${sub.field}: ` : "";
            if (sub?.message) parts.push(`${field}${sub.message}`);
        }
        const message = parts.filter(Boolean).join(" ") || `EasyPost request failed (${response.status}).`;
        const error = new Error(message);
        error.easyPostStatus = response.status;
        error.easyPostCode = err.code || null;
        throw error;
    }

    return payload;
}

// ── ⚠️ SIZING A PARCEL WHEN NOTHING ANYWHERE KNOWS HOW BIG ANYTHING IS ───────────────────────────────────────
// Eric, 2026-11-12, after a $56 label on an order that charged $12: "we need to find a way to intelligently
// predict shipping cost so that we don't end up eating shipping costs in the future."
//
// ⚠️ THERE IS NO SOURCE OF DIMENSIONS, AND ALL THREE CANDIDATES WERE CHECKED BEFORE THIS WAS WRITTEN:
//   · Square item variations carry name, sku and price. No weight, no dimensions, no measurement unit.
//   · tcg_cards carries name, number, rarity, image, market price and a upc. No weight, no dimensions.
//   · tcgcsv.com, which is where tcg_cards comes from, publishes exactly these extendedData fields:
//     Attack 1, Attack 2, Card Type, CardText, HP, Number, Rarity, Resistance, RetreatCost, Stage, UPC,
//     Weakness. Every one is a gameplay attribute. ("HP" is hit points. It is not a weight.)
// So this cannot be made accurate. Do not go looking again; the answer is written down here.
//
// ⚠️ WHICH MAKES THE GOAL "NEVER UNDER-DECLARE", NOT "BE RIGHT". The shop buys the label against this exact
// parcel, so an under-declaration is not a bad guess — it is a bill from USPS weeks later that nobody
// connects to the order. Over-declaring costs the buyer a little at checkout and costs the shop nothing.
// Every constant below is deliberately at the generous end, and every choice resolves upward.
//
// ── WHAT THE OLD ONE GOT WRONG, BECAUSE IT IS THE WHOLE BUG ──────────────────────────────────────────────────
// It took the LARGEST profile in the cart and used its length/width/height as the box, full stop. Weight
// summed; size did not. One booster display and three booster displays declared the same 12x9x5 — and every
// shipping order the shop has ever taken but one declared that identical box. Three $400 Collector Booster
// Displays went out declared at 39oz. They are nearer seven pounds.

// How much the packaging itself weighs, before anything goes in it.
const PACKAGING_OZ = 3;

// Air, bubble wrap and the fact that nothing stacks perfectly. Contents never fill a box.
const PACKING_FACTOR = 1.3;

// ── ESTIMATOR 1: THE PRODUCT TYPE, READ OFF ITS NAME ─────────────────────────────────────────────────────────
// TCGplayer names are rigidly structured, which is the one piece of luck in this whole problem: "Collector
// Booster Display", "Elite Trainer Box", "Booster Bundle", "Commander Deck". Twenty-odd patterns written once
// cover nearly all sealed product, now and in future, with nothing to maintain as stock changes.
//
// ⚠️ THE NUMBERS ARE THE PRODUCT, NOT THE PARCEL, AND THE MARGIN IS APPLIED SEPARATELY. The first draft of
// this table had the padding baked into every constant AND then multiplied by PACKING_FACTOR and the safety
// factor on top — one booster box came out wanting a 14x12x8 at 58oz, which is about three times the truth
// and the kind of quote that loses a sale rather than saving one. These are the item as it sits on a shelf;
// over-declaring is PACKING_FACTOR and EASYPOST_PARCEL_SAFETY's job, so the margin stays visible and tunable
// in one place instead of being spread invisibly across thirteen rows.
//
// ⚠️ ORDER MATTERS: FIRST MATCH WINS, SO THE BIG THINGS ARE LISTED FIRST. "Booster Display Case" contains
// "Booster Display", and a case is an order of magnitude bigger than a display. Anything that reads as both
// must resolve as the larger.
const TYPES = [
    { re: /master case|display case|case/i,                         oz: 300, in3: 2600 },
    { re: /collector booster display|booster display|booster box/i,     oz: 34,  in3: 250 },
    { re: /elite trainer box|etb|ultra premium|premium collection/i, oz: 28,  in3: 250 },
    { re: /booster bundle|bundle|gift box|holiday calendar/i,       oz: 20,  in3: 170 },
    { re: /poster collection|poster/i,                              oz: 12,  in3: 130 },
    { re: /binder|portfolio|album/i,                                    oz: 20,  in3: 150 },
    { re: /tin|collection box|figure/i,                             oz: 14,  in3: 95 },
    { re: /commander deck|starter deck|theme deck|battle deck|deck/i, oz: 12, in3: 80 },
    { re: /playmat|mat/i,                                           oz: 10,  in3: 110 },
    { re: /plush|squish|needoh|stress ball|squeezy/i,               oz: 5,   in3: 70 },
    { re: /sleeve|deck box|toploader|card saver/i,                      oz: 6,   in3: 55 },
    { re: /sleeved booster|blister|booster pack|pack/i,             oz: 3,   in3: 12 },
    { re: /bulk/i,                                                      oz: 14,  in3: 45 },
];
// ── ESTIMATOR 2: THE PRICE ───────────────────────────────────────────────────────────────────────────────────
// The scalable one, and the only estimator that covers a product nobody has described to this file. For
// SEALED product, price tracks physical bulk closely — a $400 line is a display, a $5 line is a pack — and it
// keeps working for the 500 manually-SKU'd items that are in no catalogue at all.
//
// ⚠️ NEVER APPLIED TO SINGLES. An $800 Charizard is one card in a toploader. Price is a bulk signal only once
// something is known not to be a single, which the Square category already says.
function byPrice(unitCents) {
    const dollars = Math.max(0, Number(unitCents) || 0) / 100;
    return {
        oz: Math.min(300, Math.max(3, dollars * 0.09)),
        in3: Math.min(2600, Math.max(12, dollars * 0.7)),
    };
}

// ── ESTIMATOR 3: THE SQUARE CATEGORY ─────────────────────────────────────────────────────────────────────────
// What this file used to do on its own, kept as the floor so nothing can estimate BELOW what today already
// declares. A line that matches no name pattern and has no useful price still lands here.
const CATEGORIES = [
    { re: /single|^magic |^pokemon card|comic/i, oz: 1,  in3: 2 },
    { re: /art|painting|playmat/i,               oz: 6,  in3: 110 },
    { re: /accessor|pack|drink|food/i,           oz: 4,  in3: 55 },
    { re: /sealed|box|bundle|tin|figure|plush/i, oz: 12, in3: 160 },
];
const isSingle = (categoryName) => /single/i.test(String(categoryName || ""));

/**
 * The per-unit estimate for one cart line: the HIGHEST of everything that has an opinion.
 *
 * ⚠️ max(), NOT a priority order, AND THAT IS THE SAFETY PROPERTY. Any one estimator reading low cannot cost
 * the shop money, because another has to agree before the number comes down. The Unova Poster Collection is
 * the worked example: $28 makes the price curve guess small, and the name pattern knows a poster collection
 * is bulky. The bulky answer wins.
 */
export function estimateUnit(item) {
    const name = String(item?.name || "");
    const category = String(item?.categoryName || "");
    const label = category + " " + name;
    let oz = 0;
    let in3 = 0;

    const type = TYPES.find((t) => t.re.test(label));
    if (type) { oz = Math.max(oz, type.oz); in3 = Math.max(in3, type.in3); }

    const cat = CATEGORIES.find((c) => c.re.test(label));
    if (cat) { oz = Math.max(oz, cat.oz); in3 = Math.max(in3, cat.in3); }

    if (!isSingle(category)) {
        const unitCents = Number(item?.priceCents ?? item?.unitPriceCents ?? 0);
        const priced = byPrice(unitCents);
        oz = Math.max(oz, priced.oz);
        in3 = Math.max(in3, priced.in3);
    }

    // Nothing matched at all: treat it as a small boxed item rather than as a card, because a thing this file
    // has never heard of is far more likely to be merchandise than a single.
    if (!oz) { oz = 6; in3 = 80; }
    return { oz, in3 };
}

// ── THE BOXES THE SHOP ACTUALLY HAS ──────────────────────────────────────────────────────────────────────────
// Smallest that fits wins. `in3` is USABLE capacity, already short of length x width x height, because the
// declared dimensions have to be the real outside of the box regardless of how well it was packed.
const BOXES = [
    { l: 9, w: 6, h: 1, in3: 50 },
    { l: 9, w: 7, h: 3, in3: 170 },
    { l: 12, w: 9, h: 5, in3: 480 },
    { l: 14, w: 12, h: 8, in3: 1200 },
    { l: 18, w: 14, h: 12, in3: 2700 },
    { l: 20, w: 16, h: 14, in3: 4400 },
];

/** Everything the shop would put in the box, before packaging and before the safety factor. */
export function estimateContents(items) {
    let oz = 0;
    let in3 = 0;
    for (const item of items || []) {
        const qty = Math.max(1, Number(item?.quantity || 1));
        const unit = estimateUnit(item);
        // ⚠️ BOTH MULTIPLY BY QUANTITY. The old code multiplied weight and not size, which is the entire
        // defect this rewrite exists to fix.
        oz += unit.oz * qty;
        in3 += unit.in3 * qty;
    }
    return { oz, in3 };
}

function safetyFactor() {
    const raw = Number(process.env.EASYPOST_PARCEL_SAFETY);
    // Deliberately >= 1: this knob may make the shop safer, never less safe.
    return Number.isFinite(raw) && raw >= 1 ? raw : 1.25;
}

/** The full picture, so a caller can show its working rather than just a box. */
export function parcelEstimate(items) {
    const base = Number(process.env.EASYPOST_PARCEL_BASE_OZ);
    const packaging = Number.isFinite(base) && base > 0 ? base : PACKAGING_OZ;
    const contents = estimateContents(items);
    const safety = safetyFactor();

    const weight = (contents.oz * safety) + packaging;
    const needed = contents.in3 * PACKING_FACTOR;
    // Smallest box that fits; the biggest one if nothing does, because there is no "too big to post" branch
    // and a clamped size is still better than a 9x6x1 envelope.
    const box = BOXES.find((b) => b.in3 >= needed) || BOXES[BOXES.length - 1];
    return { weight, box, contentsOz: contents.oz, contentsIn3: contents.in3, neededIn3: needed, safety };
}

/**
 * Weight only, for anywhere that wants a number without a box.
 *
 * Kept as an export because it always was one; it now answers off the same estimators as the parcel, so the
 * two can never disagree.
 */
export function estimateParcelWeightOz(items) {
    return Math.min(1120, Math.max(1, Math.round(parcelEstimate(items).weight)));
}

/**
 * The parcel handed to EasyPost, and the one the label is later bought against.
 *
 * ⚠️ THE ENV OVERRIDES PIN THE BOX AND DEFEAT ALL OF THE ABOVE. They predate this and are kept so a bad
 * estimate can be forced to a known box without a deploy — but setting them turns a three-item order and a
 * thirty-item order back into the same parcel, which is what caused the problem. Prefer EASYPOST_PARCEL_SAFETY.
 */
export function buildParcel(items) {
    const { weight, box } = parcelEstimate(items);
    return {
        weight: Math.min(1120, Math.max(1, Math.round(weight))),
        length: Number(process.env.EASYPOST_PARCEL_LENGTH_IN) || box.l,
        width: Number(process.env.EASYPOST_PARCEL_WIDTH_IN) || box.w,
        height: Number(process.env.EASYPOST_PARCEL_HEIGHT_IN) || box.h,
    };
}

function toRateOption(rate) {
    const amountCents = Math.round(Number(rate?.rate || 0) * 100);
    return {
        id: String(rate?.id || ""),
        carrier: String(rate?.carrier || ""),
        service: String(rate?.service || ""),
        amountCents,
        deliveryDays: rate?.delivery_days ?? rate?.est_delivery_days ?? null,
    };
}

// Create an EasyPost shipment for the buyer's address + cart and return purchasable rate options.
// Returns null when EasyPost isn't configured so callers fall back to flat shipping.
export async function getShippingRates({ toAddress, items }) {
    if (!isEasyPostEnabled()) {
        return null;
    }

    const to = {
        name: String(toAddress?.name || "").trim() || undefined,
        street1: String(toAddress?.addressLine1 || "").trim(),
        street2: String(toAddress?.addressLine2 || "").trim() || undefined,
        city: String(toAddress?.city || "").trim(),
        state: String(toAddress?.state || "").trim().toUpperCase(),
        zip: String(toAddress?.postalCode || "").trim(),
        country: String(toAddress?.country || "US").trim().toUpperCase() || "US",
        phone: String(toAddress?.phone || "").trim() || undefined,
    };

    if (!to.street1 || !to.city || !to.state || !to.zip) {
        return null;
    }

    const shipment = await easyPostFetch("/shipments", {
        method: "POST",
        body: JSON.stringify({
            shipment: {
                to_address: to,
                from_address: getShipFromAddress(),
                parcel: buildParcel(items),
            },
        }),
    });

    const rates = (shipment?.rates || [])
        .map(toRateOption)
        .filter((rate) => rate.id && rate.amountCents >= 0)
        .sort((a, b) => a.amountCents - b.amountCents);

    return {
        shipmentId: String(shipment?.id || ""),
        rates,
    };
}

// Re-read a specific rate off an existing shipment. Used server-side at checkout so we charge the
// authoritative EasyPost price, never a client-supplied amount.
export async function getShipmentRate(shipmentId, rateId) {
    if (!isEasyPostEnabled() || !shipmentId || !rateId) {
        return null;
    }

    const shipment = await easyPostFetch(`/shipments/${encodeURIComponent(shipmentId)}`);
    const match = (shipment?.rates || []).find((rate) => String(rate?.id) === String(rateId));

    return match ? toRateOption(match) : null;
}

// Buy the label for a chosen shipment + rate. Returns the label URL + tracking code to store on the
// order. Throws on failure (admin action, surfaced to the owner).
/**
 * A shipment as EasyPost currently sees it. Read-only, costs nothing, buys nothing.
 *
 * ⚠️ THIS IS WHAT MAKES A RETRY SAFE. Buying a label is the one irreversible, billable thing this app
 * does, and the write that records it happens AFTERWARDS — so a database hiccup in between leaves a label
 * bought, paid for, and unrecorded, and the next tap of the button buys a second one. EasyPost already knows
 * the answer; asking before buying turns a double charge into a recovery.
 */
export async function getShipment(shipmentId) {
    if (!isEasyPostEnabled() || !shipmentId) return null;
    const shipment = await easyPostFetch(`/shipments/${encodeURIComponent(shipmentId)}`);
    if (!shipment) return null;
    const rate = shipment.selected_rate || null;
    return {
        id: shipment.id,
        labelUrl: shipment.postage_label?.label_url || null,
        trackingCode: shipment.tracking_code || null,
        carrier: rate?.carrier || null,
        service: rate?.service || null,
        status: shipment.status || null,
        // Every rate still on the shipment, so the caller can say whether the one we stored is still offered.
        rateIds: (shipment.rates || []).map((r) => r.id),
    };
}

/**
 * How much EasyPost charges to insure a parcel, in cents.
 *
 * ⚠️ INSURANCE IS BILLED WHEN THE LABEL IS BOUGHT, NOT INSIDE THE RATE. So a quote built from the rate alone
 * is short by exactly this much, and we would silently absorb the difference on precisely the shipments where
 * it is largest. Any caller that offers insurance has to add this to the price it shows.
 *
 * ~1% of declared value with a floor, which is EasyPost's published shape. It is an ESTIMATE and labelled as
 * one; the real charge is reconciled from the bought label.
 */
export function insuranceCostCents(declaredValueCents) {
    const value = Math.max(0, Math.round(Number(declaredValueCents) || 0));
    if (!value) return 0;
    return Math.max(100, Math.round(value * 0.01));
}

/** Above this declared value a vault shipment is insured and signature-required. See design doc §6. */
export const INSURE_OVER_CENTS = 20000;

export async function buyShippingLabel({ shipmentId, rateId, insuranceCents = 0 }) {
    if (!isEasyPostEnabled()) {
        throw new Error("EasyPost is not configured.");
    }
    if (!shipmentId || !rateId) {
        throw new Error("Missing shipment or rate id.");
    }

    const bought = await easyPostFetch(`/shipments/${encodeURIComponent(shipmentId)}/buy`, {
        method: "POST",
        body: JSON.stringify({
            rate: { id: String(rateId) },
            // EasyPost takes the declared value as a decimal string of DOLLARS on the buy call. Omitted
            // entirely when zero — sending "0.00" is not the same as not insuring and some carriers reject it.
            ...(insuranceCents > 0 ? { insurance: (insuranceCents / 100).toFixed(2) } : {}),
        }),
    });

    const selectedRate = bought?.selected_rate || null;

    return {
        labelUrl: bought?.postage_label?.label_url || null,
        trackingCode: bought?.tracking_code || null,
        carrier: selectedRate?.carrier || null,
        service: selectedRate?.service || null,
        amountCents: selectedRate ? Math.round(Number(selectedRate.rate || 0) * 100) : null,
    };
}

export { easyPostLogger };
