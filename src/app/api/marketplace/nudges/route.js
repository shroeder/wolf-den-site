import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { withRequestLogging } from "@/lib/server-logger";
import { nextUnlockPayload } from "@/lib/marketplace/unlocks.js";
import { getHappyHourState } from "@/lib/marketplace/happy-hour-core.js";
import { pendingRecipeReveals } from "@/lib/marketplace/cooking.js";
import { pendingBadge } from "@/lib/marketplace/badge-pop.js";

// ── THE FOUR THINGS THAT MIGHT POP AT YOU, ASKED ONCE ────────────────────────────────────────────────────────
// RewardNudge, HappyHourWatcher, RecipeFoundWatcher and BadgePop are all mounted in the root layout, so they
// run on EVERY page of the public site — the shop, a product page, the marketplace, all of it. Four components
// asking four endpoints the same question ("is there anything to show this member?") is four authentications
// and four invocations on every page load, for a reply that is almost always "no" four times over.
//
// They share one request now. See src/lib/nudge-feed.js for the client half: the components still each own
// their own card and their own dismissal, they just stop each buying their own answer.
//
// The individual routes still exist and still work — /api/marketplace/badge-pop is also how a badge gets
// ACKNOWLEDGED, and recipe-found the same. Only the read is shared.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/nudges", async () => {
        const buyer = await getAuthenticatedBuyer().catch(() => null);
        const id = buyer?.id || null;
        const safe = async (p, fallback) => { try { return await p; } catch { return fallback; } };
        const [unlock, happy, recipes, badge] = await Promise.all([
            safe(nextUnlockPayload(id), { authed: false }),
            safe(getHappyHourState(id), null),
            id ? safe(pendingRecipeReveals(id), []) : [],
            id ? safe(pendingBadge(id), null) : null,
        ]);
        const res = NextResponse.json({
            authed: Boolean(id),
            nextUnlock: unlock,
            happyHour: happy,
            recipes: { pending: recipes || [] },
            badge: { badge: badge || null },
        });
        res.headers.set("Cache-Control", "no-store");
        return res;
    });
}
