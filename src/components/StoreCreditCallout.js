import Link from "next/link";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";

// Store-credit hook for signed-in members on high-traffic pages (shop). Complements RewardsCallout, which only
// shows to signed-OUT visitors — so a member sees "top up store credit" while a visitor sees "join free".
export default async function StoreCreditCallout() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) return null;

    return (
        <section className="card storecredit-callout">
            <span className="storecredit-callout-coin" aria-hidden="true">🪙</span>
            <div className="storecredit-callout-text">
                <div className="storecredit-callout-title">Store credit that spends everywhere</div>
                <div className="storecredit-callout-sub">Top up once — use it <b>here, in-store, or in the game</b>, and pocket <b>100 coins per $1</b> on top.</div>
            </div>
            <Link href="/marketplace/credit" className="btn-gold storecredit-callout-cta">Get credit →</Link>
        </section>
    );
}
