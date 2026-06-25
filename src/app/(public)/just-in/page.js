import Link from "next/link";

import { listRecentArrivals } from "@/lib/product-alerts/feed";

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

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const formatPrice = (price) => (typeof price === "number" ? currency.format(price) : null);

const relativeTime = (iso) => {
    const then = Date.parse(iso || "");

    if (Number.isNaN(then)) {
        return null;
    }

    const diffMs = Date.now() - then;
    const minutes = Math.round(diffMs / 60000);

    if (minutes < 1) {
        return "Just now";
    }

    if (minutes < 60) {
        return `${minutes} min ago`;
    }

    const hours = Math.round(minutes / 60);

    if (hours < 24) {
        return `${hours} hr${hours === 1 ? "" : "s"} ago`;
    }

    const days = Math.round(hours / 24);

    return `${days} day${days === 1 ? "" : "s"} ago`;
};

export default async function JustInPage() {
    const items = await listRecentArrivals({ windowHours: FEED_WINDOW_HOURS }).catch(() => []);

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
                <section className="card">
                    <div className="shop-grid just-in-grid" aria-label="Recently scanned-in items">
                        {items.map((item) => {
                            const isRestock = item.kind === "restock";

                            return (
                                <article key={item.id} className="shop-tile just-in-tile">
                                    <div className="shop-tile-image-wrap">
                                        <span
                                            className={`just-in-badge${isRestock ? " just-in-badge-restock" : ""}`}
                                        >
                                            {isRestock ? "Back in stock" : "New"}
                                        </span>
                                        {item.imageUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={item.imageUrl}
                                                alt={item.name}
                                                className="shop-tile-image"
                                                loading="lazy"
                                                decoding="async"
                                            />
                                        ) : (
                                            <div className="shop-tile-image-placeholder" aria-hidden="true">
                                                No image
                                            </div>
                                        )}
                                    </div>

                                    <div className="shop-tile-body">
                                        <h2 className="shop-tile-name">{item.name}</h2>
                                        {item.categoryNames.length > 0 && (
                                            <p className="shop-item-category">{item.categoryNames.join(" · ")}</p>
                                        )}
                                        <div className="shop-tile-meta-row">
                                            <p className="shop-tile-price">
                                                {formatPrice(item.price) ?? <span className="muted">See in store</span>}
                                            </p>
                                            {relativeTime(item.createdAt) && (
                                                <span className="just-in-time">{relativeTime(item.createdAt)}</span>
                                            )}
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </section>
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
