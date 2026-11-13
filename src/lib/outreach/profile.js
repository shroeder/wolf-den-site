import "server-only";

import { db } from "@/lib/db";

import { classify } from "./taxonomy.js";

// ── WHAT ONE MEMBER IS INTO, READ OFF WHAT THEY PAID FOR ─────────────────────────────────────────────────────
// Luke: "We have a relationship to know what kind of items they're interested in, whether it's low-end,
// medium, high-end, singles, Pokemon, Yu-Gi-Oh, One Piece, Magic, whether they're into plushies or whatever."
//
// All four of those axes come out of the cached purchase lines with no model involved, which matters for a
// reason beyond cost: when somebody asks why they got an email, the answer has to be a sentence about their
// own receipts. `reason` on the profile is that sentence, and it is built here rather than written in the
// template so it can never describe a different match than the one that was made.
//
// ── WEIGHTED BY MONEY, NOT BY COUNT ──────────────────────────────────────────────────────────────────────────
// Counting lines would make somebody who bought one $300 card and four $4 packs a pack buyer. Spend is the
// honest signal of what somebody is in the shop FOR, and it is also the number the discount has to respect.

const median = (xs) => {
    if (!xs.length) return 0;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const quantile = (xs, p) => {
    if (!xs.length) return 0;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

const topKey = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

/**
 * Build taste profiles for a set of members in ONE query.
 *
 * ⚠️ IT TAKES A LIST AND NOT AN ID. The cron profiles the whole cohort at once; a per-member version would be
 * 87 round trips on the HTTP driver to answer one question, which is exactly the shape CLAUDE.md calls family
 * A and the reason the nav once cost 111 round trips to read two fields.
 */
export async function profilesFor(buyerIds) {
    const out = new Map();
    if (!buyerIds?.length) return out;

    const rows = await db.query(
        `SELECT buyer_id, variation_id, name, category, amount_cents, quantity, bought_at
           FROM mkt_purchase_line WHERE buyer_id = ANY($1) ORDER BY bought_at DESC`,
        [buyerIds]
    ).catch(() => []);

    const byBuyer = new Map();
    for (const r of rows) {
        if (!byBuyer.has(r.buyer_id)) byBuyer.set(r.buyer_id, []);
        byBuyer.get(r.buyer_id).push(r);
    }

    for (const [buyerId, lines] of byBuyer) {
        const games = new Map();
        const formats = new Map();
        const kinds = new Map();
        const bought = new Set();
        const unitPrices = [];
        let spend = 0;

        for (const l of lines) {
            const cents = Math.max(0, Number(l.amount_cents) || 0);
            const qty = Math.max(1, Number(l.quantity) || 1);
            const { game, format, kind } = classify(l.category);
            spend += cents;
            if (l.variation_id) bought.add(l.variation_id);
            if (game) games.set(game, (games.get(game) || 0) + cents);
            if (format) formats.set(format, (formats.get(format) || 0) + cents);
            if (kind) kinds.set(kind, (kinds.get(kind) || 0) + cents);
            // The per-ITEM price, which is what a recommendation has to match — not the line total. Somebody
            // who buys four $4 packs at once is a $4 buyer, and the line says $16.
            if (cents > 0) unitPrices.push(Math.round(cents / qty));
        }

        const game = topKey(games);
        const format = topKey(formats);
        const kind = topKey(kinds);
        const typical = median(unitPrices);
        const ceiling = quantile(unitPrices, 0.9);

        out.set(buyerId, {
            buyerId,
            game, format, kind,
            lines: lines.length,
            spendCents: spend,
            lastBoughtAt: lines[0]?.bought_at || null,
            boughtVariationIds: [...bought],
            typicalCents: typical,
            // ── THE BAND ────────────────────────────────────────────────────────────────────────────────
            // Wide enough that there is something to show, narrow enough that a $4 pack buyer is not sent a
            // $287 card. Anchored on what they actually pay rather than on a fixed "low/medium/high" ladder,
            // because the ladder's cut points would be a guess and this is a measurement.
            bandLoCents: Math.max(100, Math.round(typical * 0.4)),
            bandHiCents: Math.max(2500, Math.round(Math.max(typical * 2.5, ceiling * 1.5))),
            topNames: lines.slice(0, 3).map((l) => l.name).filter(Boolean),
            allNames: lines.map((l) => l.name).filter(Boolean),
        });
    }
    return out;
}

/** The one sentence that explains the match, in the member's own receipts. */
export function reasonFor(profile, { GAME_LABEL, KIND_LABEL }) {
    if (!profile) return "";
    const g = profile.game ? GAME_LABEL[profile.game] : null;
    const f = profile.format === "single" ? "singles" : profile.format === "sealed" ? "sealed" : null;
    if (g && f) return `${g} ${f}`;
    if (g) return g;
    if (profile.kind && profile.kind !== "card") return KIND_LABEL[profile.kind] || profile.kind;
    return "the shop";
}
