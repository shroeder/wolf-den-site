import Link from "next/link";

import MarketplaceProfileClient from "@/components/MarketplaceProfileClient";

export const metadata = {
    title: "Your Profile | Wolf Den Marketplace",
    robots: { index: false, follow: false },
};

export default function ProfileSettingsPage() {
    return (
        <div className="stack reveal">
            <section className="card">
                <MarketplaceProfileClient />
            </section>
            <section className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div>
                    <div style={{ fontWeight: 600 }}>Loyalty card</div>
                    <div className="muted" style={{ fontSize: "0.9rem" }}>Show this at the register to earn XP on in-store purchases.</div>
                </div>
                <Link className="btn" href="/marketplace/card">
                    Open card
                </Link>
            </section>
        </div>
    );
}
