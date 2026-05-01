export const metadata = { title: "Shop | The Wolf Den" };

export default function ShopPage() {
    return (
        <div className="stack reveal">
            <section className="card">
                <h1>Shop Inventory</h1>
                <p>
                    Shopify can power products while this site handles your marketing and event conversion paths.
                </p>
            </section>

            <section className="grid two-col">
                <article className="card lift">
                    <h2>Sealed Product</h2>
                    <p>Launch online with sealed Pokemon and Magic product.</p>
                </article>
                <article className="card lift">
                    <h2>Singles</h2>
                    <p>Feature high-demand singles/slabs online. Keep bulk singles marked in-store.</p>
                </article>
                <article className="card lift">
                    <h2>Accessories</h2>
                    <p>Sleeves, deck boxes, binders, and playmats with local pickup options.</p>
                </article>
                <article className="card lift">
                    <h2>Preorders / Allocations</h2>
                    <p>Collect interest early and manage limits clearly by account.</p>
                </article>
            </section>

            <section className="card">
                <h2>Launch Workflow</h2>
                <ul>
                    <li>Start with sealed and accessories online.</li>
                    <li>Add curated singles rather than full real-time singles inventory.</li>
                    <li>Keep a visible buylist/contact flow to source local inventory.</li>
                </ul>
            </section>
        </div>
    );
}
