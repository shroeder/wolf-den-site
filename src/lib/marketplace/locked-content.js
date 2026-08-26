import "server-only";

import { hasUnlock } from "@/lib/marketplace/casino-perks.js";
import { MASTER_RECIPES } from "@/lib/marketplace/cooking-recipes.js";

// ── THINGS THAT ARE NOT SUPPOSED TO EXIST YET ────────────────────────────────────────────────────────────────
// Two of the Counter's doors put new CONTENT into the world rather than a new screen: the Deep Water Charts add
// six species to the sea, and the Master's Book adds a tier to the kitchen. casino-perks.js states the rule
// they are sold under, and it is a strong one — "a locked feature must not appear in a list, must not be
// reachable by guessing an id, and must not be produced by any roll" — with the reasoning that nothing should
// hint at what is behind a door until it is open.
//
// The gates were all written on the PRODUCING side. The sea will not give a non-owner a deep fish and the
// kitchen will not roll them a master page. Nobody wrote the gate on the side where an owner's catch meets
// somebody else's screen, and there are two of those:
//
//   THE MARKET, where an owner can list a deep-water fish or a master prep for gold and every member in the
//   Den sees the stall. Luke: "the other players who haven't unlocked that tier should not be able to see
//   those in the market... you shouldn't be allowed to trade them with someone who hasn't unlocked it."
//
//   THE FISHING BOARDS, where the Den's best catches are ranked across everybody. denFishRecords was already
//   built off the ordinary species list and is fine; denTopCatches resolves whatever id is in the row, so one
//   owner landing a Lantern Eel put its name, its weight and its picture in front of the whole membership.
//   Luke: "you shouldn't even know about their existence."
//
// ── WHY THIS IS A REF LIST AND NOT A FLAG ON EACH FEATURE ────────────────────────────────────────────────────
// Because the leak is always at a JOIN — a listing row, a catch row, a stall — where the only thing to hand is
// an id, and the code doing the joining has no idea it is holding restricted content. A predicate that takes a
// bare ref and answers "may this member see this" is the only shape that can be applied at those points.
//
// Derived rather than typed: the deep species come from fishing's own DEEP_FISH and the master preps from
// MASTER_RECIPES, so adding either kind of content puts it behind the gate automatically. That is the whole
// reason the list is built here instead of being a constant somebody has to remember to extend.

/** Ref → the perk that has to be owned before that ref may be seen. */
export async function lockedRefs() {
    const { DEEP_FISH_IDS } = await import("@/lib/marketplace/fishing.js");
    const out = new Map();
    for (const id of DEEP_FISH_IDS) out.set(id, "fish_deep");
    // A master PREP lands in the pantry as an ingredient, which is what makes it listable on the market. A
    // master DISH becomes a consumable and consumables are not market goods, so it cannot leak this way — but
    // it is included anyway, because the cost of covering a surface that does not exist yet is nothing and the
    // cost of missing one that appears later is this whole class of bug again.
    for (const r of MASTER_RECIPES) {
        if (r.out) out.set(r.out, "recipe_master");
        out.set(r.id, "recipe_master");
    }
    return out;
}

/**
 * The refs this member may NOT be shown, as a Set. Empty for somebody who owns both doors.
 *
 * Two primary-key reads and a build over a couple of dozen ids, so it is cheap enough to call per request —
 * and it MUST be per request rather than cached across members, because the whole point is that the answer
 * differs by who is asking.
 */
export async function hiddenRefsFor(buyerId) {
    const locked = await lockedRefs();
    if (!buyerId) return new Set(locked.keys());
    const perks = [...new Set(locked.values())];
    const owned = new Set();
    await Promise.all(perks.map(async (p) => {
        if (await hasUnlock(buyerId, p).catch(() => false)) owned.add(p);
    }));
    const out = new Set();
    for (const [ref, perk] of locked) if (!owned.has(perk)) out.add(ref);
    return out;
}

/** True when this member is allowed to see, buy, or be handed this ref. */
export async function canSeeRef(buyerId, ref) {
    if (!ref) return true;
    const hidden = await hiddenRefsFor(buyerId);
    return !hidden.has(String(ref));
}
