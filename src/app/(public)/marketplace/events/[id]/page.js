import Link from "next/link";
import { notFound } from "next/navigation";

import { getEventWithVendors, listEventInventory } from "@/lib/marketplace/events.js";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
    const { id } = await params;
    const event = await getEventWithVendors(id).catch(() => null);
    return {
        title: event ? `${event.name} | Wolf Den Marketplace` : "Event | Wolf Den Marketplace",
        robots: { index: false, follow: true },
    };
}

function formatPrice(v) {
    return v != null ? `$${Number(v).toFixed(2)}` : "";
}

export default async function EventPage({ params }) {
    const { id } = await params;
    const [event, inventory] = await Promise.all([
        getEventWithVendors(id).catch(() => null),
        listEventInventory(id, {}).catch(() => []),
    ]);
    if (!event) {
        notFound();
    }

    return (
        <div className="stack reveal">
            <section className="card hero-accent">
                <p className="mkt-breadcrumb">
                    <Link href="/marketplace/events">← All events</Link>
                </p>
                <h1>{event.name}</h1>
                <p className="muted">
                    {event.eventDate || "date TBD"}
                    {event.locationLabel ? ` · ${event.locationLabel}` : ""}
                </p>
            </section>

            <section className="card">
                <h2>Vendors attending ({event.vendors.length})</h2>
                {event.vendors.length === 0 ? (
                    <p className="muted">No vendors have marked attendance yet.</p>
                ) : (
                    <ul className="mkt-vendor-grid">
                        {event.vendors.map((v) => (
                            <li key={v.id}>
                                <Link href={`/marketplace/vendor/${v.id}`} className="mkt-vendor-card">
                                    <div className="mkt-vendor-card-top">
                                        <span className="mkt-vendor-name">
                                            {v.logoUrl ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={v.logoUrl} alt="" className="mkt-vendor-logo mkt-vendor-logo-sm" />
                                            ) : null}
                                            ✓ {v.displayName}
                                        </span>
                                        <span className="mkt-offer-meta">
                                            {v.locationLabel || ""}
                                            {` · ${v.listingCount} listing${v.listingCount === 1 ? "" : "s"}`}
                                        </span>
                                    </div>
                                    {v.specialties.length > 0 ? (
                                        <div className="mkt-specialty-tags">
                                            {v.specialties.slice(0, 3).map((s) => (
                                                <span key={s} className="mkt-specialty-tag">
                                                    {s}
                                                </span>
                                            ))}
                                        </div>
                                    ) : null}
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {inventory.length > 0 ? (
                <section className="card">
                    <h2>Inventory coming to this event</h2>
                    <ul className="mkt-admin-list">
                        {inventory.map((l) => (
                            <li key={l.id} className="mkt-admin-row">
                                <div className="mkt-admin-info">
                                    <strong>
                                        {l.catalogProductId ? (
                                            <Link href={`/marketplace/product/${l.catalogProductId}`}>{l.title}</Link>
                                        ) : (
                                            l.title
                                        )}
                                    </strong>
                                    <span className="mkt-offer-meta">
                                        {l.setName ? `${l.setName} · ` : ""}
                                        {formatPrice(l.price)} · {l.vendor.displayName}
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}
        </div>
    );
}
