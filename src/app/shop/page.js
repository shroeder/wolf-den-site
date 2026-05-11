import Image from "next/image";
import Link from "next/link";

export const metadata = {
    title: "Pokemon, MTG & Accessories",
    description:
        "Shop Pokemon cards, Magic: The Gathering, sealed product, singles, and accessories at The Wolf Den in Montgomery, MN, serving players across southern Minnesota.",
    alternates: {
        canonical: "/shop",
    },
};

export default function ShopPage() {
    return (
        <div className="stack reveal">
            <section className="card hero-accent">
                <h1>Shop Inventory</h1>
                <p>
                    The Wolf Den is building a local source for Pokemon cards, Magic: The Gathering, sealed product, singles, and accessories in Montgomery, Minnesota.
                </p>
                <p>
                    Our inventory rotates based on releases, distributor availability, local trade-ins, and in-store demand. As the store grows, online inventory will continue expanding for players across southern Minnesota.
                </p>
            </section>

            <section className="grid two-col">
                <article className="card lift">
                    <h2>Sealed Product</h2>
                    <p>Current Pokemon and Magic releases, ETBs, booster boxes, bundles, commander decks, and other sealed product will be a major focus.</p>
                </article>
                <article className="card lift">
                    <h2>Singles</h2>
                    <p>We are growing a local singles selection for collectors and players who want a nearby option instead of a long drive to larger markets.</p>
                </article>
                <article className="card lift">
                    <h2>Accessories</h2>
                    <p>Sleeves, deck boxes, binders, playmats, and other supplies are part of the core in-store lineup for new and returning players.</p>
                </article>
                <article className="card lift">
                    <h2>Trade-Ins and Buylist Opportunities</h2>
                    <p>Local trade-ins help expand inventory and keep the shop connected to the community. Cash and store credit offers are available on qualifying cards and collections.</p>
                </article>
            </section>

            <section className="grid two-col">
                <article className="card lift">
                    <h2>Singles and Case Inventory</h2>
                    <Image
                        src="/images/pokemon-singles-case-the-wolf-den-montgomery-mn.jpg"
                        alt="Pokemon and TCG singles displayed in-store at The Wolf Den in Montgomery, Minnesota"
                        width={1200}
                        height={900}
                        sizes="(max-width: 900px) 100vw, 48vw"
                        className="content-photo"
                    />
                </article>
                <article className="card lift">
                    <h2>Product Shelves</h2>
                    <Image
                        src="/images/pokemon-etbs-and-sealed-product-the-wolf-den-montgomery-mn.jpg"
                        alt="Pokemon and trading card product shelves inside The Wolf Den"
                        width={1200}
                        height={900}
                        sizes="(max-width: 900px) 100vw, 48vw"
                        className="content-photo"
                    />
                </article>
            </section>

            <section className="card">
                <h2>What to Expect as Inventory Grows</h2>
                <ul>
                    <li>Rotating sealed Pokemon and Magic product</li>
                    <li>Curated singles and in-store case inventory</li>
                    <li>Accessories and supplies for local play</li>
                    <li>Preorder and release-day updates through Discord</li>
                    <li>More online inventory as the storefront grows</li>
                </ul>
            </section>

            <section className="card">
                <h2>Serving Southern Minnesota Shoppers</h2>
                <p>
                    The Wolf Den serves Montgomery, New Prague, Lonsdale, Faribault, Northfield, Jordan, Le Sueur, Belle Plaine, and nearby southern Minnesota communities looking for a real local game store with real shelf inventory.
                </p>
                <div className="cta-row">
                    <Link className="button primary" href="/sell-cards">
                        Sell or Trade Cards
                    </Link>
                    <a className="button" href="https://discord.gg/Pad8U2KVsD" target="_blank" rel="noreferrer">
                        Join Discord for Inventory Updates
                    </a>
                </div>
            </section>
        </div>
    );
}
