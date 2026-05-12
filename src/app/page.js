import Image from "next/image";
import Link from "next/link";

const categories = ["Pokemon", "Magic", "Singles", "Accessories", "Events"];

export const metadata = {
    title: "Game Store in Montgomery, MN | Pokemon & MTG",
    description:
        "The Wolf Den is a locally owned trading card game store in Montgomery, Minnesota specializing in Pokemon cards, Magic: The Gathering, sealed product, accessories, and community events.",
    keywords: [
        "game store Montgomery MN",
        "trading card game store Minnesota",
        "Pokemon cards Montgomery MN",
        "Magic The Gathering Montgomery MN",
        "southern Minnesota game store",
        "Pokemon cards near me",
        "MTG near me",
    ],
    alternates: {
        canonical: "/",
    },
};

export default function HomePage() {
    return (
        <div className="stack reveal">
            <section className="hero card hero-split">
                <div className="hero-copy">
                    <p className="eyebrow">Montgomery, Minnesota</p>
                    <Image
                        className="hero-logo"
                        src="/logo/wolf-den-full-logo.png"
                        alt="The Wolf Den"
                        width={420}
                        height={280}
                        sizes="(max-width: 900px) 80vw, 420px"
                        priority
                    />
                    <h1 className="sr-only">The Wolf Den</h1>
                    <p className="lead">
                        Trading card game store in Montgomery, Minnesota for Pokemon cards, Magic: The Gathering, sealed product, singles, accessories, and local community play.
                    </p>
                    <p className="statement-copy">
                        The Wolf Den is a locally owned trading card game store in Montgomery, Minnesota specializing in Pokemon cards, Magic: The Gathering, sealed product, accessories, and community events.
                    </p>
                    <p>
                        Serving players and collectors across Montgomery, New Prague, Lonsdale, Faribault, Northfield, Jordan, Le Sueur, Belle Plaine, and surrounding southern Minnesota communities.
                    </p>
                    <p>
                        <strong>Status:</strong> Soft opening on <strong>May 21, 2026</strong>.
                    </p>
                    <div className="cta-row">
                        <a className="button primary" href="https://discord.gg/Pad8U2KVsD" target="_blank" rel="noreferrer">
                            Join Discord
                        </a>
                        <Link className="button" href="/events">
                            View Events
                        </Link>
                        <Link className="button" href="/shop">
                            Get Opening Updates
                        </Link>
                        <Link className="button" href="/about">
                            About The Wolf Den
                        </Link>
                    </div>
                    <div className="hero-badges">
                        <span className="hero-badge">Locally owned</span>
                        <span className="hero-badge">Pokemon + MTG</span>
                        <span className="hero-badge">Weekly community events</span>
                        <span className="hero-badge">Southern Minnesota</span>
                    </div>
                </div>
                <div className="hero-panel">
                    <Image
                        src="/images/trading-card-store-interior-the-wolf-den-montgomery-mn.jpg"
                        alt="Interior of The Wolf Den in Montgomery, Minnesota with product displays and community play tables"
                        width={1200}
                        height={900}
                        sizes="(max-width: 900px) 100vw, 45vw"
                        className="hero-photo"
                    />
                    <div className="hero-stats">
                        <div className="hero-stat">
                            <span className="hero-stat-label">Store Type</span>
                            <strong>Local TCG storefront</strong>
                        </div>
                        <div className="hero-stat">
                            <span className="hero-stat-label">Focus</span>
                            <strong>Pokemon, Magic, singles, accessories</strong>
                        </div>
                        <div className="hero-stat">
                            <span className="hero-stat-label">Community</span>
                            <strong>Friday MTG and Saturday Pokemon</strong>
                        </div>
                    </div>
                </div>
            </section>

            <section className="grid two-col">
                <article className="card feature-card">
                    <h2>Hours & Location</h2>
                    <p>300 1st St S, Montgomery, MN 56069</p>
                    <ul>
                        <li>Thursday: 4:00 PM – 7:00 PM</li>
                        <li>Friday: 4:00 PM – 7:00 PM</li>
                        <li>Saturday: 12:00 PM – 6:00 PM</li>
                    </ul>
                    <a className="text-link" href="https://www.google.com/maps/search/?api=1&query=300+1st+St+S,+Montgomery,+MN+56069" target="_blank" rel="noreferrer">
                        Open Map
                    </a>
                </article>
                <article className="card feature-card">
                    <h2>What We Offer</h2>
                    <div className="chips">
                        {categories.map((category) => (
                            <span key={category} className="chip">
                                {category}
                            </span>
                        ))}
                    </div>
                    <figure className="photo-block">
                        <Image
                            src="/images/trading-card-store-interior-the-wolf-den-montgomery-mn.jpg"
                            alt="Interior view of The Wolf Den in Montgomery, Minnesota showing card display cases and community play tables"
                            width={1200}
                            height={900}
                            sizes="(max-width: 900px) 100vw, 48vw"
                            className="content-photo"
                        />
                        <figcaption className="muted">Real in-store inventory and play space in Montgomery, MN.</figcaption>
                    </figure>
                </article>
            </section>

            <section className="grid two-col">
                <article className="card">
                    <h2>Southern Minnesota Card Shop</h2>
                    <p>
                        The Wolf Den is a locally owned hobby and trading card store built to give southern Minnesota players a nearby option for Pokemon cards, Magic: The Gathering, supplies, and community events.
                    </p>
                    <p>
                        Many local players have been used to driving into the metro for releases, singles, and in-store play. Our goal is to build a reliable local alternative closer to home.
                    </p>
                </article>
                <article className="card">
                    <h2>What You Can Expect</h2>
                    <ul>
                        <li>Rotating sealed Pokemon and Magic product</li>
                        <li>Singles and card accessories</li>
                        <li>Beginner-friendly local play space</li>
                        <li>Trade nights and community events</li>
                        <li>Real storefront inventory and local pickup</li>
                    </ul>
                </article>
            </section>

            <section className="grid three-col">
                <article className="card lift info-card">
                    <h2>Play Space</h2>
                    <Image
                        src="/images/tcg-play-tables-the-wolf-den-montgomery-mn.jpg"
                        alt="In-store card game tables set up for local events and casual play nights at The Wolf Den"
                        width={1200}
                        height={900}
                        sizes="(max-width: 900px) 100vw, 31vw"
                        className="content-photo"
                    />
                </article>
                <article className="card lift info-card">
                    <h2>Singles Cases</h2>
                    <Image
                        src="/images/pokemon-singles-case-the-wolf-den-montgomery-mn.jpg"
                        alt="Pokemon singles display case at The Wolf Den with organized card inventory"
                        width={1200}
                        height={900}
                        sizes="(max-width: 900px) 100vw, 31vw"
                        className="content-photo"
                    />
                </article>
                <article className="card lift">
                    <h2>Store Interior</h2>
                    <Image
                        src="/images/local-game-store-interior-the-wolf-den-montgomery-mn.jpg"
                        alt="Wide interior shot of The Wolf Den storefront with product shelves and customer counter"
                        width={1200}
                        height={900}
                        sizes="(max-width: 900px) 100vw, 31vw"
                        className="content-photo"
                    />
                </article>
            </section>

            <section className="card">
                <h2>Serving Nearby Communities</h2>
                <p>
                    If you are searching for a game store near me, Pokemon cards near me, or a local Magic shop in southern Minnesota, The Wolf Den serves Montgomery, New Prague, Lonsdale, Faribault, Northfield, Jordan, Le Sueur, Belle Plaine, and nearby communities.
                </p>
            </section>

            <section className="grid three-col">
                <article className="card lift">
                    <h2>Pokemon Cards</h2>
                    <p>Browse Pokemon singles, sealed product, and beginner-friendly local league play.</p>
                    <Link className="text-link" href="/pokemon-cards">
                        Explore Pokemon
                    </Link>
                </article>
                <article className="card lift">
                    <h2>Magic: The Gathering</h2>
                    <p>Find MTG singles, sealed products, and Friday Night Magic updates.</p>
                    <Link className="text-link" href="/magic-the-gathering">
                        Explore Magic
                    </Link>
                </article>
                <article className="card lift">
                    <h2>Shop Inventory</h2>
                    <p>Sealed product, accessories, and featured singles online at launch.</p>
                    <Link className="text-link" href="/shop">
                        Browse Shop
                    </Link>
                </article>
                <article className="card lift">
                    <h2>Events</h2>
                    <p>Weekly leagues, Friday tournaments, and beginner-friendly play nights.</p>
                    <Link className="text-link" href="/events">
                        See Calendar
                    </Link>
                </article>
                <article className="card lift">
                    <h2>We Buy Cards</h2>
                    <p>Cash or store credit for Pokemon, Magic, and select collectibles.</p>
                    <Link className="text-link" href="/sell-cards">
                        Sell Your Cards
                    </Link>
                </article>
                <article className="card lift">
                    <h2>About The Wolf Den</h2>
                    <p>Learn how the store is building a local hobby community for southern Minnesota players and collectors.</p>
                    <Link className="text-link" href="/about">
                        Read Our Story
                    </Link>
                </article>
            </section>
        </div>
    );
}
