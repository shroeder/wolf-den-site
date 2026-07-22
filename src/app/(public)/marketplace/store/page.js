import ConsumablesClient from "@/components/ConsumablesClient";
import DailyDeals from "@/components/DailyDeals";
import EquipmentClient from "@/components/EquipmentClient";
import ViewPing from "@/components/ViewPing";
import MarketplaceProfileClient from "@/components/MarketplaceProfileClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Store | Wolf Den Marketplace",
    robots: { index: false, follow: false },
};

// The STORE — everything you can BUY with gold, in one place, separate from your Gear (equipment + bag):
// today's deals, consumables (potions/scrolls/treats), and the gold gear shop grouped by slot.
export default async function StorePage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) {
        return (
            <div className="stack reveal">
                <section className="card"><MarketplaceProfileClient /></section>
            </div>
        );
    }

    return (
        <div className="stack reveal">
            <ViewPing event="view_store" />
            <section className="card">
                <h1 style={{ marginTop: 0 }}>🛒 Store</h1>
                <p className="muted" style={{ marginTop: 0 }}>
                    Spend your gold — daily deals, consumables, and gear by slot. Equip what you buy over on <a href="/marketplace/inventory" style={{ color: "#8fd8ff", fontWeight: 700 }}>Gear</a>.
                </p>
            </section>

            <DailyDeals />
            <ConsumablesClient />
            <EquipmentClient view="store" />
        </div>
    );
}
