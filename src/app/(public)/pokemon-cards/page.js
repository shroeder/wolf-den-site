import Link from "next/link";
import Image from "next/image";

export const metadata = {
    title: "Pokemon Cards in Montgomery, MN",
    description:
        "Pokemon cards in Montgomery, MN at The Wolf Den. Find ETBs, booster boxes, singles, accessories, and a local southern Minnesota store serving New Prague, Lonsdale, Faribault, Northfield, and nearby communities.",
    keywords: [
        "Pokemon cards",
        "pokemon singles",
        "pokemon sealed product",
        "pokemon southern Minnesota",
        "Montgomery MN card shop",
        "pokemon cards near me",
        "pokemon store near me",
        "new prague pokemon cards",
        "faribault pokemon cards",
        "northfield pokemon cards",
    ],
    alternates: {
        canonical: "/pokemon-cards",
    },
};

export default function PokemonCardsPage() {
    return (
        <div className="stack reveal">
            <section className="card hero-accent showcase-grid">
                <div>
                    <h1>Pokemon Trading Cards in Southern Minnesota</h1>
                    <p>
                        Welcome to The Wolf Den, your local destination for Pokemon cards, sealed product, accessories, and community in Montgomery, Minnesota.
                    </p>
                    <p className="statement-copy">
                        The Wolf Den gives southern Minnesota players and collectors a nearby option for Pokemon cards, ETBs, booster boxes, singles, accessories, and future organized play.
                    </p>
                    <div className="cta-row">
                        <Link className="button primary" href="/shop">
                            Shop Pokemon Inventory
                        </Link>
                        <Link className="button" href="/events">
                            View Pokemon Events
                        </Link>
                    </div>
                    <div className="hero-badges">
                        <span className="hero-badge">ETBs + booster boxes</span>
                        <span className="hero-badge">Singles + accessories</span>
                        <span className="hero-badge">Saturday community play</span>
                    </div>
                </div>
                <div className="showcase-media">
                    <Image
                        src="/images/pokemon-store-display-cases-the-wolf-den-montgomery-mn.jpg"
                        alt="Interior of The Wolf Den in Montgomery, Minnesota with Pokemon singles display cases and sealed product shelves"
                        width={1600}
                        height={2133}
                        sizes="(max-width: 900px) 100vw, 45vw"
                        className="hero-photo"
                    />
                </div>
            </section>

            <section className="grid two-col">
                <article className="card">
                    <h2>What We Carry</h2>
                    <ul>
                        <li>Elite Trainer Boxes (ETBs)</li>
                        <li>Booster Boxes and Booster Bundles</li>
                        <li>Sleeved Boosters and Premium Collections</li>
                        <li>Pokemon Center products</li>
                        <li>Singles, sleeves, binders, deck boxes, and accessories</li>
                    </ul>
                    <p>
                        Whether you are a collector, competitive player, investor, parent, or casual fan, we aim to provide a reliable local source for Pokemon products without needing to drive into the cities.
                    </p>
                </article>
                <article className="card">
                    <h2>Pokemon Community and Events</h2>
                    <ul>
                        <li>Casual Pokemon meetups</li>
                        <li>Trade nights</li>
                        <li>Learn-to-play opportunities</li>
                        <li>Pack battles</li>
                        <li>Community tournaments</li>
                        <li>Future sanctioned play opportunities</li>
                    </ul>
                    <p>
                        The Wolf Den is building a welcoming local Pokemon community for players of all ages. Join Discord and follow our social pages for inventory updates and event announcements.
                    </p>
                </article>
            </section>

            <section className="grid two-col">
                <article className="card lift">
                    <h2>Pokemon Product Shelves</h2>
                    <Image
                        src="/images/pokemon-sealed-product-display-the-wolf-den-montgomery-mn.jpg"
                        alt="Pokemon ETBs, booster boxes, binder collections, and sealed product on the shelves at The Wolf Den in Montgomery, Minnesota"
                        width={1600}
                        height={2133}
                        sizes="(max-width: 900px) 100vw, 48vw"
                        className="content-photo"
                    />
                </article>
                <article className="card lift">
                    <h2>Pokemon Singles</h2>
                    <Image
                        src="/images/pokemon-singles-glass-case-the-wolf-den-montgomery-mn.jpg"
                        alt="Pokemon singles in toploaders with price tags in the glass display case at The Wolf Den in Montgomery, Minnesota"
                        width={1600}
                        height={2133}
                        sizes="(max-width: 900px) 100vw, 48vw"
                        className="content-photo"
                    />
                </article>
            </section>

            <section className="card">
                <h2>What You Will Find at The Wolf Den</h2>
                <p>
                    Inventory rotates frequently based on availability and market conditions. Common product categories include current Pokemon TCG expansions, specialty collections, ETBs, booster boxes, accessories, supplies, trade-in opportunities, and community events.
                </p>
                <p>We are continuously expanding inventory as the store grows.</p>
            </section>

            <section className="card">
                <h2>Serving Southern Minnesota Pokemon Players</h2>
                <p>The Wolf Den proudly serves players and collectors from:</p>
                <ul>
                    <li>Montgomery</li>
                    <li>New Prague</li>
                    <li>Lonsdale</li>
                    <li>Faribault</li>
                    <li>Northfield</li>
                    <li>Jordan</li>
                    <li>Le Sueur</li>
                    <li>Belle Plaine</li>
                    <li>Surrounding southern Minnesota communities</li>
                </ul>
                <p>
                    Our goal is to help grow the local trading card community while giving people a nearby option for Pokemon cards, supplies, and future organized play.
                </p>
            </section>

            <section className="card">
                <h2>Visit The Wolf Den</h2>
                <p>300 1st St S, Montgomery, MN 56069</p>
                <p>
                    The Wolf Den is a locally owned trading card game store focused on building a fun, welcoming environment for collectors and players throughout southern Minnesota.
                </p>
                <div className="cta-row">
                    <a className="button primary" href="tel:+17014090782">
                        Call Now: (701) 409-0782
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