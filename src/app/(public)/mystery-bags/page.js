import Image from "next/image";

import MysteryBagShowcaseClient from "@/components/MysteryBagShowcaseClient";
import { getMysteryBagDashboardData } from "@/lib/mystery-bags";

const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
});

const formatMoney = (value) => currencyFormatter.format(Number(value || 0));
const formatPct = (value) => `${Number(value || 0).toFixed(1)}%`;

export const metadata = {
    title: "Mystery Bag Market Dashboard",
    description:
        "Track every single card currently packed in Wolf Den mystery bags, including live market total, per-bag market average, and top-value cards.",
    alternates: {
        canonical: "/mystery-bags",
    },
};

export const dynamic = "force-dynamic";

export default async function MysteryBagsPage() {
    const data = await getMysteryBagDashboardData().catch(() => null);
    const cards = data?.cards || [];
    const metrics = data?.metrics || {
        itemCount: 0,
        marketTotal: 0,
        marketAverage: 0,
    };
    const bagPrice = Number(metrics.marketAverage || 0);
    const cardsAboveBagPrice = cards.filter((card) => Number(card.marketValue || 0) > bagPrice).length;
    const cardsAtOrBelowBagPrice = cards.filter((card) => Number(card.marketValue || 0) <= bagPrice).length;
    const pullAboveBagPct = cards.length ? (cardsAboveBagPrice / cards.length) * 100 : 0;
    const pullAtOrBelowBagPct = cards.length ? (cardsAtOrBelowBagPrice / cards.length) * 100 : 0;

    return (
        <div className="stack reveal mystery-board-page">
            <section className="card mystery-board">
                <div className="mystery-board-head">
                    <div className="mystery-board-copy">
                        <p className="eyebrow">Mystery Bag Tracker</p>
                        <h1>Mystery Bag Live Board</h1>
                        <p className="mystery-subtle">
                            One nonstop list of all currently packed singles. Hover or touch to pause scrolling.
                        </p>
                        <div className="mystery-kpis">
                            <p className="mystery-kpi">Bag Price: <strong>{formatMoney(bagPrice)}</strong></p>
                            <p className="mystery-kpi">Market Total: <strong>{formatMoney(metrics.marketTotal)}</strong></p>
                            <p className="mystery-kpi">Singles: <strong>{metrics.itemCount}</strong></p>
                            <p className="mystery-kpi">Pull &gt; Bag: <strong>{formatPct(pullAboveBagPct)}</strong></p>
                            <p className="mystery-kpi">Pull &le; Bag: <strong>{formatPct(pullAtOrBelowBagPct)}</strong></p>
                        </div>
                    </div>

                    <div className="mystery-bag-photo-wrap">
                        <Image
                            src="/images/mystery_bag.jpg"
                            alt="Sealed mystery bag used for card singles at The Wolf Den"
                            width={1200}
                            height={1600}
                            sizes="(max-width: 900px) 100vw, 28vw"
                            className="mystery-bag-photo"
                            priority
                        />
                    </div>
                </div>
                <MysteryBagShowcaseClient cards={cards} />
            </section>
        </div>
    );
}
