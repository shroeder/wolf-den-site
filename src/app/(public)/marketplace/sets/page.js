import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getSetsOverview } from "@/lib/marketplace/sets.js";
import { getOwnedPieceIds } from "@/lib/marketplace/collection-owned.js";
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
        // OWNED = gear in the bag PLUS the collection trophies, which live in their own table now. Reading
        // mkt_user_item alone is what made every collection read 0/N the moment pieces stopped being items —
        // members watched sets they had nearly finished empty out. The union is the whole point of this page.
        const [rows, pieces] = await Promise.all([
            db.query(`SELECT item_id FROM mkt_user_item WHERE buyer_id = $1`, [buyer.id]).catch(() => []),
            getOwnedPieceIds(buyer.id).catch(() => []),
        ]);
        owned = [...rows.map((r) => r.item_id), ...pieces];
    }
    const sets = getSetsOverview(equipped, owned);

    return (
        <div className="stack reveal">
            <SetsClient sets={sets} />
        </div>
    );
}
