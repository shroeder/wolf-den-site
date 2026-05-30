import MysteryBagShowcaseClient from "@/components/MysteryBagShowcaseClient";
import { getMysteryBagDashboardData } from "@/lib/mystery-bags";

const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
});

const DEFAULT_BAG_PRICE = 25;

function resolveBagPrice(squareBagPrice, metrics) {
    const squarePrice = Number(squareBagPrice || 0);

    if (squarePrice > 0) {
        return {
            value: squarePrice,
            source: "square",
        };
    }

    const explicitPrice = Number(process.env.MYSTERY_BAG_PRICE || process.env.NEXT_PUBLIC_MYSTERY_BAG_PRICE || 0);

    if (explicitPrice > 0) {
        return {
            value: explicitPrice,
            source: "env_fallback",
        };
    }

    const averageBasedPrice = Number(metrics?.marketAverage || 0);

    if (averageBasedPrice > 0) {
        return {
            value: averageBasedPrice,
            source: "average_fallback",
        };
    }

    return {
        value: DEFAULT_BAG_PRICE,
        source: "default_fallback",
    };
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
    const squareBagPrice = data?.bagPrice || 0;
    const metrics = data?.metrics || {
        itemCount: 0,
        marketTotal: 0,
        marketAverage: 0,
    };
    const bagPriceResolution = resolveBagPrice(squareBagPrice, metrics);
    const bagPrice = bagPriceResolution.value;

    return (
        <div className="mb-page">
            <MysteryBagShowcaseClient cards={cards} metrics={metrics} bagPrice={bagPrice} />
        </div>
    );
}
