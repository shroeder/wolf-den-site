import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getSetsOverview } from "@/lib/marketplace/sets.js";
import { getOwnedPieceIds, loanedPiece } from "@/lib/marketplace/collection-owned.js";
import { hasPower } from "@/lib/marketplace/ascension-powers.js";
import { getEquippedIds } from "@/lib/marketplace/inventory.js";
import { db } from "@/lib/db";
import SetsClient from "@/components/SetsClient";
import ViewPing from "@/components/ViewPing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Gear Sets · The Wolf Den" };

export default async function SetsPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    let equipped = [];
    let owned = [];
    // THE LOANED EXHIBIT. `exhibit` is the piece currently borrowed and `canLoan` is whether this member may
    // borrow at all — false for everyone not wearing the piece that grants it, which is what the client keys
    // the control off. getOwnedPieceIds already folds the loan into `owned`, so the set maths needs nothing.
    let exhibit = null;
    let canLoan = false;
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
        canLoan = await hasPower(buyer.id, "loaned_exhibit").catch(() => false);
        exhibit = canLoan ? await loanedPiece(buyer.id).catch(() => null) : null;
    }
    const sets = getSetsOverview(equipped, owned);

    return (
        <div className="stack reveal">
            <ViewPing event="view_sets" />
            <SetsClient sets={sets} exhibit={exhibit} canLoan={canLoan} />
        </div>
    );
}
