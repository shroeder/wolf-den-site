import "server-only";
import { actPerks } from "@/lib/marketplace/act-board.js";

import { db } from "@/lib/db";
import { equipMemo } from "@/lib/marketplace/equip-cache.js";
import { toolArt } from "@/lib/marketplace/grove-catalog.js";
import { bandTint, qualityBand } from "@/lib/marketplace/grove-forge.js";
import { toolBonusPct, TOOL_SLOTS, toolNumeral } from "@/lib/marketplace/grove-recipes.js";

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
    const [tools, perks] = await Promise.all([
        groveTools(buyerId).catch(() => ({})),
        actPerks(buyerId).catch(() => ({})),
    ]);
    return sumToolPct(tools?.[slot] || 0, perks?.[slot]);
}

// ── ⚠️ THE ONE PLACE THE TWO SOURCES ARE ADDED UP ────────────────────────────────────────────────────────────
// Extracted so groveToolPct and groveToolCase cannot drift. They answer the same question at different
// widths — one slot, or all twelve — and a second copy of "tier bonus plus act perk" is exactly the shape
// this codebase has been bitten by: see the note above about a fifth stat source applying in the half of the
// game somebody remembered to wire.
function sumToolPct(tier, perkPct) {
    // ── ⚠️ ACT QUEST PERKS ARE SUMMED IN HERE, AND THAT IS THE WHOLE POINT ──────────────────────────────
    // The act boards reward "relevant passive buffs to each system that they're all about". This function is
    // already read by arena, boss, cooking, crafting, delves, delve-floors, mining, farm, fishing and
    // sailing — a dozen live call sites that each ask one question: what percentage does this member get in
    // this system. Adding the perk HERE means every one of them picks it up unchanged.
    //
    // The alternative was a second per-player bonus source read beside this one at each site, which is the
    // shape this codebase has been burned by: combat already reads four stat sources, and a fifth is a
    // bonus that silently applies in the half of the game somebody remembered to wire.
    return toolBonusPct(tier) + (Number(perkPct) || 0);
}

/** The same thing as a multiplier, for the many callers that want to scale a yield. */
export async function groveToolMult(buyerId, slot) {
    return 1 + (await groveToolPct(buyerId, slot)) / 100;
}

// ── ALL TWELVE TOOLS, FOR A SCREEN RATHER THAN FOR A ROLL ────────────────────────────────────────────────────
// Eric, 2026-11-09: "Anyone who has the ability to get crafting gear in the game from the grove needs to have
// their equipment screen extended. Maybe a second tab to swap between gear and crafting gear."
//
// The twelve tools pay into fishing, mining, digging, the forge, the farm, sailing, cooking, pets, delves,
// the jeweller, the arena and the weekly boss — the whole game — and until now the ONLY place a member could
// see them was a shelf inside the Grove. A bonus that applies everywhere and is visible in one room is a
// bonus players do not know they have.
//
// ⚠️ TWO QUERIES FOR TWELVE ANSWERS, NOT TWENTY-FOUR. The obvious build is to loop groveToolPct over
// TOOL_SLOTS, and it would cost twelve round trips: groveTools is memoised on the in-flight promise but
// `actPerks` is not, so each call sends its own `SELECT slot, pct FROM mkt_act_perk`. That is the family-A
// waste CLAUDE.md opens with — a caller reaching for the convenient existing function instead of the narrow
// one. Both sources are loaded once here and summed by the SAME sumToolPct the per-slot accessor uses, so
// this cannot report a different number than the game pays.
//
// ⚠️ THE PCT IS WHAT THE GAME ACTUALLY PAYS, WHICH IS *NOT* WHAT THE GROVE'S OWN SHELF PRINTS. groveState's
// `toolMeta` reports `toolBonusFor(tier, quality)` — the tier multiplied by the quality band, up to 1.9x —
// and its comment claims that is "what the tool actually gives". It is not: every one of the twelve live
// consumers reads groveToolPct, which multiplies by nothing. So a Masterwork tool is advertised in the Grove
// at nearly double what it delivers. That is a real defect and it is NOT papered over here — this screen
// states the paid number and the band separately. Whichever way the discrepancy is settled (pay the band, or
// stop claiming it), this function follows automatically because it asks the live accessor's own rule.
export async function groveToolCase(buyerId) {
    if (!buyerId) return null;
    const [rows, perks] = await Promise.all([
        db.query(`SELECT slot, tier, quality, reworks FROM mkt_grove_tool WHERE buyer_id = $1`, [buyerId])
            .catch(() => []),
        actPerks(buyerId).catch(() => ({})),
    ]);
    const held = new Map((rows || []).map((r) => [r.slot, r]));
    const slots = TOOL_SLOTS.map((t) => {
        const row = held.get(t.slot) || null;
        const tier = Number(row?.tier) || 0;
        // A null quality is the floor, not a crash — same rule as toolBonusFor. Tools made before quality
        // existed read as Rough, which is what they were worth when they were made.
        const band = qualityBand(row?.quality ?? null);
        const perkPct = Number(perks?.[t.slot]) || 0;
        return {
            slot: t.slot,
            name: t.name,
            system: t.system,
            bonus: t.bonus,
            tier,
            numeral: tier > 0 ? toolNumeral(tier) : null,
            quality: row?.quality == null ? null : Number(row.quality),
            band: { id: band.id, name: band.name, tint: bandTint(band.id) },
            reworks: Number(row?.reworks) || 0,
            // The tier's share and the act-quest perk's share, kept apart: a member who sees "+9%" and owns
            // a tier II tool worth 6% should be able to find the other 3% rather than think the maths is wrong.
            toolPct: toolBonusPct(tier),
            perkPct,
            pct: sumToolPct(tier, perkPct),
            art: toolArt(t.slot, tier),
        };
    });
    return {
        slots,
        // What the tab strip needs to decide whether to draw itself at all, without re-counting on the client.
        heldCount: slots.filter((s) => s.tier > 0).length,
        total: slots.length,
    };
}
