import "server-only";

import { Resend } from "resend";

import { db } from "@/lib/db";
import { notifyNewSellOffer } from "@/lib/marketplace/notify.js";
import { createServerLogger } from "@/lib/server-logger";
import { SITE_URL } from "@/lib/site";

// Seller-side marketplace intake. A walk-in seller posts what they want to sell; we record it, ping
// the marketplace (Discord), and email active vendors so they can reach out and make an offer. The
// seller opted in to being contacted, so vendors get their contact info directly.

const offersLogger = createServerLogger({ source: "api", subsystem: "marketplace-sell-offers" });

const FROM_ADDRESS = "The Wolf Den Marketplace <portal@wolfdengamingmn.com>";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LEN = 4000;
const BOARD_WINDOW_DAYS = 30;

export function isValidEmail(value) {
    return EMAIL_PATTERN.test(String(value || "").trim().toLowerCase());
}

function toIso(value) {
    return value ? new Date(value).toISOString() : null;
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function baseUrl() {
    return process.env.NEXT_PUBLIC_BASE_URL || SITE_URL;
}

export async function createSellOffer({ name, email, phone, items, askingPrice, itemsJson = null }) {
    if (!isValidEmail(email)) {
        throw new Error("A valid email address is required.");
    }
    if (!items || !String(items).trim()) {
        throw new Error("Tell vendors what you'd like to sell.");
    }

    const clean = (v) => (v ? String(v).slice(0, MAX_LEN).trim() : null);

    const row = await db.queryOne(
        `INSERT INTO sell_offer (name, email, phone, items, asking_price, items_json)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
            clean(name),
            String(email).trim(),
            clean(phone),
            String(items).slice(0, MAX_LEN).trim(),
            clean(askingPrice),
            itemsJson ? JSON.stringify(itemsJson) : null,
        ]
    );

    // Discord ping (best-effort) so the owner sees seller supply come in.
    await notifyNewSellOffer({
        name: clean(name),
        email: String(email).trim(),
        items: String(items).trim(),
        askingPrice: clean(askingPrice),
    });

    // Email active vendors so they can make an offer.
    await emailVendors({ name: clean(name), email: String(email).trim(), phone: clean(phone), items: String(items).trim(), askingPrice: clean(askingPrice) }).catch(
        (error) => offersLogger.warn("marketplace.sell_offer.vendor_email_failed", { reason: error.message })
    );

    offersLogger.info("marketplace.sell_offer.created", { step: "created", offerId: row.id });
    return { id: row.id };
}

async function emailVendors({ name, email, phone, items, askingPrice }) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        return;
    }

    const vendors = await db.query(
        `SELECT email FROM mkt_vendor WHERE status = 'active' AND email IS NOT NULL`
    );
    if (vendors.length === 0) {
        return;
    }

    const resend = new Resend(apiKey);
    const portalUrl = new URL("/marketplace/portal", baseUrl()).toString();
    const html = `
        <h2>A local seller is looking for offers</h2>
        <p><strong>Selling:</strong></p>
        <p style="white-space:pre-wrap">${escapeHtml(items)}</p>
        ${askingPrice ? `<p><strong>Asking:</strong> ${escapeHtml(askingPrice)}</p>` : ""}
        <p><strong>Reach out to them:</strong> ${escapeHtml(name) || "Seller"} &lt;${escapeHtml(email)}&gt;${phone ? ` · ${escapeHtml(phone)}` : ""}</p>
        <p>They posted this to get offers, so contact them directly. More in your <a href="${portalUrl}">vendor portal</a>.</p>
    `;

    // One send, BCC all vendors (don't leak the vendor list between them).
    await resend.emails.send({
        from: FROM_ADDRESS,
        to: FROM_ADDRESS,
        bcc: vendors.map((v) => v.email),
        replyTo: email,
        subject: "A local seller is looking for offers",
        html,
    });
}

// Open sell offers for the vendor portal board (recent, still open).
export async function listOpenSellOffers(limit = 40) {
    const rows = await db.query(
        `SELECT id, name, email, phone, items, asking_price, created_at
         FROM sell_offer
         WHERE status = 'open' AND created_at > NOW() - INTERVAL '${BOARD_WINDOW_DAYS} days'
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit]
    );

    return rows.map((row) => ({
        id: row.id,
        name: row.name || null,
        email: row.email,
        phone: row.phone || null,
        items: row.items,
        askingPrice: row.asking_price || null,
        createdAt: toIso(row.created_at),
    }));
}
