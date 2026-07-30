import Link from "next/link";

import EnableNotificationsClient from "@/components/EnableNotificationsClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
    title: "Notifications | The Wolf Den Game",
    robots: { index: false },
};

// Single-purpose opt-in landing. The recap email's "turn on instant alerts" CTA points HERE rather than at the
// profile, where notifications live inside a collapsed section on a long page — that dead-end was quietly
// wasting the one conversion we most want (an email reader becoming a push subscriber, after which they stop
// needing the recap at all).
export default async function NotificationsPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);

    if (!buyer) {
        return (
            <div className="stack reveal">
                <section className="card" style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 40 }} aria-hidden="true">🔔</div>
                    <h1 style={{ margin: "6px 0 4px" }}>Turn on notifications</h1>
                    <p className="muted" style={{ margin: "0 0 14px" }}>
                        Sign in first — notifications are tied to your member account, so we know what&apos;s
                        actually yours to hear about.
                    </p>
                    <Link href="/marketplace/signin" className="btn-gold">Sign in</Link>
                </section>
            </div>
        );
    }

    return (
        <div className="stack reveal">
            <section className="card">
                <EnableNotificationsClient />
            </section>
        </div>
    );
}
