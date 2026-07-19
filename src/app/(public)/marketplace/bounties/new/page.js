import Link from "next/link";

import BountyComposer from "@/components/BountyComposer";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Post a bounty | The Wolf Den",
    alternates: { canonical: "/marketplace/bounties/new" },
};

export default async function NewBountyPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) {
        return (
            <div className="stack reveal">
                <section className="card">
                    <h1 style={{ marginTop: 0 }}>Post a bounty</h1>
                    <p className="muted" style={{ marginTop: 0 }}>Sign in to post a bounty and put gold on it.</p>
                    <Link href="/marketplace/login" className="btn-gold" style={{ display: "inline-block", marginTop: 8 }}>Sign in →</Link>
                </section>
            </div>
        );
    }
    return (
        <div className="stack reveal">
            <BountyComposer gold={buyer.gold ?? 0} />
        </div>
    );
}
