import Link from "next/link";

import { listUpcomingEvents } from "@/lib/marketplace/events.js";

export const metadata = {
    title: "Events | Wolf Den Marketplace",
    description:
        "Card shows, Friday Night Magic, and trade nights where local vendors are bringing inventory. See who's attending and browse their stock before you go.",
    alternates: { canonical: "/marketplace/events" },
};

export const dynamic = "force-dynamic";

export default async function EventsPage() {
    const events = await listUpcomingEvents();

    return (
        <div className="stack reveal">
            <section className="card hero-accent">
                <h1>Meet vendors at events</h1>
                <p>
                    Card shows, game nights, and trade nights where local vendors are bringing inventory. See who&apos;s
                    coming and browse their stock before you go — no shipping, just meet up.
                </p>
                <p className="mkt-hero-links">
                    <Link href="/marketplace" className="pill">
                        Back to search
                    </Link>
                </p>
            </section>

            <section className="card">
                <h2>Upcoming</h2>
                {events.length === 0 ? (
                    <p className="muted">No upcoming events yet — check back soon.</p>
                ) : (
                    <ul className="mkt-admin-list">
                        {events.map((ev) => (
                            <li key={ev.id} className="mkt-admin-row">
                                <div className="mkt-admin-info">
                                    <strong>{ev.name}</strong>
                                    <span className="mkt-offer-meta">
                                        {ev.eventDate || "date TBD"}
                                        {ev.locationLabel ? ` · ${ev.locationLabel}` : ""}
                                        {` · ${ev.vendorCount} vendor${ev.vendorCount === 1 ? "" : "s"} attending`}
                                    </span>
                                </div>
                                <Link href={`/marketplace/events/${ev.id}`} className="pill">
                                    See who&apos;s coming →
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
