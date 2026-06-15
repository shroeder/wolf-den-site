import "server-only";

import { Resend } from "resend";

import { SITE_URL } from "@/lib/site";

const FROM_ADDRESS = "The Wolf Den <portal@wolfdengamingmn.com>";

const currency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
});

function getResendClient() {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
        throw new Error("Missing RESEND_API_KEY environment variable.");
    }

    return new Resend(apiKey);
}

function baseUrl() {
    return process.env.NEXT_PUBLIC_BASE_URL || SITE_URL;
}

const goldButton =
    "display:inline-block;padding:12px 24px;background:#D4AF37;color:#0E0E0E;text-decoration:none;border-radius:6px;font-weight:bold;";

export async function sendWatcherConfirmationEmail(email, rawToken) {
    const resend = getResendClient();
    const confirmUrl = new URL("/api/looking-for/confirm", baseUrl());

    confirmUrl.searchParams.set("token", rawToken);

    const result = await resend.emails.send({
        from: FROM_ADDRESS,
        to: email,
        subject: "Confirm your Wolf Den card alerts",
        html: `
            <h1>Confirm your card alerts</h1>
            <p>You asked The Wolf Den to email you when cards on your "Looking For" list come into the shop. Confirm this address to turn alerts on.</p>
            <p><a href="${confirmUrl.toString()}" style="${goldButton}">Confirm my email</a></p>
            <p>If you didn't request this, you can safely ignore this email and no alerts will be sent.</p>
            <hr />
            <p><small>The Wolf Den • Montgomery, MN</small></p>
        `,
    });

    if (result.error) {
        throw new Error(`Failed to send confirmation email: ${result.error.message}`);
    }

    return result;
}

function formatCardRows(cards) {
    return cards
        .map((card) => {
            const priceText = card.marketPrice === null || card.marketPrice === undefined
                ? ""
                : ` — market ${currency.format(Number(card.marketPrice))}`;
            const numberText = card.number ? ` #${card.number}` : "";

            return `
                <tr>
                    <td style="padding:8px;border-bottom:1px solid #e7e7e7;">
                        <strong>${card.name}</strong>${numberText}<br />
                        <span style="color:#5a5a5a;font-size:13px;">${card.setName || ""}${priceText}</span>
                    </td>
                </tr>
            `;
        })
        .join("");
}

export async function sendCardRestockEmail(email, cards) {
    const resend = getResendClient();
    const listUrl = new URL("/looking-for", baseUrl());

    const result = await resend.emails.send({
        from: FROM_ADDRESS,
        to: email,
        subject:
            cards.length === 1
                ? `A card you're looking for is in: ${cards[0].name}`
                : `${cards.length} cards you're looking for are in stock`,
        html: `
            <h1>We've got your cards</h1>
            <p>Good news — the following ${cards.length === 1 ? "card" : "cards"} from your "Looking For" list just showed up in our inventory:</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
                <tbody>${formatCardRows(cards)}</tbody>
            </table>
            <p style="margin-top:16px;">Stock can move fast, so stop in soon or reach out to hold it.</p>
            <p><a href="${listUrl.toString()}" style="${goldButton}">View my list</a></p>
            <hr />
            <p><small>You're receiving this because you asked The Wolf Den to alert you about these cards. • Montgomery, MN</small></p>
        `,
    });

    if (result.error) {
        throw new Error(`Failed to send restock email: ${result.error.message}`);
    }

    return result;
}
