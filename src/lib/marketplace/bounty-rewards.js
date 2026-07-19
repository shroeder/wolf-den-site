import "server-only";

import { db } from "@/lib/db";
import { grantItem } from "@/lib/marketplace/inventory.js";

// Milestone rewards for fulfilling community bounties: a unique item at 3 wins and a unique pet at 10 wins.
// (Badges are handled separately by syncEarnedBadges via the 'bounties_won' rule.) Idempotent — safe to
// call after every win.
const BOUNTY_ITEM_ID = "bounty_hunters_mark"; // defined in items.js
const BOUNTY_ITEM_AT = 3;
const BOUNTY_PET_ID = "bounty_hound"; // defined in collectibles.js
const BOUNTY_PET_AT = 10;

async function bountyWins(buyerId) {
    const row = await db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_bounty_claim WHERE buyer_id = $1 AND is_winner = TRUE`, [buyerId]).catch(() => null);
    return row?.n || 0;
}

export async function grantBountyRewards(buyerId) {
    if (!buyerId) return;
    const wins = await bountyWins(buyerId);

    if (wins >= BOUNTY_ITEM_AT) {
        await grantItem(buyerId, BOUNTY_ITEM_ID, "bounty_reward").catch(() => {});
    }
    if (wins >= BOUNTY_PET_AT) {
        await db
            .query(`INSERT INTO mkt_cosmetic_unlock (buyer_id, category, ref) VALUES ($1, 'pet', $2) ON CONFLICT DO NOTHING`, [buyerId, BOUNTY_PET_ID])
            .catch(() => {});
    }
}
