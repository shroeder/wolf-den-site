import "server-only";

import { Resend } from "resend";

function getResendClient() {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
        throw new Error("Missing RESEND_API_KEY environment variable.");
    }

    return new Resend(apiKey);
}

export async function sendSetupEmail(consignor, setupToken) {
    const resend = getResendClient();
    const setupUrl = new URL("/consign/setup", process.env.NEXT_PUBLIC_BASE_URL || "https://wolfdengamingmn.com");

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
