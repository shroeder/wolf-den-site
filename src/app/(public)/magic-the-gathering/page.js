import Link from "next/link";
import Image from "next/image";

export const metadata = {
    title: "Magic: The Gathering in Montgomery, MN",
    description:
        "Magic: The Gathering in Montgomery, MN at The Wolf Den. Find Commander, sealed product, accessories, singles, and Friday Commander Night play for southern Minnesota players near New Prague, Northfield, Faribault, and Lonsdale.",
    keywords: [
        "Magic The Gathering cards",
        "MTG singles",
        "Friday Commander Night",
        "Commander night",
        "Magic sealed product",
        "Montgomery MN game store",
        "magic the gathering near me",
        "mtg store near me",
        "new prague mtg",
    ],
    alternates: {
        canonical: "/magic-the-gathering",
    },
};

export default function MagicTheGatheringPage() {
    return (
        <div className="stack reveal">
            <section className="card hero-accent showcase-grid">
                <div>
                    <h1>Magic: The Gathering in Southern Minnesota</h1>
                    <p>
                        The Wolf Den is building a local home for Magic: The Gathering players in Montgomery, Minnesota.
                    </p>
                    <p>
                        Whether you enjoy Commander, casual play, collecting sealed product, or cracking packs with friends, our goal is to provide a welcoming local game store experience for southern Minnesota players.
                    </p>
                    <p className="statement-copy">
                        We are focused on giving local Magic players a nearby store for Commander, current releases, accessories, singles, and Friday community play without always needing to drive into the cities.
                    </p>
                    <div className="cta-row">
                        <Link className="button primary" href="/shop">
                            Shop MTG Inventory
                        </Link>
                        <Link className="button" href="/events">
                            View MTG Events
                        </Link>
                    </div>
                    <div className="hero-badges">
                        <span className="hero-badge">Commander friendly</span>
                        <span className="hero-badge">Friday community nights</span>
                        <span className="hero-badge">Sealed + singles</span>
                    </div>
                </div>
                <div className="showcase-media">
                    <Image
                        src="/images/magic-the-gathering-products-the-wolf-den-montgomery-mn.jpg"
                        alt="Magic: The Gathering product selection at The Wolf Den in Montgomery, Minnesota"
                        width={1200}
                        height={900}
                        sizes="(max-width: 900px) 100vw, 45vw"
                        className="hero-photo"
                    />
                </div>
            </section>

            <section className="grid two-col">
                <article className="card">
                    <h2>Magic Products We Carry</h2>
                    <ul>
                        <li>Play Booster Boxes</li>
                        <li>Collector products</li>
                        <li>Commander decks</li>
                        <li>Bundles and prerelease kits</li>
                        <li>Sleeves and accessories</li>
                        <li>Singles and sealed product</li>
                    </ul>
                    <p>We focus heavily on current releases while continuing to expand inventory over time.</p>
                </article>
                <article className="card">
                    <h2>Commander and Casual Play</h2>
                    <ul>
                        <li>Meet new players</li>
                        <li>Play casual Commander</li>
                        <li>Trade cards</li>
                        <li>Learn the game</li>
                        <li>
                            <Link href="/events/friday-night-magic">Join Friday Commander Night</Link>
                        </li>
                        <li>Participate in future organized events</li>
                    </ul>
                    <p>Commander is one of the biggest focuses at The Wolf Den, and new players are always welcome.</p>
                </article>
            </section>

            <section className="grid two-col">
                <article className="card lift">
                    <h2>MTG Product Selection</h2>
                    <Image
                        src="/images/magic-the-gathering-products-the-wolf-den-montgomery-mn.jpg"
                        alt="Magic: The Gathering sealed product inventory for southern Minnesota players at The Wolf Den"
                        width={1200}
                        height={900}
                        sizes="(max-width: 900px) 100vw, 48vw"
                        className="content-photo"
                    />
                </article>
                <article className="card lift">
                    <h2>MTG Singles Case</h2>
                    <Image
                        src="/images/magic-singles-case-the-wolf-den-montgomery-mn.jpg"
                        alt="Magic singles display case for Commander and MTG players at The Wolf Den in Montgomery, Minnesota"
                        width={1200}
                        height={900}
                        sizes="(max-width: 900px) 100vw, 48vw"
                        className="content-photo"
                    />
                </article>
            </section>

            <section className="card">
                <h2>Serving Local MTG Players</h2>
                <p>
                    The Wolf Den serves players from Montgomery, New Prague, Northfield, Faribault, Jordan, Lonsdale, Le Sueur, and surrounding southern Minnesota communities.
                </p>
                <p>
                    We know many players currently drive long distances for local game store access, and we are working to create a strong local alternative.
                </p>
            </section>

            <section className="card">
                <h2>Friday Commander Night at The Wolf Den</h2>
                <p>
                    Friday Commander Night runs during store hours from 4:00 PM to 7:00 PM. The focus is casual Commander pods, trading, learn-to-play support, and future organized Commander events as the community grows.
                </p>
                <p>As the community grows, event offerings will continue to expand.</p>
            </section>

            <section className="card">
                <h2>Join the Community</h2>
                <p>
                    Follow The Wolf Den online and join our Discord for inventory updates, event announcements, new release information, community discussions, and local trade coordination.
                </p>
                <div className="cta-row">
                    <a className="button primary" href="https://discord.gg/Pad8U2KVsD" target="_blank" rel="noreferrer">
                        Join Discord
                    </a>
                    <a
                        className="button"
                        href="https://www.google.com/maps/search/?api=1&query=300+1st+St+S,+Montgomery,+MN+56069"
                        target="_blank"
                        rel="noreferrer"
                    >
                        Get Directions
                    </a>
                </div>
            </section>
        </div>
    );
}