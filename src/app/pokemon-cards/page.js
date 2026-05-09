import Link from "next/link";

export const metadata = {
    title: "Pokemon Cards",
    description:
        "Shop Pokemon cards in Montgomery, MN at The Wolf Den. Find Pokemon singles, sealed product, league nights, and a local game store option near New Prague, Lonsdale, and Le Sueur.",
    keywords: [
        "Pokemon cards",
        "pokemon singles",
        "pokemon sealed product",
        "pokemon league",
        "Montgomery MN card shop",
        "pokemon cards near me",
        "pokemon store near me",
        "new prague pokemon cards",
    ],
    alternates: {
        canonical: "/pokemon-cards",
    },
};

export default function PokemonCardsPage() {
    return (
        <div className="stack reveal">
            <section className="card hero-accent">
                <h1>Pokemon Cards in Montgomery, MN</h1>
                <p>
                    The Wolf Den carries Pokemon singles, sealed product, and beginner-friendly events for local players and families near Montgomery, New Prague, Lonsdale, and Le Sueur.
                </p>
                <div className="cta-row">
                    <Link className="button primary" href="/shop">
                        Shop Pokemon Inventory
                    </Link>
                    <Link className="button" href="/events">
                        View Pokemon Events
                    </Link>
                </div>
            </section>

            <section className="grid two-col">
                <article className="card">
                    <h2>What We Stock</h2>
                    <ul>
                        <li>Pokemon booster boxes, ETBs, and bundles</li>
                        <li>High-demand Pokemon singles</li>
                        <li>Sleeves, deck boxes, and binders</li>
                    </ul>
                </article>
                <article className="card">
                    <h2>Play and Learn</h2>
                    <ul>
                        <li>Pokemon League and beginner tables</li>
                        <li>Family-friendly in-store play</li>
                        <li>Discord updates for seat availability</li>
                    </ul>
                </article>
            </section>

            <section className="card">
                <h2>Sell or Trade Pokemon Cards</h2>
                <p>
                    We buy Pokemon singles and select sealed product with same-day offers in cash or store credit.
                </p>
                <Link className="text-link" href="/sell-cards">
                    Start a Pokemon Buylist Request
                </Link>
            </section>

            <section className="card">
                <h2>Serving Nearby Communities</h2>
                <p>
                    If you are searching for a Pokemon card shop near me, The Wolf Den is a short drive for players in Montgomery, New Prague, Lonsdale, Le Sueur, and surrounding areas.
                </p>
            </section>

            <section className="card">
                <h2>Visit or Contact The Wolf Den</h2>
                <p>300 1st St S, Montgomery, MN 56069</p>
                <div className="cta-row">
                    <a className="button primary" href="tel:+15073016434">
                        Call Now: (507) 301-6434
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