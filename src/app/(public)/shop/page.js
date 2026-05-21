import Link from "next/link";

import { getShopInventory } from "@/lib/shop/inventory";

export const metadata = {
    title: "Pokemon, MTG & Accessories",
    description:
        "Shop Pokemon cards, Magic: The Gathering, sealed product, singles, and accessories at The Wolf Den in Montgomery, MN, serving players across southern Minnesota.",
    alternates: {
        canonical: "/shop",
    },
};

function formatPrice(price) {
    if (!price) return null;
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(price);
}

function formatRefreshedAt(date) {
    if (!date) return null;
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(date));
}

export default async function ShopPage() {
    const snapshot = await getShopInventory().catch(() => null);

    return (
        <div className="stack reveal">
            <section className="card hero-accent">
                <h1>Shop Inventory</h1>
                <p>
                    The Wolf Den carries Pokemon cards, Magic: The Gathering, sealed product, singles, and accessories in Montgomery, Minnesota.
                </p>
                <p>
                    Inventory rotates based on releases, distributor availability, local trade-ins, and in-store demand. The list below reflects what is currently in stock and updates daily.
                </p>
            </section>

            {snapshot && snapshot.categories.length > 0 ? (
                <section className="card">
                    <h2>Current In-Stock Inventory</h2>
                    {snapshot.refreshedAt && (
                        <p className="text-muted">Updated {formatRefreshedAt(snapshot.refreshedAt)}</p>
                    )}
                    {snapshot.categories.map((category) => (
                        <div key={category.id} className="stack">
                            <h3>{category.name}</h3>
                            <table className="inventory-table">
                                <thead>
                                    <tr>
                                        <th>Item</th>
                                        <th>Price</th>
                                        <th>In Stock</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {category.items.map((item) => (
                                        <tr key={item.id}>
                                            <td>{item.name}</td>
                                            <td>{formatPrice(item.price) ?? "—"}</td>
                                            <td>{item.quantity}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </section>
            ) : (
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
            )}

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
