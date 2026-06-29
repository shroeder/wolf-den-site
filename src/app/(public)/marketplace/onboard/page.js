import Link from "next/link";

import MarketplaceOnboardClient from "@/components/MarketplaceOnboardClient";
import { getVendorInviteState } from "@/lib/marketplace/vendors.js";

export const metadata = {
    title: "Set up your vendor account | Wolf Den Marketplace",
    robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function Notice({ children }) {
    return (
        <div className="stack reveal">
            <section className="card hero-accent">
                <h1>Vendor onboarding</h1>
                {children}
                <p>
                    <Link href="/marketplace" className="pill">
                        Back to the marketplace
                    </Link>
                </p>
            </section>
        </div>
    );
}

export default async function MarketplaceOnboardPage({ searchParams }) {
    const { token } = await searchParams;

    if (!token) {
        return (
            <Notice>
                <p className="muted">This onboarding link is missing its token. Use the link from your approval email.</p>
            </Notice>
        );
    }

    const state = await getVendorInviteState(token);

    if (!state) {
        return (
            <Notice>
                <p className="muted">We couldn&apos;t find that invite. It may have already been used.</p>
            </Notice>
        );
    }

    if (state.expired) {
        return (
            <Notice>
                <p className="muted">This invite has expired. Ask The Wolf Den to send you a fresh one.</p>
            </Notice>
        );
    }

    if (state.alreadyAccepted) {
        return (
            <Notice>
                <p className="muted">
                    This account is already set up. <Link href="/marketplace/portal">Sign in to your portal</Link>.
                </p>
            </Notice>
        );
    }

    return <MarketplaceOnboardClient token={token} vendor={state.vendor} />;
}
