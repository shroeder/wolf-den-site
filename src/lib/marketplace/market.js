import { db } from "@/lib/db";
import { ingredientMeta, cookingSprites, addToPantry, RECIPES } from "@/lib/marketplace/cooking.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { trackActivity } from "@/lib/marketplace/activity.js";

// ── THE MARKET ───────────────────────────────────────────────────────────────────────────────────────────────
// Members selling each other what the land produces — crops, fish and prepped ingredients — for gold.
//
// SUNFLOWER JINXX ASKED FOR THIS FIRST, in global chat on 2026-08-15: "Would it be possible to be able to
// trade/sell prepped food to people? So many people have said they have a cool recipe, but not the prepable
// required thing." Kaishiern seconded it four hours later ("a good way to help folks and support our little
// economy") and GrayKitsune wanted the same for consumables. Her hero is enshrined on the screen for it, the
// same way Alstier1's is in the Forge — so check the CHAT before crediting anyone, not your memory of it.
//
// It was only worth building once cooking's jackpot rate came down: a market is worth nothing if the goods it
// trades are falling out of the sky.
//
// PUBLIC as of 2026-08-16. The gate is "are you signed in", and it lives HERE as well as on the screen — see
// the ownerOnly landmine: a feature gated in the UI and open at the API is not gated at all.
//
// ── NO TRANSACTIONS. THIS IS THE WHOLE DESIGN. ───────────────────────────────────────────────────────────────
// neon()'s HTTP driver cannot do BEGIN/ROLLBACK, so there is no read-then-write here that holds under two
// people tapping at once. Every state change is ONE guarded UPDATE whose WHERE clause IS the check, and the row
// it returns is the proof it happened:
//
//   list:    goods leave the pantry FIRST (guarded on qty), then the row is written. Nothing is listed that
//            isn't already escrowed, so the same three Starfruit cannot be sold twice and eaten as well.
//   buy:     CLAIM THE LISTING FIRST (guarded on `sold_at IS NULL`) — that is the thing two buyers race for.
//            Only then does gold move. If the gold fails, the claim is released and the stall re-opens.
//   cancel:  guarded the same way; goods come back only once the row is provably yours and provably open.
//
// Ordered any other way this duplicates goods or gold under load, and "load" here is two people in a shop.

// The one gate the whole feature reads, in one place — same shape as the Kitchen's COOK_UNLOCKED. Open to
// every signed-in member; put an isOwner() back in HERE to re-gate it, rather than in four call sites.
const MARKET_OPEN = (buyerId) => Boolean(buyerId);

const KINDS = new Set(["crop", "fish", "prep"]);
const MAX_OPEN_PER_SELLER = 12;   // a board one member can flood is not a market
const MAX_UNIT_GOLD = 100_000;
const MAX_QTY = 999;

// THE KIND IS DERIVED, NEVER TAKEN FROM THE CLIENT. mkt_pantry's primary key is (buyer_id, kind, ref), so a
// listing posted with the wrong kind would debit one row and credit a DIFFERENT one on delivery — quietly
// minting goods. ingredientMeta already knows which kind a ref is (it is the Kitchen's own resolver, and refs
// are unique across the three), so asking it is both the correct answer and one less thing to keep in sync.
const metaFor = (ref, sprites) => {
    const m = ingredientMeta(String(ref || ""), sprites);
    // ingredientMeta falls back to a "crop" named after the raw ref for anything it doesn't recognise. That
    // fallback is right for rendering an unknown row and wrong for accepting a listing, so it is rejected by
    // the name coming back identical to the id.
    return m && m.name !== m.ref ? m : null;
};

const sellerName = (r) => r.display_name || (r.alias ? `@${r.alias}` : "A wolf");

/** The whole stall front: what's for sale, what you're selling, what you could sell, and what you can spend. */
// `unlocked` is the same contract the Arena, the Mine and the Dungeons use, so the nav's gate — ask the server,
// never guess — reads this feature without a special case.
export async function getMarketState(buyerId) {
    if (!MARKET_OPEN(buyerId)) return { unlocked: false };
    const [open, mine, pantry, goldRow, sprites, art, known] = await Promise.all([
        db.query(
            `SELECT l.id, l.seller_id, l.kind, l.ref, l.qty, l.unit_gold, l.created_at, b.display_name, b.alias
               FROM mkt_market_listing l JOIN mkt_buyer b ON b.id = l.seller_id
              WHERE l.sold_at IS NULL AND l.cancelled_at IS NULL
              ORDER BY l.unit_gold ASC, l.created_at ASC LIMIT 120`
        ).catch(() => []),
        db.query(
            `SELECT id, kind, ref, qty, unit_gold, created_at FROM mkt_market_listing
              WHERE seller_id = $1 AND sold_at IS NULL AND cancelled_at IS NULL ORDER BY created_at DESC`,
            [buyerId]
        ).catch(() => []),
        db.query(`SELECT kind, ref, qty FROM mkt_pantry WHERE buyer_id = $1 AND qty > 0 ORDER BY qty DESC`, [buyerId]).catch(() => []),
        db.queryOne(`SELECT COALESCE(gold, 0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        cookingSprites().catch(() => ({})),
        // The same stall sprite the town street draws, so the square you walk into is the building you tapped.
        db.queryOne(`SELECT url FROM mkt_town_art WHERE art_key = 'market'`).catch(() => null),
        // What this member can actually cook — for the "does this go in anything I own" answer below.
        db.query(`SELECT recipe_id FROM mkt_recipe_known WHERE buyer_id = $1`, [buyerId]).catch(() => []),
    ]);

    // One dresser for listings and pantry rows alike, so a stall card and a "sell this" card can never
    // disagree about what a thing is called or what it looks like.
    const dress = (r) => {
        const m = ingredientMeta(r.ref, sprites);
        return {
            id: r.id == null ? null : Number(r.id),
            ref: r.ref, kind: m.kind, name: m.name, rarity: m.rarity,
            sprite: m.sprite || m.fallback || null,
            qty: Number(r.qty),
            unitGold: r.unit_gold == null ? null : Number(r.unit_gold),
            total: r.unit_gold == null ? null : Number(r.qty) * Number(r.unit_gold),
        };
    };

    // ── WHAT IS THIS FOR? ────────────────────────────────────────────────────────────────────────────────
    // ValkyrieSylve, in global chat the day the Market opened: "I would love it if we could see if any of the
    // items for sale go to any recipes we own." Without it you are looking at a wall of produce and doing the
    // cross-referencing in your head against a recipe book on another screen.
    //
    // Only recipes you KNOW, and the shortfall is measured against your own shelf, so the line answers the
    // question you actually have — not "this is an ingredient somewhere" but "this is the thing you are short
    // of for a dish you can already make". Recipes you have every ingredient for are left off: you don't need
    // the market for those.
    const held = new Map(pantry.map((r) => [r.ref, Number(r.qty) || 0]));
    const knownIds = new Set(known.map((r) => r.recipe_id));
    const wantedBy = new Map();   // ref -> [{ id, name, need, shortBy }]
    for (const r of RECIPES) {
        if (!knownIds.has(r.id)) continue;
        for (const [ref, qty] of Object.entries(r.need || {})) {
            const shortBy = Math.max(0, Number(qty) - (held.get(ref) || 0));
            if (shortBy <= 0) continue;
            if (!wantedBy.has(ref)) wantedBy.set(ref, []);
            wantedBy.get(ref).push({ id: r.id, name: r.name, need: Number(qty), shortBy });
        }
    }
    // Cheapest-first is already the sort, so the first stall that covers a shortfall is also the cheapest one.
    const recipeUse = (ref, qty) => {
        const uses = wantedBy.get(ref);
        if (!uses || !uses.length) return null;
        const covers = uses.filter((u) => qty >= u.shortBy);
        const pick = (covers.length ? covers : uses).slice().sort((a, b) => a.shortBy - b.shortBy);
        return { names: pick.map((u) => u.name), shortBy: pick[0].shortBy, completes: covers.length > 0 };
    };

    const gold = Number(goldRow?.gold || 0);
    return {
        unlocked: true,
        ok: true,
        art: art?.url || null,
        gold,
        listings: open.map((r) => ({
            ...dress(r),
            seller: sellerName(r),
            mine: String(r.seller_id) === String(buyerId),
            afford: gold >= Number(r.qty) * Number(r.unit_gold),
            forRecipe: recipeUse(r.ref, Number(r.qty)),
        })),
        mine: mine.map(dress),
        // Only the three kinds the market trades, and only what there is some of.
        sellable: pantry.filter((r) => KINDS.has(r.kind)).map(dress),
        openSlots: Math.max(0, MAX_OPEN_PER_SELLER - mine.length),
        maxOpen: MAX_OPEN_PER_SELLER,
        maxUnitGold: MAX_UNIT_GOLD,
    };
}

/** Post goods for sale. The pantry is debited FIRST — nothing sits on the board that isn't already escrowed. */
export async function listOnMarket(buyerId, { ref, qty, unitGold } = {}) {
    if (!MARKET_OPEN(buyerId)) return { ok: false, error: "not_open" };
    const sprites = await cookingSprites().catch(() => ({}));
    const meta = metaFor(ref, sprites);
    const n = Math.round(Number(qty) || 0);
    const price = Math.round(Number(unitGold) || 0);
    if (!meta) return { ok: false, error: "bad_item" };
    if (n <= 0 || n > MAX_QTY) return { ok: false, error: "bad_qty" };
    if (price <= 0 || price > MAX_UNIT_GOLD) return { ok: false, error: "bad_price" };

    const openCount = await db.queryOne(
        `SELECT COUNT(*)::int AS n FROM mkt_market_listing
          WHERE seller_id = $1 AND sold_at IS NULL AND cancelled_at IS NULL`,
        [buyerId]
    ).catch(() => null);
    if ((openCount?.n || 0) >= MAX_OPEN_PER_SELLER) return { ok: false, error: "too_many_open" };

    // ESCROW. Guarded on qty, so two taps cannot list the same stack twice.
    const took = await db.queryOne(
        `UPDATE mkt_pantry SET qty = qty - $4
          WHERE buyer_id = $1 AND kind = $2 AND ref = $3 AND qty >= $4 RETURNING qty`,
        [buyerId, meta.kind, meta.ref, n]
    ).catch(() => null);
    if (!took) return { ok: false, error: "not_enough" };

    const row = await db.queryOne(
        `INSERT INTO mkt_market_listing (seller_id, kind, ref, qty, unit_gold) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [buyerId, meta.kind, meta.ref, n, price]
    ).catch(() => null);
    if (!row) {
        // The goods are already out of the pantry and there is no transaction to undo it — hand them back
        // rather than leave somebody short of something they still own.
        await addToPantry(buyerId, meta.kind, meta.ref, n);
        return { ok: false, error: "could_not_list" };
    }
    await trackActivity(buyerId, "market_list", { ref: meta.ref, qty: n, unitGold: price }).catch(() => {});
    return { ok: true, listed: { name: meta.name, qty: n, unitGold: price }, ...(await getMarketState(buyerId)) };
}

/** Buy a listing outright: claim, then pay, then deliver — in that order, for the reasons at the top. */
export async function buyFromMarket(buyerId, listingId) {
    if (!MARKET_OPEN(buyerId)) return { ok: false, error: "not_open" };
    const id = Number(listingId) || 0;
    if (!id) return { ok: false, error: "bad_listing" };

    const peek = await db.queryOne(
        `SELECT seller_id, qty, unit_gold FROM mkt_market_listing
          WHERE id = $1 AND sold_at IS NULL AND cancelled_at IS NULL`, [id]
    ).catch(() => null);
    if (!peek) return { ok: false, error: "gone" };
    if (String(peek.seller_id) === String(buyerId)) return { ok: false, error: "your_own" };
    const cost = Number(peek.qty) * Number(peek.unit_gold);

    // 1. CLAIM — the race is two buyers over one stack, so it is settled before any money moves.
    const claimed = await db.queryOne(
        `UPDATE mkt_market_listing SET sold_at = NOW(), buyer_id = $2
          WHERE id = $1 AND sold_at IS NULL AND cancelled_at IS NULL
          RETURNING seller_id, kind, ref, qty, unit_gold`,
        [id, buyerId]
    ).catch(() => null);
    if (!claimed) return { ok: false, error: "gone" };
    // The price is re-read off the CLAIMED row, never the peek — the peek is the one thing here that could
    // have gone stale, and paying a stale price is how a market becomes an exploit.
    const paidCost = Number(claimed.qty) * Number(claimed.unit_gold);

    // 2. PAY — guarded on the balance. A failure releases the claim so the stall re-opens.
    const paid = await db.queryOne(
        `UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`,
        [buyerId, paidCost]
    ).catch(() => null);
    if (!paid) {
        await db.query(`UPDATE mkt_market_listing SET sold_at = NULL, buyer_id = NULL WHERE id = $1`, [id]).catch(() => {});
        return { ok: false, error: "not_enough_gold" };
    }

    // 3. DELIVER — the goods have been in escrow since the listing went up, so this is a credit, not a move.
    await addToPantry(buyerId, claimed.kind, claimed.ref, Number(claimed.qty));
    await db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [claimed.seller_id, paidCost]).catch(() => {});

    // BOTH sides in the coin ledger. One side only and the economy screen shows gold leaving the Den and never
    // arriving — the ledger is what the balance reports are built from.
    const ledgerMeta = { listingId: id, ref: claimed.ref, qty: Number(claimed.qty) };
    await logCoin(buyerId, -paidCost, "market_buy", { meta: ledgerMeta, balanceAfter: Number(paid.gold) }).catch(() => {});
    await logCoin(claimed.seller_id, paidCost, "market_sale", { meta: ledgerMeta }).catch(() => {});
    await trackActivity(buyerId, "market_buy", ledgerMeta).catch(() => {});

    const sprites = await cookingSprites().catch(() => ({}));
    const m = ingredientMeta(claimed.ref, sprites);
    return {
        ok: true,
        bought: { name: m.name, qty: Number(claimed.qty), cost: paidCost, sprite: m.sprite || m.fallback || null },
        ...(await getMarketState(buyerId)),
    };
}

/** Pull a listing off the board. The goods return only once the row is provably yours to cancel. */
export async function cancelListing(buyerId, listingId) {
    if (!MARKET_OPEN(buyerId)) return { ok: false, error: "not_open" };
    const id = Number(listingId) || 0;
    if (!id) return { ok: false, error: "bad_listing" };
    const row = await db.queryOne(
        `UPDATE mkt_market_listing SET cancelled_at = NOW()
          WHERE id = $1 AND seller_id = $2 AND sold_at IS NULL AND cancelled_at IS NULL
          RETURNING kind, ref, qty`,
        [id, buyerId]
    ).catch(() => null);
    if (!row) return { ok: false, error: "gone" };
    await addToPantry(buyerId, row.kind, row.ref, Number(row.qty));
    return { ok: true, ...(await getMarketState(buyerId)) };
}
