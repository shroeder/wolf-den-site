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

function buildSiteUrl(pathname, params = {}) {
    const url = new URL(pathname, process.env.NEXT_PUBLIC_BASE_URL || SITE_URL);

    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
            url.searchParams.set(key, String(value));
        }
    });

    return url.toString();
}

function escapeHtml(value) {
    return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

export async function sendShopEmailVerificationEmail({ to, token }) {
    const resend = getResendClient();
    const safeEmail = escapeHtml(to);
    const verifyUrl = buildSiteUrl("/shop/account/verify-email", { token });

    const result = await resend.emails.send({
        from: "The Wolf Den <portal@wolfdengamingmn.com>",
        to,
        subject: "Verify your Wolf Den shop account",
        html: `
            <div style="background:#0e0e0e;padding:24px;font-family:Segoe UI,Arial,sans-serif;color:#f2f2f2;">
                <div style="max-width:620px;margin:0 auto;background:#161616;border:1px solid rgba(255,255,255,0.12);border-radius:14px;overflow:hidden;">
                    <div style="padding:20px 20px 16px;background:linear-gradient(135deg,rgba(212,175,55,0.22),rgba(212,175,55,0.06));border-bottom:1px solid rgba(255,255,255,0.1);">
                        <p style="margin:0 0 6px;color:#d4af37;font-weight:700;letter-spacing:.05em;text-transform:uppercase;font-size:12px;">The Wolf Den</p>
                        <h1 style="margin:0;font-size:22px;line-height:1.3;color:#f8f8f8;">Verify Your Email</h1>
                    </div>
                    <div style="padding:20px;">
                        <p style="margin:0 0 14px;">We received a new shop account signup for <strong>${safeEmail}</strong>.</p>
                        <p style="margin:0 0 16px;">Click the button below to verify your email and unlock account sign-in.</p>
                        <p style="margin:16px 0 0;">
                            <a href="${verifyUrl}" style="display:inline-block;padding:11px 18px;background:#d4af37;color:#0e0e0e;text-decoration:none;border-radius:8px;font-weight:700;">Verify Email</a>
                        </p>
                        <p style="margin:20px 0 0;color:#b8b8b8;font-size:13px;">If you did not create this account, you can ignore this message.</p>
                    </div>
                </div>
            </div>
        `,
    });

    if (result.error) {
        throw new Error(`Failed to send verification email: ${result.error.message}`);
    }

    return result;
}

export async function sendShopPasswordResetEmail({ to, token }) {
    const resend = getResendClient();
    const resetUrl = buildSiteUrl("/shop/account/reset-password", { token });

    const result = await resend.emails.send({
        from: "The Wolf Den <portal@wolfdengamingmn.com>",
        to,
        subject: "Reset your Wolf Den shop password",
        html: `
            <div style="background:#0e0e0e;padding:24px;font-family:Segoe UI,Arial,sans-serif;color:#f2f2f2;">
                <div style="max-width:620px;margin:0 auto;background:#161616;border:1px solid rgba(255,255,255,0.12);border-radius:14px;overflow:hidden;">
                    <div style="padding:20px 20px 16px;background:linear-gradient(135deg,rgba(212,175,55,0.22),rgba(212,175,55,0.06));border-bottom:1px solid rgba(255,255,255,0.1);">
                        <p style="margin:0 0 6px;color:#d4af37;font-weight:700;letter-spacing:.05em;text-transform:uppercase;font-size:12px;">The Wolf Den</p>
                        <h1 style="margin:0;font-size:22px;line-height:1.3;color:#f8f8f8;">Reset Password</h1>
                    </div>
                    <div style="padding:20px;">
                        <p style="margin:0 0 14px;">A password reset was requested for your shop account.</p>
                        <p style="margin:0 0 16px;">Click below to set a new password. This link expires in 60 minutes.</p>
                        <p style="margin:16px 0 0;">
                            <a href="${resetUrl}" style="display:inline-block;padding:11px 18px;background:#d4af37;color:#0e0e0e;text-decoration:none;border-radius:8px;font-weight:700;">Reset Password</a>
                        </p>
                        <p style="margin:20px 0 0;color:#b8b8b8;font-size:13px;">If you did not request this, no changes were made.</p>
                    </div>
                </div>
            </div>
        `,
    });

    if (result.error) {
        throw new Error(`Failed to send password reset email: ${result.error.message}`);
    }

    return result;
}
