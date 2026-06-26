import "server-only";

import { Resend } from "resend";

import { SITE_URL } from "@/lib/site";

function getResendClient() {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
        throw new Error("Missing RESEND_API_KEY environment variable.");
    }

    return new Resend(apiKey);
}

function escapeHtml(value) {
    return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

export async function sendEventSignupConfirmationEmail({
    to,
    name,
    event,
    slotNumber,
    seatsRemaining,
    capacity,
}) {
    const resend = getResendClient();
    const eventUrl = new URL(`/events/${event.slug}`, process.env.NEXT_PUBLIC_BASE_URL || SITE_URL);
    const safeName = escapeHtml(name);
    const safeTitle = escapeHtml(event.title);
    const safeDay = escapeHtml(event.day || "See event page");
    const safeTime = escapeHtml(event.time || "See event page");
    const hasEntryFee = event.entryFee && event.entryFee !== "Free";
    const feeRow = hasEntryFee
        ? `<p style="margin:8px 0 0;"><strong>Entry fee:</strong> ${escapeHtml(event.entryFee)}</p>`
        : "";

    const result = await resend.emails.send({
        from: "The Wolf Den <portal@wolfdengamingmn.com>",
        to,
        subject: `You're signed up: ${event.title}`,
        html: `
            <div style="background:#0e0e0e;padding:24px;font-family:Segoe UI,Arial,sans-serif;color:#f2f2f2;">
                <div style="max-width:620px;margin:0 auto;background:#161616;border:1px solid rgba(255,255,255,0.12);border-radius:14px;overflow:hidden;">
                    <div style="padding:20px 20px 16px;background:linear-gradient(135deg,rgba(212,175,55,0.22),rgba(212,175,55,0.06));border-bottom:1px solid rgba(255,255,255,0.1);">
                        <p style="margin:0 0 6px;color:#d4af37;font-weight:700;letter-spacing:.05em;text-transform:uppercase;font-size:12px;">The Wolf Den</p>
                        <h1 style="margin:0;font-size:22px;line-height:1.3;color:#f8f8f8;">Event Signup Confirmed</h1>
                    </div>

                    <div style="padding:20px;">
                        <p style="margin:0 0 14px;">Hi ${safeName},</p>
                        <p style="margin:0 0 16px;">You are confirmed for <strong>${safeTitle}</strong>.</p>

                        <div style="border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:14px;background:#1f1f1f;">
                            <p style="margin:0 0 8px;"><strong>Day:</strong> ${safeDay}</p>
                            <p style="margin:0 0 8px;"><strong>Time:</strong> ${safeTime}</p>
                            <p style="margin:0 0 8px;"><strong>Your seat:</strong> #${slotNumber}</p>
                            <p style="margin:0;"><strong>Spots left:</strong> ${seatsRemaining} of ${capacity}</p>
                            ${feeRow}
                        </div>

                        <p style="margin:16px 0 0;">
                            <a href="${eventUrl.toString()}" style="display:inline-block;padding:11px 18px;background:#d4af37;color:#0e0e0e;text-decoration:none;border-radius:8px;font-weight:700;">View Event Details</a>
                        </p>

                        <p style="margin:20px 0 0;color:#b8b8b8;font-size:13px;">If your plans change, contact The Wolf Den so we can open your seat for another player.</p>
                    </div>
                </div>
            </div>
        `,
    });

    if (result.error) {
        throw new Error(`Failed to send event signup confirmation email: ${result.error.message}`);
    }

    return result;
}