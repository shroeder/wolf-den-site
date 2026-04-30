import { events } from "@/lib/events";

export const metadata = { title: "Events | Wolf Den Cards" };

export default function EventsPage() {
    return (
        <div className="stack reveal">
            <section className="card">
                <h1>Upcoming Events</h1>
                <p>
                    Join Discord for event updates, waitlist announcements, and last-minute seat changes.
                </p>
            </section>

            <section className="grid three-col">
                {events.map((event) => (
                    <article key={event.slug} className="card lift">
                        <h2>{event.title}</h2>
                        <p className="muted">{event.date}</p>
                        <p>{event.description}</p>
                        <p>
                            <strong>Format:</strong> {event.format}
                        </p>
                        <p>
                            <strong>Entry:</strong> {event.entryFee}
                        </p>
                        <p>
                            <strong>Beginner Friendly:</strong> {event.beginnerFriendly ? "Yes" : "No"}
                        </p>
                    </article>
                ))}
            </section>

            {/* <section className="card">
                <h2>Policies</h2>
                <ul>
                    <li>Event cancellation and refund terms are listed on each event page.</li>
                    <li>Recurring event templates and QR check-in can be added in phase 2.</li>
                    <li>Registration can start as Discord RSVP and move to Stripe/Shopify checkout later.</li>
                </ul>
            </section> */}
        </div>
    );
}
