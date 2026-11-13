import "server-only";

import { db } from "@/lib/db";

import { productHandle } from "@/lib/inventory-feed/product-url";
import { SITE_URL } from "@/lib/site";

import { offerFor, offerIsSafe } from "./offer.js";
import { entitiesOf } from "./patterns.js";
import { classify } from "./taxonomy.js";

// ── CHOOSING THE FEW ITEMS ───────────────────────────────────────────────────────────────────────────────────
// Luke: "we should send them a reminder about items we have in store that we think are relevant to them. Not
// too many, just like a few, with images and like a discount, like that isn't gonna make us lose margin."
//
// Three, and every one of them has to clear four gates: in stock, has a photo, matches what this person buys,
// and — if it carries a number off the price — passes the margin rule. An item that fails only the last gate
// still goes out, at full price. [[rewards-must-be-scoped]]

export const PICK_COUNT = 3;

/** One pool read, shared by the whole cohort. 2,057 in-stock rows is small and 87 queries is not. */
export async function loadPool() {
    const rows = await db.query(
        `SELECT f.variation_id, f.name, f.image_url, f.price, f.category_names AS category,
                f.consigned, f.last_change_at, f.quantity, c.unit_cost_cents
           FROM inventory_feed f
           LEFT JOIN wolfden_item_cost c ON c.variation_id = f.variation_id
          WHERE f.in_stock = TRUE
            AND f.price IS NOT NULL AND f.price > 0
            AND f.image_url IS NOT NULL AND f.image_url <> ''`
    ).catch(() => []);

    return rows.map((r) => {
        const priceCents = Math.round(Number(r.price) * 100);
        const unitCostCents = r.unit_cost_cents == null ? null : Number(r.unit_cost_cents);
        const consigned = r.consigned === true;
        const offer = offerFor({ priceCents, unitCostCents, consigned });
        // ⚠️ THE GUARD RUNS HERE, ON EVERY ITEM, BEFORE ANYTHING CAN BE CHOSEN. offerFor already applies the
        // rule; this asks the question again from the raw price and cost so the two have to agree. An offer
        // that fails is dropped to full price rather than dropped from the pool — the item is still relevant,
        // it just stops carrying a number.
        const safe = offerIsSafe(offer, { priceCents, unitCostCents, consigned });
        return {
            ...r,
            priceCents,
            unitCostCents,
            consigned,
            offer: safe ? offer : null,
            // Luke, 2026-11-13: "ensure we can have a direct link to that product online." The shop already
            // builds these for the Google feed; this is the same function, so an email and a Merchant
            // listing can never point at different pages for one card.
            url: `${SITE_URL}/shop/${productHandle(r.name, r.variation_id)}`,
            entities: entitiesOf(r.name),
            ...classify(r.category),
        };
    });
}

/**
 * The best few items for one profile, most relevant first.
 *
 * Scored rather than filtered: a filter chain that demands an exact category match returns nothing for the
 * member whose category happens to be empty today, and an email with no items is worse than one with a near
 * miss. Everything that can match is ranked, and the top three win.
 */
export function pickFor(profile, pool, claimed = null, count = PICK_COUNT) {
    if (!profile) return [];
    const bought = new Set(profile.boughtVariationIds || []);
    const now = Date.now();

    const scored = [];
    for (const item of pool) {
        if (bought.has(item.variation_id)) continue;        // they already own this exact one
        // ⚠️ A SINGLE IS ONE PHYSICAL CARD. The first preview put "Mew EX (Full Art)" in three of five
        // emails, because a high margin and a fresh arrival score well for everybody at once — and there is
        // exactly one of it in the building. Recommending it to the whole cohort means one sale and
        // seventy-four people who drove over for something that was gone, which is worse than not writing to
        // them at all. `claimed` is the shop's actual stock, spent down as the cohort is built.
        if (claimed) {
            const stock = Math.max(1, Math.floor(Number(item.quantity) || 1));
            if ((claimed.get(item.variation_id) || 0) >= stock) continue;
        }

        let score = 0;
        if (profile.game && item.game === profile.game) score += 100;
        else if (item.game && profile.game) score -= 40;     // a different game is an actively wrong guess
        if (profile.format && item.format === profile.format) score += 45;
        // ── ⚠️ A MATCHING KIND IS A HINT, NOT A WALL, AND THIS USED TO BE A HARD FILTER ────────────────
        // Luke, 2026-11-13: "accessories for magic means we can sell them on commander decks. Do you know
        // why? So it situations like that you want to encourage the reason they actually need the sleeves."
        //
        // An 800-card deck case and sleeves is not an interest in deck cases. It is evidence of a FORMAT:
        // Commander decks are 100-card singleton, people own several, they sleeve all of them and the
        // collection needs storing. The thing to sell is the reason the storage exists — a Commander deck,
        // or the staples that go in one — and the shop has 12 of those on the shelf at $60-150 plus 344
        // Magic singles. The old hard filter made that unreachable: it answered a deck-case buyer with a
        // playmat, another deck box and a binder, which is three ways of selling nothing.
        //
        // So the shortlist stays mixed and the model does the inference. See ai-match.js.
        if (profile.kind && item.kind === profile.kind) score += 20;

        // Inside the band they actually spend in.
        if (item.priceCents >= profile.bandLoCents && item.priceCents <= profile.bandHiCents) score += 60;
        else {
            const d = item.priceCents < profile.bandLoCents
                ? profile.bandLoCents / Math.max(1, item.priceCents)
                : item.priceCents / Math.max(1, profile.bandHiCents);
            score -= Math.min(70, (d - 1) * 30);
        }

        // A real offer is the reason to open the email, so it is worth something — but less than relevance,
        // because a discount on the wrong game is still the wrong game.
        if (item.offer) score += 15 + item.offer.pct;

        // Newly arrived stock is the actual news. Decays over a month.
        const age = item.last_change_at ? (now - new Date(item.last_change_at).getTime()) / 86400000 : 999;
        if (age < 30) score += Math.round(20 * (1 - age / 30));

        if (score > 0) scored.push({ ...item, score });
    }

    scored.sort((a, b) => b.score - a.score || b.priceCents - a.priceCents);

    // ⚠️ NOT JUST THE TOP THREE. Three rows of the same card at three conditions is a worse email than three
    // different cards, and the pool is full of near-duplicates: "Umbreon (13) 13/75 Holo Rare HP" and the NM
    // copy sit next to each other on score. Dedupe on the name with its condition and grade suffix removed.
    const seen = new Set();
    const perCategory = new Map();
    const out = [];
    for (const item of scored) {
        const key = String(item.name || "").replace(/\b(NM|LP|MP|HP|DMG|PSA\s*\d+|BGS\s*\d+)\b/gi, "").replace(/\s+/g, " ").trim().toLowerCase();
        if (seen.has(key)) continue;

        // ⚠️ AND A CAP PER CATEGORY WHEN BUILDING A SHORTLIST. 1,039 of the 2,057 in-stock items are Pokémon
        // singles, so raw score hands the model twenty-four of them and calls it a choice. A shortlist that
        // contains only one kind of thing cannot be re-ranked into a better kind of thing — the inference
        // this is all for would have nothing to land on.
        const cat = item.category || "-";
        if (count > PICK_COUNT) {
            const cap = Math.max(3, Math.ceil(count / 4));
            if ((perCategory.get(cat) || 0) >= cap) continue;
            perCategory.set(cat, (perCategory.get(cat) || 0) + 1);
        }

        seen.add(key);
        out.push(item);
        if (claimed) claimed.set(item.variation_id, (claimed.get(item.variation_id) || 0) + 1);
        if (out.length >= count) break;
    }
    return out;
}
