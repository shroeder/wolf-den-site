import Link from "next/link";

import JustInClient from "@/components/JustInClient";
import { listRecentChanges } from "@/lib/inventory-feed/feed";

export const metadata = {
    title: "Just In — New Arrivals at The Wolf Den",
    description:
        "The running feed of cards and sealed product freshly scanned into The Wolf Den in Montgomery, MN. See new arrivals and restocks the moment they hit the shelves.",
    alternates: {
        canonical: "/just-in",
    },
};

// Always render against the current arrivals feed rather than a build-time snapshot.
export const dynamic = "force-dynamic";

const FEED_WINDOW_HOURS = 24 * 7;

export default async function JustInPage() {
    const items = await listRecentChanges({ windowHours: FEED_WINDOW_HOURS }).catch(() => []);

    return (
        <div className="stack reveal">
            <section className="card just-in-header">
                <p className="eyebrow">🔥 Just In</p>
                <h1>Fresh Arrivals</h1>
                <p className="lead">
                    Everything below was scanned onto the shelves at The Wolf Den in the last week — new cards, sealed
                    product, and restocks. Get in early before someone else grabs it.
                </p>
                <div className="cta-row">
                    <Link className="button primary" href="/shop">
                        Shop Everything
                    </Link>
                    <Link className="button" href="/alerts">
                        Get New-Arrival Alerts
                    </Link>
                </div>
            </section>

            {items.length > 0 ? (
                <JustInClient items={items} />
            ) : (
                <section className="card">
                    <h2>Nothing new in the last week</h2>
                    <p>
                        Fresh arrivals show up here the moment they are scanned in. Check back soon, or{" "}
                        <Link className="text-link" href="/alerts">
                            sign up for new-arrival alerts
                        </Link>{" "}
                        so you hear first.
                    </p>
                </section>
            )}
        </div>
    );
}
