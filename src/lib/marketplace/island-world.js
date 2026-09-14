// ── THE GROUND YOU WALK ON ───────────────────────────────────────────────────────────────────────────────────
// Luke: "the idea of our boat landing ashore and being able to walk on unique islands."
//
// An island is a STRIP of nodes. You beach somewhere along it, you walk left or right a step at a time, and
// what is standing at each step is a pure function of the chart's seed and the step's own index — so the same
// chart always makes the same island, and walking back the way you came shows you the same wreck.
//
// ⚠️ FINITE, UNLIKE THE WOOD. forest-world.js generates forever because the Forest's limiter is regrowth. An
// island ends, and the two limiters it has — its own far shore and the tide — are what make a chart something
// you SPEND. Luke chose this shape explicitly over an endless one: "a finite island, walked out in ~2 min."
//
// ⚠️ AND THE GENERATION IS THE ANTI-CHEAT, exactly as it is in the wood. The browser builds the island and
// plays it — a tap-to-step world that asks the server what is at the next node costs one request per footfall,
// the most expensive shape in this codebase. A claim of "I took node 17" is checked by the server generating
// node 17 for itself and asking whether that is a takeable thing and what it could possibly have been worth.
// See [[world-hash]] in world-hash.js for why that function lives alone.
//
// PURE. islands.js holds what an island IS, this holds how it is laid out, and expedition.js is the only half
// that writes a row or pays anybody.

import { hash, pickWeighted } from "@/lib/marketplace/world-hash.js";
import { NODE_KINDS, NODE_WEIGHTS, RICHNESS, biomeOf, islandById } from "@/lib/marketplace/islands.js";

// ── SPACING ──────────────────────────────────────────────────────────────────────────────────────────────────
// World pixels between nodes. Wider than the wood's 150 because an island prop is a wreck or a shrine rather
// than a tree trunk, and two of them at 150 apart overlap at the sizes they are drawn.
export const NODE_GAP = 190;
// ── HOW LONG A STEP TAKES ────────────────────────────────────────────────────────────────────────────────────
// ⚠️ THIS IS THE PACE OF THE WHOLE FEATURE AND IT WAS WRONG BY A FACTOR OF THREE. The first cut was 260ms —
// the Forest's pace, where you are moving THROUGH a wood — and the simulator priced a whole island at eleven
// seconds. An island is a place you SEARCH; the walk wants to be unhurried enough that looking at the thing
// coming up on the right is part of it. At 850ms a forty-step tide is a shade over half a minute of walking,
// and the rest of Luke's two minutes is the dozen things you stop at.
export const STEP_MS = 850;
// Rough dwell times, used ONLY by the simulator to price an island in wall-clock. The real ones are however
// long the player takes; these exist so "about two minutes" can be checked rather than asserted.
export const DWELL_MS = { wreck: 3200, cache: 2800, forage: 2400, shrine: 3600, fix: 7000, dig: 26000, warden: 40000 };

// ── WHAT IS TAKEABLE, AND WHAT IS SCENERY ────────────────────────────────────────────────────────────────────
// `empty` is ground. Everything else is a thing you can walk up to and act on — and `dig` and `warden` are the
// two that hand you off to a minigame that already exists rather than paying out here.
export const TAKEABLE = new Set(["wreck", "cache", "forage", "shrine", "fix"]);
export const OPENS_DIG = "dig";
export const OPENS_FIGHT = "warden";

// ── THE STRIP ────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * What stands at `index` on this island, for this chart. Deterministic, pure, and the server's copy of truth.
 *
 * `fixIndex` has to be passed in rather than recomputed here, because it is decided by chart-plot.js — the
 * same file that decides where you beach, since the two are measured against each other. Recomputing it in a
 * second place is exactly the drift that [[reuse-the-rule-never-restate-it]] is about.
 */
export function nodeAt(seed, islandId, index, fixIndex) {
    const isle = islandById(islandId);
    const i = Math.max(0, Math.floor(index));
    const x = i * NODE_GAP;
    // The lane a thing stands in, so the island has depth — further back is smaller and hazier, and the walk
    // does not read as a single flat row of cut-outs.
    const lane = hash(seed ^ 0x3c0a, i);
    if (!isle) return { i, x, kind: "empty", lane };

    // The mark is the mark. Nothing rolls over it.
    if (i === Math.round(fixIndex)) return { i, x, kind: "fix", lane: 0.5, biome: isle.biome, prize: isle.prize };

    // ── BOTH SHORES ARE BEACH ────────────────────────────────────────────────────────────────────────────
    // The first and last two nodes are always empty. You have to be able to LAND somewhere, and a wreck
    // occupying the node you beached on means the expedition opens with a modal instead of a view of an
    // island. Same reason the wood keeps an empty share: the walk needs air in it.
    if (i <= 1 || i >= isle.span - 2) return { i, x, kind: "empty", lane };

    const kind = pickWeighted(NODE_WEIGHTS[isle.biome] || NODE_WEIGHTS.coral, hash(seed ^ 0x6b21, i));
    if (kind === "empty") return { i, x, kind: "empty", lane };

    // `size` is a per-node roll the payout reads, so two wrecks on the same beach are not worth the same. It
    // is generated rather than stored for the same reason the node is: the server can ask for it again.
    const size = hash(seed ^ 0x8d3f, i);
    return { i, x, kind, lane, size, biome: isle.biome, name: NODE_KINDS[kind]?.name || "", blurb: NODE_KINDS[kind]?.blurb || "" };
}

/** The whole island in one array. It is at most fifty-four nodes — there is no reason to page it. */
export function layout(seed, islandId, fixIndex) {
    const isle = islandById(islandId);
    if (!isle) return [];
    const out = [];
    for (let i = 0; i < isle.span; i += 1) out.push(nodeAt(seed, islandId, i, fixIndex));
    return out;
}

/** A tally of what is actually standing on this island, for the sim and for the landfall card. */
export function census(seed, islandId, fixIndex) {
    const out = {};
    for (const n of layout(seed, islandId, fixIndex)) out[n.kind] = (out[n.kind] || 0) + 1;
    return out;
}

// ── WHAT A NODE IS WORTH ─────────────────────────────────────────────────────────────────────────────────────
// Described here, PAID in expedition.js. Keeping the description pure is what lets the simulator price a whole
// island without a database, and what lets the client show you what you just picked up without waiting for a
// round trip to tell it.
//
// Everything scales off the island's RUNG, which is the only difficulty number in the archipelago. A wreck on
// Tallow Key and a wreck on The Last Green Thing are the same verb and very different money.
//
// ⚠️ DOUBLOONS, NOT GOLD. Sailing has always paid in doubloons and the gold mint rate is a single lever
// elsewhere — see [[gold-mint-rate-lever]]. An island that minted gold directly would be a second, unmetered
// tap into the same economy.
export function nodeValue(node, rung) {
    const r = Math.max(1, Number(rung) || 1);
    const size = Number(node?.size) || 0;
    // See RICHNESS in islands.js: the biome decides WHAT you find, the rung decides what it is worth, and this
    // is the factor that stops a salvage coast quietly out-paying an island eight rungs above it.
    const rich = RICHNESS[node?.biome] ?? 1;
    const coin = (n) => Math.round(n * rich);
    switch (node?.kind) {
        case "wreck":
            // Salvage: coin, and at depth a forge part off the same tier ladder the fleet uses.
            return {
                doubloons: coin((8 + r * 2.4) * (0.7 + size * 0.8)),
                parts: size > 0.72 ? { tier: Math.max(1, Math.min(5, Math.ceil(r / 5))), n: 1 } : null,
            };
        case "cache":
            // Somebody buried this shallow and in a hurry, so it is coin and occasionally a chest.
            return {
                doubloons: coin((5 + r * 1.6) * (0.7 + size * 0.9)),
                chest: size > 0.86 ? (r >= 16 ? "gold" : r >= 8 ? "iron" : "wooden") : null,
            };
        case "forage":
            // The island's own growth. Pays a consumable through the existing tables, never a new currency.
            return { forage: true, doubloons: coin(2 + r * 0.8) };
        case "shrine":
            // Old, and it pays in what old things pay in: experience, and rarely the thing pets ascend on.
            return { xp: Math.round(12 + r * 5), stone: size > 0.88 };
        case "fix":
            // The signature prize. Declared on the island, granted by expedition.js. NOT scaled by richness —
            // the thing the chart was for is worth what the chart's island is worth, full stop.
            return { prize: true, doubloons: Math.round(20 + r * 6) };
        default:
            return {};
    }
}

/** Total coin an island could pay if you took every single thing on it. The sim's headline number. */
export function islandPurse(seed, islandId, fixIndex) {
    const isle = islandById(islandId);
    if (!isle) return 0;
    return layout(seed, islandId, fixIndex)
        .reduce((n, node) => n + (nodeValue(node, isle.rung).doubloons || 0), 0);
}

// ── THE WALK ─────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Can this member legally be standing at `to`, having spent `spent` steps of a `tide`-step budget?
 *
 * The client owns the walk, so the server never sees the footfalls — it sees a claim to be somewhere. This is
 * the whole of the arbitration: you cannot be off the island, and you cannot have got there in fewer steps
 * than the strip requires. It is deliberately a FLOOR, not an exact count — doubling back is legal and costs
 * real steps, so a member who wandered has spent more than this, never fewer.
 */
export function reachable({ span, entry, to, spent, tide }) {
    const n = Math.max(1, Number(span) || 1);
    const t = Math.round(Number(to));
    if (!Number.isFinite(t) || t < 0 || t >= n) return false;
    const minSteps = Math.abs(t - Math.round(Number(entry) || 0));
    return Number(spent) >= minSteps && Number(spent) <= Number(tide);
}
