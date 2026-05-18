import Image from "next/image";
import Link from "next/link";

export const metadata = {
    title: "New Players, Parents & Beginners",
    description:
        "New to Pokemon or Magic: The Gathering? The Wolf Den in Montgomery, MN welcomes beginners, parents, and families with friendly events, starter product, and a welcoming southern Minnesota community.",
    alternates: {
        canonical: "/new-players",
    },
};

export default function NewPlayersPage() {
    return (
        <div className="stack reveal">
            <section className="card hero-accent">
                <h1>New Players & Parents</h1>
                <p>
                    Starting Pokemon or Magic: The Gathering can feel overwhelming at first. The Wolf Den is built to make that process easier, friendlier, and more local for players and families in southern Minnesota.
                </p>
                <p>
                    Whether you are helping a child get started, returning to the hobby yourself, or trying to figure out which game makes the most sense, we want the store to feel approachable from day one.
                </p>
            </section>

            <section className="grid two-col">
                <article className="card">
                    <h2>Starting With Pokemon</h2>
                    <ul>
                        <li>Beginner-friendly Pokemon products and accessories</li>
                        <li>Simple guidance on what to buy first</li>
                        <li>Casual weekly Pokemon community time on Saturdays</li>
                        <li>Trade, collecting, and learn-to-play support</li>
                    </ul>
                    <p>
                        Pokemon is often the easiest entry point for kids, families, collectors, and casual players. The goal is to create a welcoming place to learn without pressure.
                    </p>
                </article>
                <article className="card">
                    <h2>Starting With Magic</h2>
                    <ul>
                        <li>Commander and casual play are the easiest first steps</li>
                        <li>Starter accessories and sleeves available in-store</li>
                        <li>Friday Magic community nights for meeting local players</li>
                        <li>Beginner questions are welcome</li>
                    </ul>
                    <p>
                        Magic has more rules and formats than Pokemon, but it becomes much easier when new players have a local place to ask questions and meet the community.
                    </p>
                </article>
            </section>

            <section className="grid two-col">
                <article className="card lift">
                    <h2>Welcoming Play Space</h2>
                    <Image
                        src="/images/tcg-play-tables-the-wolf-den-montgomery-mn.jpg"
                        alt="Play tables at The Wolf Den prepared for beginner-friendly local card game events"
                        width={1200}
                        height={900}
                        sizes="(max-width: 900px) 100vw, 48vw"
                        className="content-photo"
                    />
                </article>
                <article className="card">
                    <h2>What to Buy First</h2>
                    <ul>
                        <li>Start with a small sealed product or starter-friendly purchase</li>
                        <li>Add sleeves, a deck box, or a binder as needed</li>
                        <li>Ask about beginner-friendly recommendations before overspending</li>
                        <li>Focus on learning the game and community first</li>
                    </ul>
                </article>
            </section>

            <section className="card">
                <h2>Family-Friendly Notes</h2>
                <ul>
                    <li>Kid-friendly casual tables and community-focused events.</li>
                    <li>Staff can help explain products, formats, and basic expectations.</li>
                    <li>New players can ease into the hobby without needing tournament experience.</li>
                    <li>Respectful behavior and family-friendly conduct are expected in-store.</li>
                </ul>
            </section>

            <section className="card">
                <h2>Serving New Players Across Southern Minnesota</h2>
                <p>
                    The Wolf Den welcomes new players and parents from Montgomery, New Prague, Lonsdale, Faribault, Northfield, Jordan, Le Sueur, Belle Plaine, and nearby southern Minnesota communities.
                </p>
                <div className="cta-row">
                    <Link className="button primary" href="/events">
                        View Weekly Events
                    </Link>
                    <Link className="button" href="/pokemon-cards">
                        Explore Pokemon
                    </Link>
                    <Link className="button" href="/magic-the-gathering">
                        Explore Magic
                    </Link>
                </div>
            </section>
        </div>
    );
}
