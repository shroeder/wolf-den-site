import Link from "next/link";

export const metadata = {
    title: "Magic: The Gathering Cards",
    description:
        "Shop Magic: The Gathering cards in Montgomery, MN at The Wolf Den. Browse MTG singles, sealed product, and Friday Night Magic events near New Prague, Lonsdale, and Le Sueur.",
    keywords: [
        "Magic The Gathering cards",
        "MTG singles",
        "Friday Night Magic",
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
            <section className="card hero-accent">
                <h1>Magic: The Gathering Cards in Montgomery, MN</h1>
                <p>
                    The Wolf Den supports new and competitive MTG players with singles, sealed product, and weekly events for players across Montgomery and nearby communities.
                </p>
                <div className="cta-row">
                    <Link className="button primary" href="/shop">
                        Shop MTG Inventory
                    </Link>
                    <Link className="button" href="/events">
                        View MTG Events
                    </Link>
                </div>
            </section>

            <section className="grid two-col">
                <article className="card">
                    <h2>What We Stock</h2>
                    <ul>
                        <li>Magic play boosters and collector products</li>
                        <li>Modern, Commander, and Standard staples</li>
                        <li>Deck boxes, sleeves, and playmats</li>
                    </ul>
                </article>
                <article className="card">
                    <h2>Weekly Play</h2>
                    <ul>
                        <li>Friday Night Magic events</li>
                        <li>
                            <Link href="/events/fnm-draft-night">Draft Night every Friday (typical MTG night)</Link>
                        </li>
                        <li>Casual Commander nights</li>
                        <li>Beginner-friendly support and pairings</li>
                    </ul>
                </article>
            </section>

            <section className="card">
                <h2>Sell or Trade MTG Cards</h2>
                <p>
                    Bring in Magic singles and decks for same-day offers in cash or higher-value store credit.
                </p>
                <Link className="text-link" href="/sell-cards">
                    Start a Magic Buylist Request
                </Link>
            </section>

            <section className="card">
                <h2>Serving Nearby Communities</h2>
                <p>
                    If you are searching for a Magic card shop near me, The Wolf Den serves Montgomery, New Prague, Lonsdale, Le Sueur, and surrounding Minnesota communities.
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