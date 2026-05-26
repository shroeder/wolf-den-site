import Image from "next/image";

import MysteryBagShowcaseClient from "@/components/MysteryBagShowcaseClient";
import { getMysteryBagDashboardData } from "@/lib/mystery-bags";

const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
});

const formatMoney = (value) => currencyFormatter.format(Number(value || 0));

export const metadata = {
    title: "Mystery Bag Market Dashboard",
    description:
        "Track every single card currently packed in Wolf Den mystery bags, including live market total, per-bag market average, and top-value cards.",
    alternates: {
        canonical: "/mystery-bags",
    },
};

export default async function MysteryBagsPage() {
    const data = await getMysteryBagDashboardData().catch(() => null);
    const cards = data?.cards || [];
    const topCards = data?.topCards || [];
    const metrics = data?.metrics || {
        itemCount: 0,
        marketTotal: 0,
        marketAverage: 0,
    };

    return (
        <div className="stack reveal">
            <section className="card mystery-hero mystery-hero-grid">
                <div>
                    <p className="eyebrow">Mystery Bag Tracker</p>
                    <h1>See Every Card Packed In Mystery Bags</h1>
                    <p className="lead">
                        The list below continuously scrolls through all singles currently packed across mystery bags. The market average is the current estimated mystery bag value.
                    </p>
                    <div className="mystery-stat-grid">
                        <article className="mystery-stat-card">
                            <p className="consignment-stat-label">Market Total</p>
                            <strong>{formatMoney(metrics.marketTotal)}</strong>
                        </article>
                        <article className="mystery-stat-card">
                            <p className="consignment-stat-label">Mystery Bag Price (Avg)</p>
                            <strong>{formatMoney(metrics.marketAverage)}</strong>
                        </article>
                        <article className="mystery-stat-card">
                            <p className="consignment-stat-label">Singles Packed</p>
                            <strong>{metrics.itemCount}</strong>
                        </article>
                    </div>
                </div>

                <div className="mystery-bag-photo-wrap">
                    <Image
                        src="/images/mystery_bag.jpg"
                        alt="Sealed mystery bag used for card singles at The Wolf Den"
                        width={1200}
                        height={1600}
                        sizes="(max-width: 900px) 100vw, 34vw"
                        className="mystery-bag-photo"
                        priority
                    />
                </div>
            </section>

            <section className="grid two-col mystery-summary-grid">
                <article className="card">
                    <h2>Top 3 Most Expensive Cards</h2>
                    {topCards.length ? (
                        <ol className="mystery-top-list">
                            {topCards.map((card) => (
                                <li key={card.id} className="mystery-top-item">
                                    <div>
                                        <p className="mystery-top-name">{card.name}</p>
                                        <p className="secondary">
                                            {card.set} #{card.number}
                                        </p>
                                    </div>
                                    <strong>{formatMoney(card.marketValue)}</strong>
                                </li>
                            ))}
                        </ol>
                    ) : (
                        <p className="consignment-empty">No cards are currently packed in mystery bags.</p>
                    )}
                </article>

                <article className="card">
                    <h2>Current Mystery Bag Price</h2>
                    <p className="mystery-current-price">{formatMoney(metrics.marketAverage)}</p>
                    <p className="secondary">
                        This value is calculated from the average market value across all singles currently packed in mystery bags.
                    </p>
                </article>
            </section>

            <section className="card">
                <div className="mystery-list-head">
                    <h2>All Packed Singles</h2>
                    <p className="secondary">Auto-scrolling live list of every mystery bag single with image, name, and market value.</p>
                </div>
                <MysteryBagShowcaseClient cards={cards} />
            </section>
        </div>
    );
}
