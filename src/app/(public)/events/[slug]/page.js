import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { events, getEventBySlug } from "@/lib/events";
import { SITE_URL } from "@/lib/site";
import EventSignupClient from "@/components/EventSignupClient";

export function generateStaticParams() {
    return events.map((event) => ({ slug: event.slug }));
}

export async function generateMetadata({ params }) {
    const { slug } = await params;
    const event = getEventBySlug(slug);

    if (!event) {
        return {
            title: "Event",
            description: "Event details at The Wolf Den in Montgomery, MN.",
            alternates: {
                canonical: "/events",
            },
        };
    }

    const title = event.seoTitle || event.title;
    const description =
        event.metaDescription ||
        `${event.title} at The Wolf Den in Montgomery, MN. Join us for casual community play, trading, and local hobby events.`;

    return {
        title,
        description,
        keywords: event.keywords,
        openGraph: {
            title,
            description,
            url: `/events/${event.slug}`,
            type: "website",
        },
        alternates: {
            canonical: `/events/${event.slug}`,
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
        description: event.metaDescription || event.description,
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        eventStatus: "https://schema.org/EventScheduled",
        url: `${SITE_URL}/events/${event.slug}`,
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
            url: SITE_URL,
        },
        offers: {
            "@type": "Offer",
            price: event.entryFee === "Free" ? "0" : event.priceUsd,
            priceCurrency: "USD",
            availability: "https://schema.org/InStock",
            url: `${SITE_URL}/events/${event.slug}`,
        },
    };

    if (hasValidStartDate) {
        eventSchema.startDate = new Date(event.date).toISOString();
    }

    if (event.schedule) {
        eventSchema.eventSchedule = {
            "@type": "Schedule",
            repeatFrequency: "P1W",
            byDay: event.schedule.byDay,
            startTime: event.schedule.startTime,
        };

        if (event.schedule.endTime) {
            eventSchema.eventSchedule.endTime = event.schedule.endTime;
        }
    }

    if (!eventSchema.offers.price) {
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
                    {event.day} at {event.time}
                </p>
                <p>{event.description}</p>
                {event.image && (
                    <Image
                        src={event.image.src}
                        alt={event.image.alt}
                        width={event.image.width}
                        height={event.image.height}
                        sizes="(max-width: 900px) 100vw, 70vw"
                        className="content-photo"
                    />
                )}
            </section>

            <section className="grid two-col">
                <article className="card">
                    <h2>Event Details</h2>
                    <p>
                        <strong>Day:</strong> {event.day}
                    </p>
                    <p>
                        <strong>Time:</strong> {event.time}
                    </p>
                    <p>
                        <strong>Location:</strong> The Wolf Den, Montgomery, Minnesota
                    </p>
                    <p>
                        <strong>Entry Fee:</strong> {event.entryFee}
                    </p>
                    {event.audience && (
                        <p>
                            <strong>Best For:</strong> {event.audience}
                        </p>
                    )}
                    {typeof event.familyFriendly === "boolean" && (
                        <p>
                            <strong>Family Friendly:</strong> {event.familyFriendly ? "Yes" : "No"}
                        </p>
                    )}
                    {event.capacity && (
                        <p>
                            <strong>Capacity:</strong> {event.capacity}
                        </p>
                    )}
                </article>
                <article className="card">
                    <h2>What to Expect</h2>
                    <p>
                        <strong>Activities:</strong> {event.format}
                    </p>
                    <p>{event.rules}</p>
                    <p>
                        <strong>Beginner Friendly:</strong> {event.beginnerFriendly ? "Yes" : "No"}
                    </p>
                </article>
            </section>

            <EventSignupClient
                eventSlug={event.slug}
                eventTitle={event.title}
                signupLimit={event.signupLimit}
            />

            {!event.signupLimit && event.ctaLabel && event.ctaHref && (
                <section className="card">
                    <h2>Plan Your Visit</h2>
                    <p>Bring your cards, a trade binder, or just stop in and browse bulk during store hours.</p>
                    <a
                        className="button primary"
                        href={event.ctaHref}
                        target={event.ctaExternal ? "_blank" : undefined}
                        rel={event.ctaExternal ? "noreferrer" : undefined}
                    >
                        {event.ctaLabel}
                    </a>
                </section>
            )}

            {event.details && (
                <section className="card">
                    <h2>What to Expect</h2>
                    {event.details.whatToExpect && (
                        <div>
                            <ul>
                                {event.details.whatToExpect.map((item, idx) => (
                                    <li key={idx}>{item}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {event.details.whoShould && (
                        <p>
                            <strong>Who Should Come:</strong> {event.details.whoShould}
                        </p>
                    )}
                    {event.details.note && (
                        <p className="muted">
                            <em>{event.details.note}</em>
                        </p>
                    )}
                </section>
            )}

            <section className="card">
                <h2>Future Plans</h2>
                <p>
                    {event.futurePlans}
                </p>
                <p>
                    <strong>Updates:</strong> {event.rsvp}
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

