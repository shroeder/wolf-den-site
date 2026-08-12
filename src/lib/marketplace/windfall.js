import "server-only";

import { db } from "@/lib/db";
import { addChests } from "@/lib/marketplace/chests.js";
import { WINDFALL_TIERS, windfallWeight } from "@/lib/marketplace/windfall-odds.js";

// ── THE WINDFALL ────────────────────────────────────────────────────────────────────────────────────────────
// The four rarest chests drop from ORDINARY PLAY, out of every system in the game that hands out loot. The
// odds, the per-system weights and the deny-list live in windfall-odds.js, which is pure so the balance
// script can read the same numbers the server runs. This half is the granting and the telling.

const LABEL = {
    ascendant: "an Ascendant Chest", eternal: "an Eternal Chest",
    celestial: "a Celestial Chest", primordial: "a Primordial Chest",
};

/**
 * Roll for a windfall on one loot event.
 *
 * PURE FIRST, DB SECOND, and that ordering is the only reason this can sit on the hot path. logCoin fires
 * roughly 29,000 times a month; a query per call would be 29,000 round trips to buy about four grants. The
 * roll is Math.random against a constant, so the overwhelmingly common answer — "no" — costs nothing at all
 * and never touches the database.
 *
 * Returns the tier granted, or null. Never throws: a lottery must not be able to fail the action that earned
 * the ticket.
 */
export async function rollWindfall(buyerId, reason, meta = null) {
    const weight = windfallWeight(reason);
    if (!buyerId || weight <= 0) return null;
    let hit = null;
    // Rarest first, so a single roll can only ever pay one chest and the good one wins the tie.
    for (const t of WINDFALL_TIERS) {
        if (Math.random() < t.chance * weight) { hit = t.tier; break; }
    }
    if (!hit) return null;
    try {
        await addChests(buyerId, { [hit]: 1 }, { source: "windfall", meta: { reason, ...(meta || {}) } });
        // The chest is already theirs. This is only the "and nobody has told them yet" flag, so the
        // celebration can fire the next time they have the game open rather than being lost because the drop
        // landed on a background harvest. Guarded so a second windfall cannot silently overwrite an unseen one.
        await db.query(
            `UPDATE mkt_buyer SET windfall_pending = $2::jsonb WHERE id = $1 AND windfall_pending IS NULL`,
            [buyerId, JSON.stringify({ tier: hit, reason, at: new Date().toISOString() })],
        ).catch(() => {});
        await announce(buyerId, hit, reason);
    } catch {
        // swallowed on purpose — see above
    }
    return hit;
}

/**
 * Tell the world, in proportion to how rare it was.
 *
 * A drop nobody hears about is a number in a database. The Den's own scale decides how loud: an Ascendant is
 * a good day and gets a notification; a Celestial or a Primordial is a thing that happens twice a year and
 * goes to the plaza, where everyone is standing.
 */
async function announce(buyerId, tier, reason) {
    const { trackActivity } = await import("@/lib/marketplace/activity.js");
    // Always lands in the admin Live Feed, so "where did that chest come from" is answerable from the screen
    // that already answers that question for everything else.
    await trackActivity(buyerId, "windfall", { tier, reason }).catch(() => {});

    // BOTH push channels, the same pair the giveaway uses. mkt_push_token is the phone app and is empty in
    // practice; sendWebPush is the one that actually reaches a member's browser, so sending only the first
    // would be a notification nobody receives. Awaited, not fired and forgotten — Vercel kills the function
    // the moment the handler returns and an un-awaited push simply never happens.
    const payload = {
        title: `The sky opened — ${LABEL[tier]}`,
        body: "Something turned up that almost never turns up. It is waiting in your chests.",
        data: { route: "/marketplace/inventory", kind: "windfall", tier },
    };
    await Promise.allSettled([
        import("@/lib/push/web-push.js").then((m) => m.sendWebPush(buyerId, payload)),
        import("@/lib/push/send.js").then((m) => m.sendBuyerPush(buyerId, { title: payload.title, body: payload.body, data: payload.data })),
    ]);
    if (tier !== "celestial" && tier !== "primordial") return;
    // THE PLAZA HEARS ABOUT THE TOP TWO. Posted as the member themselves rather than as a system line, because
    // a name in the feed is the whole point — "who got it" is the question everyone asks first.
    try {
        const { sendTownChat } = await import("@/lib/marketplace/town.js");
        await sendTownChat(buyerId, tier === "primordial"
            ? "A PRIMORDIAL CHEST just dropped for me. I have no idea what to say."
            : "A CELESTIAL CHEST just dropped for me!");
    } catch { /* the chest is granted either way */ }
}
