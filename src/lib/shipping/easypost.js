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
//   EASYPOST_PARCEL_PER_ITEM_OZ per-item weight (default 1)

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
        const message = payload?.error?.message || payload?.error || `EasyPost request failed (${response.status}).`;
        const error = new Error(typeof message === "string" ? message : "EasyPost request failed.");
        error.easyPostStatus = response.status;
        throw error;
    }

    return payload;
}

// Estimate parcel weight from what's in the cart. This is intentionally a rough heuristic — most
// card orders are light (a mailer + a few singles). Owner can tune it via env without a code change.
export function estimateParcelWeightOz(items) {
    const baseOz = Number(process.env.EASYPOST_PARCEL_BASE_OZ);
    const perItemOz = Number(process.env.EASYPOST_PARCEL_PER_ITEM_OZ);
    const base = Number.isFinite(baseOz) && baseOz > 0 ? baseOz : 3;
    const perItem = Number.isFinite(perItemOz) && perItemOz >= 0 ? perItemOz : 1;

    const itemCount = (items || []).reduce((sum, item) => sum + Math.max(1, Number(item?.quantity || 1)), 0);
    const estimate = base + perItem * itemCount;

    // Keep within sane bounds so a bad input can't produce absurd postage.
    return Math.min(1120, Math.max(1, Math.round(estimate)));
}

function buildParcel(items) {
    return {
        weight: estimateParcelWeightOz(items), // ounces
        length: Number(process.env.EASYPOST_PARCEL_LENGTH_IN) || 9,
        width: Number(process.env.EASYPOST_PARCEL_WIDTH_IN) || 6,
        height: Number(process.env.EASYPOST_PARCEL_HEIGHT_IN) || 1,
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
export async function buyShippingLabel({ shipmentId, rateId }) {
    if (!isEasyPostEnabled()) {
        throw new Error("EasyPost is not configured.");
    }
    if (!shipmentId || !rateId) {
        throw new Error("Missing shipment or rate id.");
    }

    const bought = await easyPostFetch(`/shipments/${encodeURIComponent(shipmentId)}/buy`, {
        method: "POST",
        body: JSON.stringify({ rate: { id: String(rateId) } }),
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
