import "server-only";

import { Resend } from "resend";

import { db } from "@/lib/db";
import { createServerLogger } from "@/lib/server-logger";

// "Sell or consign to us" intake: record the inquiry and email the owner (reply-to the customer so a
// reply goes straight back to them). Best-effort email — the inquiry is saved even if the send hiccups.

const inquiryLogger = createServerLogger({ source: "api", subsystem: "sell-inquiry" });

const FROM_ADDRESS = "The Wolf Den <portal@wolfdengamingmn.com>";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LEN = 4000;

export function isValidEmail(value) {
    return EMAIL_PATTERN.test(String(value || "").trim().toLowerCase());
}

function notifyEmail() {
    return process.env.SELL_INQUIRY_EMAIL || process.env.MARKETPLACE_ADMIN_EMAIL || "luke@wolfdengamingmn.com";
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export async function createSellInquiry({ kind, name, email, phone, items, message, itemsJson = null }) {
    if (!isValidEmail(email)) {
        throw new Error("A valid email address is required.");
    }
    if (!items || !String(items).trim()) {
        throw new Error("Tell us a bit about what you'd like to sell or consign.");
    }

    const normalizedKind = kind === "consign" ? "consign" : "sell";
    const clean = (v) => (v ? String(v).slice(0, MAX_LEN).trim() : null);

    const row = await db.queryOne(
        `INSERT INTO sell_inquiry (kind, name, email, phone, items, message, items_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
            normalizedKind,
            clean(name),
            String(email).trim(),
            clean(phone),
            String(items).slice(0, MAX_LEN).trim(),
            clean(message),
            itemsJson ? JSON.stringify(itemsJson) : null,
        ]
    );

    try {
        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) {
            throw new Error("Missing RESEND_API_KEY environment variable.");
        }

        const resend = new Resend(apiKey);
        const label = normalizedKind === "consign" ? "consign" : "sell";
        const html = `
            <h2>New request to ${label} cards</h2>
            <p><strong>From:</strong> ${escapeHtml(name) || "(no name)"} &lt;${escapeHtml(email)}&gt;</p>
            ${phone ? `<p><strong>Phone:</strong> ${escapeHtml(phone)}</p>` : ""}
            <p><strong>Wants to:</strong> ${label}</p>
            <p><strong>What they have:</strong></p>
            <p style="white-space:pre-wrap">${escapeHtml(items)}</p>
            ${message ? `<p><strong>Message:</strong></p><p style="white-space:pre-wrap">${escapeHtml(message)}</p>` : ""}
        `;

        await resend.emails.send({
            from: FROM_ADDRESS,
            to: notifyEmail(),
            replyTo: String(email).trim(),
            subject: `New ${label} request${name ? ` from ${name}` : ""}`,
            html,
        });

        await db.query(`UPDATE sell_inquiry SET sent_at = NOW() WHERE id = $1`, [row.id]);
        inquiryLogger.info("sell_inquiry.sent", { step: "sent", inquiryId: row.id, kind: normalizedKind });
    } catch (error) {
        // The inquiry is saved; surface the send failure but don't lose it.
        inquiryLogger.error("sell_inquiry.send_failed", error, { step: "send_failed", inquiryId: row.id });
    }

    return { id: row.id };
}
