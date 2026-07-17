import { events } from "@/lib/events";
import { FNM_EVENTLINK_URL } from "@/lib/marketplace/games.js";
import Image from "next/image";

export const metadata = {
    title: "Weekly Card Events in Montgomery, MN",
    description:
        "Weekly events at The Wolf Den in Montgomery, MN, including Thursday Kids Card Club, Friday Commander Night, and Saturday Pokemon community time for southern Minnesota players and families.",
    alternates: {
        canonical: "/events",
    },
};

export default function EventsPage() {
    const featured = events.find((event) => event.oneShot);

    return (
        <div className="stack reveal">
            <section className="card hero-accent">
                <h1>Events at The Wolf Den</h1>
                <p>
                    The Wolf Den is building a local trading card game community in Montgomery, Minnesota.
                </p>
                <p>
                    Our weekly schedule is built around casual, community-focused events that help players, collectors, kids, and families meet each other, trade cards, learn games, and grow the local scene.
                </p>
            </section>

            <section className="card fnm-cta">
                <div className="fnm-cta-body">
                    <span className="fnm-cta-eyebrow">🔵 Friday Night Magic</span>
                    <h2 style={{ margin: "2px 0 4px" }}>Register your seat for Friday</h2>
                    <p className="muted" style={{ margin: "0 0 12px" }}>
                        Playing Magic this Friday? Sign up on Wizards EventLink so we can plan the night — and every
                        registration helps The Wolf Den earn better product allocations from Wizards. 🐺
                    </p>
                    <a className="button primary" href={FNM_EVENTLINK_URL} target="_blank" rel="noreferrer">
                        Register on EventLink →
                    </a>
                </div>
            </section>

            {featured && (
                <section className="card hero-accent">
                    <p className="muted">Special Event</p>
                    <h2>{featured.title}</h2>
                    <p className="muted">
                        {featured.day} • {featured.time} • {featured.entryFee}
                    </p>
                    {featured.image && (
                        <Image
                            src={featured.image.src}
                            alt={featured.image.alt}
                            width={featured.image.width}
                            height={featured.image.height}
                            sizes="(max-width: 900px) 100vw, 70vw"
                            className="content-photo"
                            priority
                        />
                    )}
                    <p>{featured.description}</p>
                    <p>
                        <strong>Seats are limited to {featured.signupLimit}.</strong> Reserve your spot online — pay $5 in person when you arrive. Character creation starts promptly at 3:00 PM.
                    </p>
                    <a className="button primary" href={`/events/${featured.slug}`}>
                        Reserve Your Seat
                    </a>
                </section>
            )}

            <section className="card">
                <h2>Weekly Event Schedule</h2>
                <p>
                    Thursday Kids Card Club runs from 4:00 PM to 7:00 PM, Friday Commander community play runs from 4:00 PM to 7:00 PM,
                    and Saturday Pokemon community play runs during store hours from 12:00 PM to 6:00 PM.
                </p>
            </section>

            <section className="grid two-col">
                {events.filter((event) => !event.oneShot).map((event) => (
                    <article key={event.slug} className="card lift">
                        <h2>{event.title}</h2>
                        <p className="muted">
                            {event.day} • {event.time}
                        </p>
                        <p>{event.description}</p>
                        <p>
                            <strong>Activities:</strong> {event.format}
                        </p>
                        <p>
                            <strong>Entry:</strong> {event.entryFee}
                        </p>
                        <p>
                            <strong>Beginner Friendly:</strong> {event.beginnerFriendly ? "Yes" : "No"}
                        </p>
                        <a className="text-link" href={`/events/${event.slug}`}>
                            View Event Details
                        </a>
                        {event.slug === "friday-night-magic" && (
                            <p style={{ marginTop: "0.75rem" }}>
                                <a className="button primary" href={FNM_EVENTLINK_URL} target="_blank" rel="noreferrer">
                                    🔵 Register on EventLink →
                                </a>
                            </p>
                        )}
                    </article>
                ))}
            </section>

            <section className="card">
                <h2>Community First</h2>
                <p>
                    The Wolf Den is currently focused on growing a healthy local player base and building a welcoming environment for players, collectors, and families of all experience levels.
                </p>
                <p>Whether you are brand new to trading card games or have been playing for years, you are welcome here.</p>
            </section>

            <section className="card">
                <h2>Stay Updated</h2>
                <ul>
                    <li>Join our Discord</li>
                    <li>Follow us on social media</li>
                    <li>Check back regularly for schedule updates</li>
                </ul>
            </section>

            <section className="grid two-col">
                <article className="card lift">
                    <h2>Event Play Area</h2>
                    <Image
                        src="/images/tcg-play-tables-the-wolf-den-montgomery-mn.jpg"
                        alt="Card tables and in-store play area prepared for events at The Wolf Den"
                        width={1200}
                        height={900}
                        sizes="(max-width: 900px) 100vw, 48vw"
                        className="content-photo"
                    />
                </article>
                <article className="card lift">
                    <h2>Tournament Night Setup</h2>
                    <Image
                        src="/images/friday-night-magic-play-area-the-wolf-den-montgomery-mn.jpg"
                        alt="Friday Night Magic and community play setup at The Wolf Den in Montgomery, Minnesota"
                        width={1200}
                        height={900}
                        sizes="(max-width: 900px) 100vw, 48vw"
                        className="content-photo"
                    />
                </article>
            </section>
        </div>
    );
}
