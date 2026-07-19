import Link from "next/link";

import BountyComposer from "@/components/BountyComposer";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { db } from "@/lib/db";

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
    // getAuthenticatedBuyer() doesn't carry gold — read the live balance so the composer's check is correct.
    const row = await db.queryOne(`SELECT COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [buyer.id]).catch(() => null);
    return (
        <div className="stack reveal">
            <BountyComposer gold={row?.gold ?? 0} />
        </div>
    );
}
