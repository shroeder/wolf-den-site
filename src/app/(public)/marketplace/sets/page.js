import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getSetsOverview } from "@/lib/marketplace/sets.js";
import { getEquippedIds } from "@/lib/marketplace/inventory.js";
import { db } from "@/lib/db";
import SetsClient from "@/components/SetsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Gear Sets · The Wolf Den" };

export default async function SetsPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    let equipped = [];
    let owned = [];
    if (buyer) {
        const bySlot = await getEquippedIds(buyer.id).catch(() => ({}));
        equipped = Object.values(bySlot);
        const rows = await db.query(`SELECT item_id FROM mkt_user_item WHERE buyer_id = $1`, [buyer.id]).catch(() => []);
        owned = rows.map((r) => r.item_id);
    }
    const sets = getSetsOverview(equipped, owned);

    return (
        <div className="stack reveal">
            <SetsClient sets={sets} />
        </div>
    );
}
