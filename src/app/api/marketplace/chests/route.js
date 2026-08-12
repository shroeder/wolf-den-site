import { after, NextResponse } from "next/server";

import { getChests, openChest } from "@/lib/marketplace/chests.js";
import { bumpQuestProgress } from "@/lib/marketplace/quests.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { db } from "@/lib/db";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET — the member's loot chests by tier (grants any owed by level-ups first).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/chests", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const [chests, goldRow, windfall] = await Promise.all([
                getChests(buyer.id),
                db.queryOne(`SELECT COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [buyer.id]).catch(() => null),
                // ── AND ANY WINDFALL THEY HAVE NOT BEEN TOLD ABOUT ──────────────────────────────────────
                // Rides on THIS response rather than a poll of its own. The nav already asks this endpoint
                // for a chest count on every game page and again on every refresh event, so a member who has
                // struck lucky finds out on their next screen with no second request anywhere in the app —
                // and a once-a-year drop is not worth a fetch loop that runs for everybody who has not.
                //
                // CLAIMED HERE, in the same statement that reads it. The guard is in the UPDATE because
                // neon() over HTTP has no transactions: two tabs open at once would otherwise both read the
                // row, both show the celebration and only one of them would be the one that cleared it.
                //
                // Read and clear in ONE statement via a CTE. `RETURNING` on an UPDATE hands back the NEW row,
                // which for this column is always NULL — so the obvious version returns nothing every time.
                // The CTE's SELECT reads the statement's opening snapshot, and `cleared` says whether THIS
                // request was the one that won the race.
                db.queryOne(
                    `WITH prev AS (SELECT windfall_pending AS won FROM mkt_buyer WHERE id = $1),
                       cleared AS (UPDATE mkt_buyer SET windfall_pending = NULL
                                    WHERE id = $1 AND windfall_pending IS NOT NULL RETURNING 1)
                     SELECT (SELECT won FROM prev) AS won, (SELECT COUNT(*) FROM cleared) AS claimed`,
                    [buyer.id]).catch(() => null),
            ]);
            return noStore({
                chests, gold: goldRow?.gold || 0,
                windfall: Number(windfall?.claimed) > 0 ? windfall.won : null,
            });
        } catch (error) {
            return internalError(error, { event: "marketplace.chests.get.failure" });
        }
    });
}

// POST — open one chest. Body: { tier }. Returns the reveal (item or gold) + updated chest list.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/chests", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const res = await openChest(buyer.id, String(body?.tier || ""));
            if (!res.ok) return noStore({ error: res.error }, { status: 400 });
            after(() => bumpQuestProgress(buyer.id, "chest_open", 1));
            // Chests DO NOT drop badges. A badge is meant to say you did a thing; a 4% roll on a chest said
            // only that you opened a chest, and it handed out achievement badges — "Forged a single item to
            // +10", "Jackpot" — to members who had never done either. It also had the Mark of Shame in its
            // pool, which is reserved and got dropped to a random opener.
            //
            // Badges are earned by their own auto_rule, granted for the event that matches them, or given by
            // an admin. Never rolled.
            return noStore({ ...res, chests: await getChests(buyer.id) });
        } catch (error) {
            return internalError(error, { event: "marketplace.chests.open.failure" });
        }
    });
}
