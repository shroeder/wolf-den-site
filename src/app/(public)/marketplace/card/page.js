import { headers } from "next/headers";
import QRCode from "qrcode";

import MarketplaceLoginClient from "@/components/MarketplaceLoginClient";
import UserLevel from "@/components/UserLevel";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { ensureSquareCustomerForBuyer } from "@/lib/marketplace/loyalty.js";
import { getProfile } from "@/lib/marketplace/profile.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Loyalty Card | Wolf Den Marketplace",
    robots: { index: false, follow: false },
};

async function baseUrl() {
    const h = await headers();
    const host = h.get("x-forwarded-host") || h.get("host") || "www.wolfdengamingmn.com";
    const proto = h.get("x-forwarded-proto") || "https";
    return `${proto}://${host}`;
}

export default async function LoyaltyCardPage() {
    const buyer = await getAuthenticatedBuyer();
    if (!buyer) return <MarketplaceLoginClient redirectTo="/marketplace/card" />;

    // Make sure the account is tied to a Square customer so a register sale can credit XP. Best-effort.
    await ensureSquareCustomerForBuyer(buyer.id);

    const profile = await getProfile(buyer.id);
    const name = profile?.displayLabel || buyer.displayName || "Member";
    const alias = profile?.alias || null;
    const email = profile?.email || null;
    const avatarUrl = profile?.avatarUrl || null;
    const level = profile?.level || { level: 1, progress: 0, xpToNext: 0 };

    // The QR points at the member's public profile (a real, shareable link). At the register the cashier
    // attaches the member to the sale by searching their name/email in Square; the completed sale then
    // credits XP automatically via the Square webhook.
    const base = await baseUrl();
    const qrTarget = alias ? `${base}/marketplace/u/${alias}` : `${base}/marketplace/card`;
    const qrDataUrl = await QRCode.toDataURL(qrTarget, {
        margin: 1,
        width: 360,
        errorCorrectionLevel: "M",
        color: { dark: "#0b0b12", light: "#ffffff" },
    });

    const initials = name
        .split(/\s+/)
        .map((p) => p[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase();

    return (
        <div className="stack reveal" style={{ maxWidth: 460, margin: "0 auto" }}>
            <section className="card loyalty-card">
                <div className="loyalty-card-head">
                    <div className="loyalty-avatar" aria-hidden={avatarUrl ? undefined : "true"}>
                        {avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={avatarUrl} alt="" />
                        ) : (
                            <span>{initials || "🐺"}</span>
                        )}
                    </div>
                    <div className="loyalty-id">
                        <div className="loyalty-name">{name}</div>
                        {alias ? <div className="loyalty-alias">@{alias}</div> : null}
                        <div className="loyalty-brand">Wolf Den Loyalty</div>
                    </div>
                </div>

                <UserLevel level={level} />

                <div className="loyalty-qr">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrDataUrl} alt="Your loyalty QR code" width={360} height={360} />
                </div>

                <p className="loyalty-hint">
                    Show this at the register. We&apos;ll add your account to the sale{email ? <> (look up <strong>{email}</strong>)</> : null} so
                    your purchase earns XP toward your next level.
                </p>
            </section>
        </div>
    );
}
