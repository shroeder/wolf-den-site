import "server-only";

import { db } from "@/lib/db";
import { equipMemo } from "@/lib/marketplace/equip-cache.js";
import { toolBonusPct } from "@/lib/marketplace/grove-recipes.js";

// ── WHAT A GROVE TOOL IS WORTH TO ITS SYSTEM ─────────────────────────────────────────────────────────────────
// Luke: "My idea was for you to craft different tiers of these utility items as you progress through maps."
//
// Six tools, six systems, one accessor. A rod helps fishing and nothing else — which is why this is NOT folded
// into fortuneFor(): fortune is a single global number, and adding tools to it would mean a fishing rod making
// the mine luckier.
//
// ⚠️ MEMOISED ON THE IN-FLIGHT PROMISE, which is the only version of caching that helps here. A fishing cast
// or a harvest asks for its tool inside a Promise.all alongside everything else it needs; callers that arrive
// before the first answer exists all miss a value cache and every one of them sends a query. equipMemo stores
// the PROMISE, so a request asks once no matter how many places want the answer. Same fix, same reason, as
// fortune-server.js — see the long note in equip-cache.js.
//
// This is the cost half of the balance Luke asked for: server-authoritative (the tier lives in the database
// and the client cannot assert it) for the price of at most one query per request.
async function loadTools(buyerId) {
    const rows = await db.query(
        `SELECT slot, tier FROM mkt_grove_tool WHERE buyer_id = $1`, [buyerId],
    ).catch(() => []);
    return Object.fromEntries((rows || []).map((r) => [r.slot, Number(r.tier) || 0]));
}

/** Every tool tier this member holds, as { slot: tier }. One query per request, shared. */
export async function groveTools(buyerId) {
    if (!buyerId) return {};
    return equipMemo("grovetools", buyerId, () => loadTools(buyerId));
}

/**
 * The percentage bonus a member's tool gives its own system, as a NUMBER (3 means +3%).
 *
 * Returns 0 for no tool, which is what every caller wants — a system that has never heard of the Grove must
 * behave exactly as it did before, and `+0%` is the honest way to say that.
 */
export async function groveToolPct(buyerId, slot) {
    const tools = await groveTools(buyerId).catch(() => ({}));
    return toolBonusPct(tools?.[slot] || 0);
}

/** The same thing as a multiplier, for the many callers that want to scale a yield. */
export async function groveToolMult(buyerId, slot) {
    return 1 + (await groveToolPct(buyerId, slot)) / 100;
}
