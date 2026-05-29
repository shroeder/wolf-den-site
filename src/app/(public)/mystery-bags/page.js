import MysteryBagShowcaseClient from "@/components/MysteryBagShowcaseClient";
import { getMysteryBagDashboardData } from "@/lib/mystery-bags";

const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
});

const formatMoney = (value) => currencyFormatter.format(Number(value || 0));

const DEFAULT_BAG_PRICE = 25;

function resolveBagPrice(metrics) {
    const explicitPrice = Number(process.env.MYSTERY_BAG_PRICE || process.env.NEXT_PUBLIC_MYSTERY_BAG_PRICE || 0);

    if (explicitPrice > 0) {
        return explicitPrice;
    }

    return Number(metrics?.marketAverage || DEFAULT_BAG_PRICE || 0);
}

export const metadata = {
    title: "Mystery Bag Live Chase Board",
    description:
        "Watch live chase hits, biggest remaining cards, and real-time mystery bag value at The Wolf Den.",
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
    const bagPrice = resolveBagPrice(metrics);

    return (
        <div className="stack reveal mystery-board-page">
            <section className="card mystery-board">
                <MysteryBagShowcaseClient cards={cards} metrics={metrics} bagPrice={bagPrice} />
                <p className="mystery-valuation-note" aria-label="valuation source">
                    Live values are based on current card market pricing.
                    {Number(metrics.marketAverage || 0) > 0
                        ? ` Current average card value in pool: ${formatMoney(metrics.marketAverage)}.`
                        : ""}
                </p>
            </section>
        </div>
    );
}
