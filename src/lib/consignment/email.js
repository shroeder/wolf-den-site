import "server-only";

import { Resend } from "resend";
import { SITE_URL } from "@/lib/site";

const currency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
});

const dateOnly = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
});

function getResendClient() {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
        throw new Error("Missing RESEND_API_KEY environment variable.");
    }

    return new Resend(apiKey);
}

export async function sendSetupEmail(consignor, setupToken) {
    const resend = getResendClient();
    const setupUrl = new URL("/consign/setup", process.env.NEXT_PUBLIC_BASE_URL || SITE_URL);

    setupUrl.searchParams.set("token", setupToken);

    const result = await resend.emails.send({
        from: "The Wolf Den <portal@wolfdengamingmn.com>",
        to: consignor.email,
        subject: "Set up your Wolf Den Consignment Portal",
        html: `
            <h1>Welcome, ${consignor.display_name}!</h1>
            <p>Your consignment portal is ready. Click the link below to set your password and get started.</p>
            <p><a href="${setupUrl.toString()}" style="display: inline-block; padding: 12px 24px; background: #D4AF37; color: #0E0E0E; text-decoration: none; border-radius: 6px; font-weight: bold;">Set Up Portal</a></p>
            <p>This link expires in 14 days.</p>
            <hr />
            <p><small>The Wolf Den • Montgomery, MN</small></p>
        `,
    });

    if (result.error) {
        throw new Error(`Failed to send setup email: ${result.error.message}`);
    }

    return result;
}

function formatSalesRows(salesEntries) {
    if (!salesEntries.length) {
        return "<p>No sales were recorded in this report window.</p>";
    }

    const rows = salesEntries
        .map((entry) => `
            <tr>
                <td style="padding:8px;border-bottom:1px solid #e7e7e7;">${entry.name}</td>
                <td style="padding:8px;border-bottom:1px solid #e7e7e7;text-align:right;">${Number(entry.quantitySold || 0)}</td>
                <td style="padding:8px;border-bottom:1px solid #e7e7e7;text-align:right;">${currency.format(Number(entry.revenue || 0))}</td>
            </tr>
        `)
        .join("");

    return `
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <thead>
                <tr>
                    <th style="text-align:left;padding:8px;border-bottom:2px solid #d5d5d5;">Item</th>
                    <th style="text-align:right;padding:8px;border-bottom:2px solid #d5d5d5;">Qty Sold</th>
                    <th style="text-align:right;padding:8px;border-bottom:2px solid #d5d5d5;">Net Revenue</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    `;
}

export async function sendNightlyConsignmentReportEmail(consignor, report) {
    const resend = getResendClient();
    const subjectDate = dateOnly.format(new Date(report.windowStart));
    const portalUrl = new URL(`/consign/${consignor.slug}`, process.env.NEXT_PUBLIC_BASE_URL || SITE_URL);

    const result = await resend.emails.send({
        from: "The Wolf Den <portal@wolfdengamingmn.com>",
        to: consignor.email,
        subject: `Nightly Consignment Report - ${subjectDate}`,
        html: `
            <h1>Hi ${consignor.display_name},</h1>
            <p>Here is your nightly consignment summary for <strong>${subjectDate}</strong>.</p>
            <h2 style="margin-top:24px;">Sold Today</h2>
            ${formatSalesRows(report.dailySales)}
            <p style="margin-top:16px;"><strong>Today net sales:</strong> ${currency.format(Number(report.todayNetRevenue || 0))}</p>
            <p style="margin-top:16px;">
                <a
                    href="${portalUrl.toString()}"
                    style="display:inline-block;padding:12px 20px;background:#D4AF37;color:#0E0E0E;text-decoration:none;border-radius:6px;font-weight:700;"
                >
                    Open Consignment Portal
                </a>
            </p>
            <hr style="margin:24px 0;" />
            <h2>Current Owed</h2>
            <p><strong>${currency.format(Number(report.currentOwed || 0))}</strong> (estimated payout ${currency.format(Number(report.estimatedPayoutGross || 0))} − paid ${currency.format(Number(report.totalPaid || 0))})</p>
            <p style="color:#5a5a5a;">This amount is an estimate from Square sales data and your configured payout rate.</p>
            <hr style="margin:24px 0;" />
            <p><small>You are receiving this because nightly reports are enabled for your portal profile.</small></p>
        `,
    });

    if (result.error) {
        throw new Error(`Failed to send nightly report email: ${result.error.message}`);
    }

    return result;
}
