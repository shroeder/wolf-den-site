import Link from "next/link";

import EnableNotificationsClient from "@/components/EnableNotificationsClient";
import NotifyPrefsClient from "@/components/NotifyPrefsClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
    title: "Notifications | The Wolf Den Game",
    robots: { index: false },
};

// ── THE ONE PLACE NOTIFICATIONS LIVE ─────────────────────────────────────────────────────────────────────────
// Started as the single-purpose opt-in landing: the recap email's "turn on instant alerts" CTA points HERE
// rather than at the profile, where notifications sat inside a collapsed section on a long page and the one
// conversion we most want dead-ended.
//
// Luke: "have it live in a place easier to find." So it is now the whole thing rather than the front door to
// it — turn them on, then say how much you want, in that order, on a page that is one tap from the menu. The
// profile keeps its own section (the recap's opt-OUT link still points there and a link that goes nowhere is
// worse than a long page), and both mount the SAME component, so there is one settings screen with two doors
// rather than two screens that will disagree by Christmas.
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
            {/* ── AND THEN HOW MUCH ────────────────────────────────────────────────────────────────────────
                Below the button, deliberately: the button is the thing somebody arrived to press, and a
                settings matrix above it would bury the one action this page was built for. Somebody who has
                already turned push on scrolls past a button that says so and lands here. */}
            <section className="card" id="notify-settings">
                <h2 style={{ margin: "0 0 4px" }}>How much should we send you?</h2>
                <p className="muted" style={{ margin: "0 0 12px", fontSize: "0.85rem" }}>
                    Pick one. You can always open the list and change a single thing instead.
                </p>
                <NotifyPrefsClient />
            </section>
        </div>
    );
}
