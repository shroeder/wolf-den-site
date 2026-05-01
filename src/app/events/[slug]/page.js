import Link from "next/link";
import { notFound } from "next/navigation";
import { events, getEventBySlug } from "@/lib/events";

export function generateStaticParams() {
    return events.map((event) => ({ slug: event.slug }));
}

export function generateMetadata({ params }) {
    const event = getEventBySlug(params.slug);
    return {
        title: event ? event.title : "Event",
        description: event
            ? `${event.title} at The Wolf Den in Montgomery, MN. Join us for trading card events, tournaments, and local play.`
            : "Event details at The Wolf Den in Montgomery, MN.",
    };
}

export default function EventDetailPage({ params }) {
    const event = getEventBySlug(params.slug);

    if (!event) {
        notFound();
    }

    return (
        <div className="stack reveal">
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
