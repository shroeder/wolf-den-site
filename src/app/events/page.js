import { events } from "@/lib/events";
import Image from "next/image";

export const metadata = {
    title: "Weekly Pokemon & Magic Events",
    description:
        "Events at The Wolf Den in Montgomery, MN, including Friday Magic community nights and Saturday Pokemon community days for players across southern Minnesota.",
    alternates: {
        canonical: "/events",
    },
};

export default function EventsPage() {
    return (
        <div className="stack reveal">
            <section className="card hero-accent">
                <h1>Events at The Wolf Den</h1>
                <p>
                    The Wolf Den is building a local trading card game community in Montgomery, Minnesota.
                </p>
                <p>
                    We are starting with casual, community-focused events designed to help players meet each other, trade cards, learn games, and grow the local scene.
                </p>
            </section>

            <section className="card">
                <h2>Weekly Event Schedule</h2>
                <p>
                    Friday Magic community play runs during store hours from 4:00 PM to 7:00 PM, and Saturday Pokemon community play runs
                    during store hours from 12:00 PM to 6:00 PM.
                </p>
            </section>

            <section className="grid two-col">
                {events.map((event) => (
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
                    </article>
                ))}
            </section>

            <section className="card">
                <h2>Community First</h2>
                <p>
                    The Wolf Den is currently focused on growing a healthy local player base and building a welcoming environment for players of all experience levels.
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
