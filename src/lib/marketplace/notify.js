import "server-only";

import { createServerLogger } from "@/lib/server-logger";
import { SITE_URL } from "@/lib/site";

// Owner-facing nudge: when a buyer messages a vendor, also ping Discord so the lead is seen fast — an
// email alone is easy to miss, and at one vendor the first impressions set the tone. Best-effort and
// non-blocking: never holds up (or fails) the buyer's contact submission.

const notifyLogger = createServerLogger({ source: "api", subsystem: "marketplace-notify" });

function baseUrl() {
    return process.env.NEXT_PUBLIC_BASE_URL || SITE_URL;
}

// Uses a dedicated marketplace webhook if configured, else falls back to the new-arrivals webhook so
// it works out of the box on the channel that already exists. Silent no-op if neither is set.
export async function notifyNewLead({ vendorName, buyerName, buyerEmail, itemTitle, price, message, productUrl }) {
    const webhookUrl =
        process.env.DISCORD_MARKETPLACE_WEBHOOK_URL || process.env.DISCORD_NEW_ARRIVALS_WEBHOOK_URL;

    if (!webhookUrl) {
        return;
    }

    const fields = [
        { name: "Buyer", value: `${buyerName ? `${buyerName} · ` : ""}${buyerEmail}`, inline: false },
    ];
    if (price !== null && price !== undefined) {
        fields.push({ name: "Asking", value: `$${Number(price).toFixed(2)}`, inline: true });
    }
    if (message) {
        fields.push({ name: "Message", value: String(message).slice(0, 1000), inline: false });
    }

    const embed = {
        title: `New marketplace lead: ${itemTitle || "a listing"}`,
        description: `${vendorName ? `For ${vendorName}. ` : ""}Reply to the buyer by email, then mark the outcome in the portal.`,
        url: productUrl || new URL("/marketplace/portal", baseUrl()).toString(),
        color: 0x8b5cf6,
        fields,
    };

    try {
        const response = await fetch(webhookUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ embeds: [embed] }),
        });

        if (!response.ok) {
            const text = await response.text().catch(() => "");
            throw new Error(`Discord ${response.status}: ${text.slice(0, 150)}`);
        }
    } catch (error) {
        notifyLogger.warn("marketplace.lead_notify_failed", { reason: error.message });
    }
}

// A walk-in seller posted cards looking for vendor offers. Best-effort Discord ping.
export async function notifyNewSellOffer({ name, email, items, askingPrice }) {
    const webhookUrl =
        process.env.DISCORD_MARKETPLACE_WEBHOOK_URL || process.env.DISCORD_NEW_ARRIVALS_WEBHOOK_URL;

    if (!webhookUrl) {
        return;
    }

    const fields = [
        { name: "Selling", value: String(items).slice(0, 1000), inline: false },
        { name: "Seller", value: `${name ? `${name} · ` : ""}${email}`, inline: false },
    ];
    if (askingPrice) {
        fields.push({ name: "Asking", value: String(askingPrice).slice(0, 200), inline: true });
    }

    const embed = {
        title: "New seller looking for offers",
        description: "A local seller posted cards for vendors to make offers on.",
        url: new URL("/marketplace/portal", baseUrl()).toString(),
        color: 0x8b5cf6,
        fields,
    };

    try {
        const response = await fetch(webhookUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ embeds: [embed] }),
        });
        if (!response.ok) {
            const text = await response.text().catch(() => "");
            throw new Error(`Discord ${response.status}: ${text.slice(0, 150)}`);
        }
    } catch (error) {
        notifyLogger.warn("marketplace.sell_offer_notify_failed", { reason: error.message });
    }
}
