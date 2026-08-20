import { after, NextResponse } from "next/server";

import { getChests, openChest, openChests } from "@/lib/marketplace/chests.js";
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
            const [chests, goldRow] = await Promise.all([
                getChests(buyer.id),
                db.queryOne(`SELECT COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [buyer.id]).catch(() => null),
            ]);
            return noStore({ chests, gold: goldRow?.gold || 0 });
        } catch (error) {
            return internalError(error, { event: "marketplace.chests.get.failure" });
        }
    });
}

// POST — open a chest. Body: { tier } opens ONE and returns its reveal, which is what the celebration
// animates. { all: true } opens a pile — a whole tier with `tier`, or everything you hold without one — and
// returns every reveal in `opens` for the summary instead. Both go through openChest, so a chest opened in
// bulk rolls exactly what a chest opened alone rolls.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/chests", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer();
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            const bulk = Boolean(body?.all);
            const res = bulk
                ? await openChests(buyer.id, { tier: body?.tier ? String(body.tier) : null, max: body?.max })
                : await openChest(buyer.id, String(body?.tier || ""));
            if (!res.ok) return noStore({ error: res.error }, { status: 400 });
            // BY THE CHEST, not by the tap — ten opened in one press is ten chests of quest progress, which is
            // the same rule the smelter's batch follows.
            const progressed = bulk ? res.opened : 1;
            after(() => bumpQuestProgress(buyer.id, "chest_open", progressed));
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
