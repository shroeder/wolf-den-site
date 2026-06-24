import "server-only";

import { Resend } from "resend";

import { SITE_URL } from "@/lib/site";

const FROM_ADDRESS = "The Wolf Den <portal@wolfdengamingmn.com>";

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

function unsubscribeUrl(unsubscribeToken) {
    const url = new URL("/api/product-alerts/unsubscribe", baseUrl());

    url.searchParams.set("token", unsubscribeToken);

    return url.toString();
}

function unsubscribeFooter(unsubscribeToken) {
    return `
        <hr />
        <p><small>You're receiving this because you signed up for new-arrival alerts at The Wolf Den • Montgomery, MN.
        <br /><a href="${unsubscribeUrl(unsubscribeToken)}">Unsubscribe</a></small></p>
    `;
}

export async function sendSubscriberConfirmationEmail(email, rawToken, categoryNames = []) {
    const resend = getResendClient();
    const confirmUrl = new URL("/api/product-alerts/confirm", baseUrl());

    confirmUrl.searchParams.set("token", rawToken);

    const categoriesLine = categoryNames.length
        ? `<p>You'll be alerted about new arrivals in: <strong>${categoryNames.join(", ")}</strong>.</p>`
        : "";

    const result = await resend.emails.send({
        from: FROM_ADDRESS,
        to: email,
        subject: "Confirm your Wolf Den new-arrival alerts",
        html: `
            <h1>Confirm your new-arrival alerts</h1>
            <p>You asked The Wolf Den to email you when new products land in the shop. Confirm this address to turn alerts on.</p>
            ${categoriesLine}
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

function formatCategorySection(categoryName, items) {
    const rows = items
        .map((item) => {
            const tag = item.kind === "restock" ? ' <span style="color:#5a5a5a;font-size:12px;">(back in stock)</span>' : "";

            return `
                <tr>
                    <td style="padding:8px;border-bottom:1px solid #e7e7e7;">
                        <strong>${item.name}</strong>${tag}
                    </td>
                </tr>
            `;
        })
        .join("");

    return `
        <h2 style="margin-bottom:4px;font-size:16px;">${categoryName}</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
            <tbody>${rows}</tbody>
        </table>
    `;
}

/**
 * Send a single digest covering all of a subscriber's new arrivals, grouped by category.
 * `sections` is an array of { categoryName, items: [{ name, kind }] }.
 */
export async function sendNewArrivalsDigestEmail(email, sections, unsubscribeToken) {
    const resend = getResendClient();
    const shopUrl = new URL("/shop", baseUrl());

    const totalItems = sections.reduce((sum, section) => sum + section.items.length, 0);
    const body = sections.map((section) => formatCategorySection(section.categoryName, section.items)).join("");

    const result = await resend.emails.send({
        from: FROM_ADDRESS,
        to: email,
        subject:
            totalItems === 1
                ? "A new arrival just landed at The Wolf Den"
                : `${totalItems} new arrivals just landed at The Wolf Den`,
        html: `
            <h1>Fresh in the shop</h1>
            <p>New stock just came in for the categories you follow:</p>
            ${body}
            <p style="margin-top:16px;">Stock can move fast, so stop in soon or reach out to hold something.</p>
            <p><a href="${shopUrl.toString()}" style="${goldButton}">Browse the shop</a></p>
            ${unsubscribeFooter(unsubscribeToken)}
        `,
    });

    if (result.error) {
        throw new Error(`Failed to send new-arrivals digest: ${result.error.message}`);
    }

    return result;
}
