import Link from "next/link";
import { notFound } from "next/navigation";
import { events, getEventBySlug } from "@/lib/events";

export function generateStaticParams() {
    return events.map((event) => ({ slug: event.slug }));
}

export async function generateMetadata({ params }) {
    const { slug } = await params;
    const event = getEventBySlug(slug);
    return {
        title: event ? event.title : "Event",
        description: event
            ? `${event.title} at The Wolf Den in Montgomery, MN. Join us for Pokemon and Magic events, tournaments, and local play.`
            : "Event details at The Wolf Den in Montgomery, MN.",
        alternates: {
            canonical: event ? `/events/${event.slug}` : "/events",
        },
    };
}

export default async function EventDetailPage({ params }) {
    const { slug } = await params;
    const event = getEventBySlug(slug);

    if (!event) {
        notFound();
    }

    const hasValidStartDate = !Number.isNaN(Date.parse(event.date));
    const eventSchema = {
        "@context": "https://schema.org",
        "@type": "Event",
        name: event.title,
        description: event.description,
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        eventStatus: "https://schema.org/EventScheduled",
        url: `https://wolfdengamingmn.com/events/${event.slug}`,
        location: {
            "@type": "Place",
            name: "The Wolf Den",
            address: {
                "@type": "PostalAddress",
                streetAddress: "300 1st St S",
                addressLocality: "Montgomery",
                addressRegion: "MN",
                postalCode: "56069",
                addressCountry: "US",
            },
        },
        organizer: {
            "@type": "Organization",
            name: "The Wolf Den",
            url: "https://wolfdengamingmn.com",
        },
        offers: {
            "@type": "Offer",
            price: event.entryFee === "Free" ? "0" : undefined,
            priceCurrency: "USD",
            availability: "https://schema.org/InStock",
            url: "https://discord.gg/Pad8U2KVsD",
        },
    };

    if (hasValidStartDate) {
        eventSchema.startDate = new Date(event.date).toISOString();
    }

    if (event.entryFee !== "Free") {
        delete eventSchema.offers.price;
    }

    return (
        <div className="stack reveal">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(eventSchema) }}
            />
            <section className="card">
                <h1>{event.title}</h1>
                <p>
                    {event.date} at {event.time}
                </p>
                <p>{event.description}</p>
            </section>

            <section className="grid two-col">
                <article className="card">
                    <h2>Registration</h2>
                    <p>
                        <strong>RSVP:</strong> {event.rsvp}
                    </p>
                    <p>
                        <strong>Entry Fee:</strong> {event.entryFee}
                    </p>
                    <p>
                        <strong>Capacity:</strong> {event.capacity}
                    </p>
                    <p>
                        <strong>Seats Remaining:</strong> {event.seatsRemaining}
                    </p>
                </article>
                <article className="card">
                    <h2>Format & Rules</h2>
                    <p>
                        <strong>Format:</strong> {event.format}
                    </p>
                    <p>{event.rules}</p>
                    <p>
                        <strong>Beginner Friendly:</strong> {event.beginnerFriendly ? "Yes" : "No"}
                    </p>
                </article>
            </section>

            <section className="card">
                <h2>Prize Support & Policy</h2>
                <p>
                    <strong>Prize Support:</strong> {event.prizeSupport}
                </p>
                <p>
                    <strong>Cancellation/Refund:</strong> {event.refundPolicy}
                </p>
                <a className="button primary" href="https://discord.gg/Pad8U2KVsD" target="_blank" rel="noreferrer">
                    Join Discord for Event Updates
                </a>
            </section>

            <Link className="text-link" href="/events">
                Back to Events
            </Link>
        </div>
    );
}
