import "server-only";

import { randomUUID } from "node:crypto";

import { deleteSquareCatalogObject, getMysteryBagPriceInfoFromSquare, getShopSalesTaxRate } from "@/lib/consignment/square";
import { db } from "@/lib/db";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { buyBackCents } from "@/lib/marketplace/buyback.js";
import { syncEarnedBadges } from "@/lib/marketplace/badges.js";
import { packCardSubtitle, parsePackCardName } from "@/lib/marketplace/pack-card-name.js";
import { BIG_HIT_CENTS, tierForCents } from "@/lib/marketplace/pack-rarity.js";
import { addCredit, getStoreCredit, spendCredit } from "@/lib/marketplace/store-credit.js";
import { completeBuyBack } from "@/lib/marketplace/vault-restock.js";
import { isPreviewOpen, shelfPacksOpenFor, vaultOpenFor } from "@/lib/marketplace/vault-gate.js";
import { poolByKey, poolStates } from "@/lib/marketplace/pack-pools.js";
import { claimShelfCard } from "@/lib/marketplace/pack-shelf-claim.js";
import { hasOpenedBefore, markFirstOpen } from "@/lib/marketplace/pack-weights.js";
import { adjustInventoryForSale } from "@/lib/consignment/square";
import { createServerLogger } from "@/lib/server-logger";

const logger = createServerLogger({ source: "api", subsystem: "packs" });

// ── OPENING A MYSTERY PACK ON THE WEBSITE ────────────────────────────────────────────────────────────────────
// Design doc: docs/virtual-packs-and-the-card-vault.md.
//
// The pool is the REAL sealed bags, shared with the register. So the order of operations below is not a style
// choice — it is the whole safety argument, and each step is placed where it is because of what happens if the
// step after it fails.
//
// ⚠️ AND SQUARE IS NOT TOLD ABOUT THE SALE. Luke, 2026-10-26: "We would report that a customer bought store
// credit, but everything downstream is going to be a different vein of reporting we will need to build." The
// cash entered the business when the credit was bought; an open REDEEMS a liability. So no Square order and no
// Square payment is created here. The only Square call this file makes is the catalog delete, which is not a
// sale — it is what takes the bag off the register.
//
// ⚠️ THERE IS NO DECREMENT HERE EITHER, AND THAT IS NOT AN OMISSION. The source single was already decremented
// when the bag was MADE (decrementInventoryByOne, right after the packed variation is created), and that
// already consumed its FIFO cost layer. An open ATTRIBUTES a cost; it must never RELIEVE one. Adding a second
// decrement here is the bug that took two units per sale for three days in October and read as theft.

const DEFAULT_PRICE_CENTS = 2500;

/** How long a reservation may sit before the pool treats it as abandoned. A live open takes under a second. */
const STALE_RESERVATION_MINUTES = 10;

/** Dollars-numeric out of Postgres into cents, once, at the edge. Nothing downstream sees a float. */
const toCents = (v) => Math.round(Number(v || 0) * 100);

/**
 * Tax is IMPLICIT in the pack price (§7.4) — backed out, never added on. The member pays exactly the sticker,
 * which is what lets the Open button debit precisely what it says and keeps a checkout screen out of the way
 * of the bag.
 *
 *     revenue + tax === price, always.
 */
export function splitPriceForTax(priceCents, rate) {
    const price = Math.max(0, Math.round(Number(priceCents) || 0));
    const r = Number.isFinite(rate) && rate >= 0 && rate < 0.2 ? rate : 0;
    if (!price || !r) return { revenueCents: price, taxCents: 0 };
    const revenue = Math.round(price / (1 + r));
    return { revenueCents: revenue, taxCents: price - revenue };
}

/**
 * The live pack price, in cents, WITH where it came from.
 *
 * ⚠️ THE SOURCE MATTERS BECAUSE THIS NUMBER IS CHARGED, NOT JUST DISPLAYED. The /mystery-bags board has a
 * fallback chain ending in a hard-coded $25, which is harmless for a board and is not harmless here: the real
 * Square price is $20, so a Square outage would silently take $25 of someone's credit for a $20 pack. Caught
 * in dev, where SQUARE_ACCESS_TOKEN is absent and the page cheerfully advertised "a $25.00 pack".
 *
 * So the default is still returned — a board that shows nothing is worse than one showing a stale price — but
 * it is LABELLED, and openPack() refuses to charge on it.
 */
// ⚠️ MEMOISED FOR A MINUTE, AND IT IS THE IN-FLIGHT PROMISE THAT IS CACHED, NOT THE VALUE. Every call here is
// a live Square catalog lookup — a TLS handshake and a JSON parse, which is real Active CPU — and the price
// of a pack does not change between two requests a second apart. Caching the promise rather than the result
// is what makes concurrent callers inside a Promise.all share ONE round trip instead of all missing an empty
// value cache and firing their own.
//
// A minute is short enough that a price change in Square reaches members almost immediately, and long enough
// that a page doing three reads does one lookup.
let priceCache = { at: 0, promise: null };
const PRICE_TTL_MS = 60_000;

export async function packPrice() {
    const now = Date.now();
    if (priceCache.promise && now - priceCache.at < PRICE_TTL_MS) return priceCache.promise;

    const promise = (async () => {
        const info = await getMysteryBagPriceInfoFromSquare().catch(() => null);
        const fromSquare = Number(info?.price || 0);
        if (fromSquare > 0) return { cents: Math.round(fromSquare * 100), source: "square" };
        const fromEnv = Number(process.env.MYSTERY_BAG_PRICE || 0);
        if (fromEnv > 0) return { cents: Math.round(fromEnv * 100), source: "env" };
        return { cents: DEFAULT_PRICE_CENTS, source: "fallback_default" };
    })();

    priceCache = { at: now, promise };
    // A failed lookup must not be cached as "the price for the next minute" — it would turn one Square blip
    // into a minute of refused opens.
    promise.catch(() => { priceCache = { at: 0, promise: null }; });
    return promise;
}

/** Just the number, for the places that only display it. */
export async function packPriceCents() {
    return (await packPrice()).cents;
}

function toPoolCard(row) {
    const valueCents = toCents(row.market_value);
    const parsed = parsePackCardName(row.card_name);
    return {
        id: row.id,
        name: parsed.name,
        subtitle: packCardSubtitle(row.card_name),
        setCode: parsed.setCode,
        number: parsed.number,
        printedRarity: parsed.rarity,
        condition: parsed.condition || row.condition || null,
        imageUrl: row.image_url || null,
        valueCents,
        // ⚠️ SENT, NOT DERIVED. The sell button has to show what the member will actually be paid, and the
        //    moment a client multiplies a price by a rate there are two implementations of one number — one
        //    of which is in a bundle somebody is still running from cache. buyBackCents lives on the server
        //    and the answer travels with the card.
        sellBackCents: buyBackCents(valueCents),
        tier: tierForCents(valueCents).key,
        itemType: row.item_type || "card",
    };
}

/**
 * What is in the packs, and what a pack costs. Public-facing — this is the "inspect any time" shelf, and it
 * stays honest about a pool the shelf is draining at the same time, so it is never cached across a session.
 */
export async function packPoolSummary() {
    const [rows, price] = await Promise.all([
        // Stale reservations count as available, because the next open will reclaim them (see the note on the
        // claim). Leaving them out would show members "72 packs left" for a pool that actually holds 74.
        db.query(
            `SELECT id, card_name, condition, market_value, image_url, item_type
             FROM mystery_bag_cards
             WHERE status = 'active'
                OR (status = 'reserved' AND reserved_at < NOW() - INTERVAL '${STALE_RESERVATION_MINUTES} minutes')
             ORDER BY market_value DESC`
        ),
        packPrice(),
    ]);
    const priceCents = price.cents;

    const cards = rows.map(toPoolCard);
    const totalCents = cards.reduce((sum, c) => sum + c.valueCents, 0);
    const byTier = {};
    for (const card of cards) byTier[card.tier] = (byTier[card.tier] || 0) + 1;

    return {
        priceCents,
        // The client disables the button on this, so a Square outage reads as "not right now" rather than as
        // a surprise charge.
        priceTrusted: price.source !== "fallback_default",
        remaining: cards.length,
        poolValueCents: totalCents,
        evCents: cards.length ? Math.round(totalCents / cards.length) : 0,
        byTier,
        cards,
    };
}

/**
 * Delete a packed variation, retrying the rate limiter.
 *
 * ⚠️ SQUARE SERIALISES CATALOG WRITES. Five opens at once produced `429 Catalog locked by prior request` for
 * four of them — not an error in any meaningful sense, just Square asking us to wait our turn. Without a
 * retry that is four members told "that pack just went to someone at the counter" when nothing of the sort
 * happened. Short backoff, few attempts: a member is watching a bag, so this cannot wait long.
 */
async function deleteWithRetry(variationId, attempts = 3) {
    for (let i = 0; i < attempts; i += 1) {
        try {
            await deleteSquareCatalogObject(variationId);
            return true;
        } catch (error) {
            const rateLimited = error?.squareStatus === 429 || error?.squareCode === "RATE_LIMITED";
            if (!rateLimited || i === attempts - 1) {
                logger.error("packs.open.square_delete_failed", error, { variationId, attempt: i + 1 });
                return false;
            }
            await new Promise((resolve) => { setTimeout(resolve, 180 * (i + 1)); });
        }
    }
    return false;
}

/**
 * The open. Returns `{ ok, open }` or `{ ok:false, error }`.
 *
 * ⚠️ READ THE ORDER OF THE STEPS BEFORE CHANGING ANY OF THEM.
 */
export async function openPack({ buyerId, idempotencyKey = null, pool: poolKey = "bags" } = {}) {
    // ── ⚠️ ONE FUNCTION, TWO POOLS, AND THE BRANCHES ARE DELIBERATELY TINY ──────────────────────────────────
    // docs/category-packs.md. A category pack differs from a bag in exactly three places — where the card is
    // claimed, what the price comes from, and whether the register copy is DELETED or DECREMENTED — and
    // everything else below is the same event. Forking this into openShelfPack() would have been easier to
    // write and would have drifted within a month; sell-at-the-reveal and sell-from-the-vault already taught
    // this house that lesson at the cost of two different sets of consequences for one payout.
    const pool = poolByKey(poolKey);
    if (!pool) return { ok: false, error: "no_such_pool" };
    const shelf = pool.channel === "shelf";

    // Each pool asks its OWN gate. The bags are public; the category packs are owner-only and additionally
    // require the vault gate — see shelfPacksOpenFor.
    if (shelf ? !shelfPacksOpenFor(buyerId) : !vaultOpenFor(buyerId)) return { ok: false, error: "closed" };

    // A stuck open is RESUMED, never charged for twice. The partial unique index on (buyer_id) where
    // outcome='pending' is what makes this a guarantee rather than a hope.
    const pending = await resumePendingOpen(buyerId);
    if (pending) return { ok: true, open: pending, resumed: true };

    // ⚠️ IN PARALLEL, because each of these is its own HTTPS round trip and the member is watching a bag.
    //    Filming the reveal showed the whole open taking 2.4s; chaining three awaits that do not depend on
    //    each other is a third of that for nothing. The tax rate is needed later but asked for here so it is
    //    already in flight — it is cached per instance, so this is usually free.
    const [price, balanceCents, taxRate, states] = await Promise.all([
        shelf ? Promise.resolve(null) : packPrice(),
        getStoreCredit(buyerId),
        getShopSalesTaxRate().catch(() => 0),
        shelf ? poolStates() : Promise.resolve([]),
    ]);

    // ⚠️ Never charge a guessed price. If Square cannot be reached and nothing overrides it, the member is
    //    told to come back rather than being billed a number we invented.
    if (!shelf && price.source === "fallback_default") {
        logger.error("packs.open.no_price", new Error("No authoritative pack price"), { buyerId });
        return { ok: false, error: "no_price" };
    }

    // ⚠️ A SHELF POOL'S PRICE IS READ, NEVER COMPUTED HERE. It is set by the nightly recompute and held — see
    //    pack-pools.js. Deriving it at open time is how the figure on the screen and the figure charged come
    //    to differ, which is the whole reason `priceTrusted` exists on the bag side.
    //
    // ⚠️ AND A CLOSED POOL REFUSES RATHER THAN FALLING BACK. A pool shuts because one card carries its value
    //    or because it has run thin; either way the honest answer is "not right now", and a fallback price
    //    would sell from a pool we have just decided is not fit to sell from.
    const state = shelf ? states.find((p) => p.key === pool.key) : null;
    if (shelf && (!state || !state.open || !(state.priceCents > 0))) {
        return { ok: false, error: "pool_closed", reason: state?.closedReason || "not_computed" };
    }
    const priceCents = shelf ? state.priceCents : price.cents;
    if (balanceCents < priceCents) {
        return { ok: false, error: "insufficient_credit", priceCents, balanceCents };
    }

    // ── 1. CLAIM A BAG ──────────────────────────────────────────────────────────────────────────────────────
    // Inside a transaction, because FOR UPDATE SKIP LOCKED means nothing outside one. Two members tapping at
    // the same moment cannot take the same bag; the loser simply draws a different one.
    //
    // ⚠️ A STALE RESERVATION IS ALSO CLAIMABLE, AND IT HAS TO BE — THERE IS NOTHING ELSE TO RESCUE IT.
    //
    // `reserved` is a transient state that only persists if the open died between claiming a bag and marking
    // it sold: a crash, a timeout, a deploy mid-request. Nothing sweeps it. And because every pool query
    // filters on `status = 'active'`, a stranded reservation is INVISIBLE — the bag silently leaves the pool
    // forever and the board quietly counts one fewer pack with no error anywhere.
    //
    // Two stranded this way during testing, from a single crash. In production that is a pool that shrinks by
    // itself. Rather than add a cron to sweep them, the claim simply treats a reservation older than the
    // window as abandoned, which makes the pool self-healing with no new moving part. The window is long
    // enough that it can never race a live open — those complete in under a second.
    const key = idempotencyKey || `vpo:${randomUUID()}`;

    // ⚠️ A SHELF POOL HAS NO ROWS TO LOCK, so there is nothing for SKIP LOCKED to do: the cards live in
    //    Square and `inventory_feed` is a mirror of them. claimShelfCard picks a candidate, confirms it with
    //    a LIVE Square count, and writes the one row it drew — which from the next line onward is a pool row
    //    indistinguishable from a bag. See pack-shelf-claim.js for the window it cannot close.
    // ── THE ODDS THIS PARTICULAR OPEN IS DRAWN ON ───────────────────────────────────────────────────
    // ⚠️ READ FROM THE STORED STATE, NEVER SOLVED HERE. recomputePools does the solving on a schedule;
    //    doing it per open would put a 900-row scan and a bisection in the hot path of the one request a
    //    member is watching a spinner for, and would let two opens a second apart draw on different odds.
    //
    // ⚠️ AND A MISSING STATE ROW MEANS alpha 0 — a UNIFORM draw, which is the generous direction. Failing
    //    the other way (a steep curve by default) would quietly sell a worse pack than the one advertised.
    const firstOpen = shelf ? !(await hasOpenedBefore(buyerId)) : false;
    const weights = shelf
        ? await db
            .queryOne(
                `SELECT alpha, first_open_floor_cents, first_open_alpha, band_lo_cents, band_hi_cents
                   FROM mkt_pack_pool_state WHERE pool = $1`,
                [poolKey]
            )
            .catch(() => null)
        : null;
    // Both or neither: the floor and its alpha were solved together and are meaningless apart.
    const useMagic = firstOpen && Number(weights?.first_open_floor_cents) > 0;
    const drawAlpha = Number((useMagic ? weights?.first_open_alpha : weights?.alpha) || 0);
    // ⚠️ THE BAND FLOOR APPLIES ON EVERY OPEN, the first-open floor only on the first — and the first-open
    //    floor was already solved to sit at or above the band floor, so the max() is belt and braces rather
    //    than arithmetic that matters. The CEILING is unconditional: it is what the tier is.
    const bandLo = Number(weights?.band_lo_cents || 0);
    const drawFloor = Math.max(bandLo, useMagic ? Number(weights?.first_open_floor_cents || 0) : 0);
    const drawCeil = Number(weights?.band_hi_cents || 0);

    const claimed = shelf
        ? await claimShelfCard({ pool, reservationKey: key, alpha: drawAlpha, floorCents: drawFloor, ceilCents: drawCeil })
        : await db.tx(async (client) => {
        const picked = await client.query(
            `UPDATE mystery_bag_cards
             SET status = 'reserved', reservation_key = $1, reserved_at = NOW(), updated_at = NOW()
             WHERE id = (
                 SELECT id FROM mystery_bag_cards
                 WHERE status = 'active'
                    OR (status = 'reserved' AND reserved_at < NOW() - INTERVAL '${STALE_RESERVATION_MINUTES} minutes')
                 ORDER BY random()
                 LIMIT 1
                 FOR UPDATE SKIP LOCKED
             )
             AND (status = 'active'
                  OR (status = 'reserved' AND reserved_at < NOW() - INTERVAL '${STALE_RESERVATION_MINUTES} minutes'))
             RETURNING id, card_id, card_name, condition, market_value, image_url, item_type,
                       square_variation_id, packed_variation_id, variation_sku, channel,
                       cost_cents, cost_basis`,
            [key]
        );
            return picked.rows[0] || null;
        }).catch((error) => {
            logger.error("packs.open.claim_failed", error, { buyerId });
            return null;
        });

    // ⚠️ AN EMPTY POOL AND A FAILED CLAIM ARE DIFFERENT FACTS AND MUST NOT SHARE A MESSAGE. The bags only
    // ever fail this one way — the tub is empty — so one error covered it. A shelf claim can also fail with
    // 910 cards sitting right there: Square unreachable, the candidate sold at the register, or a write that
    // threw. The first live open hit exactly that and the screen said "we're out of packs right now", which
    // sent me looking at the pool instead of at the insert.
    if (!claimed) return { ok: false, error: shelf ? "claim_failed" : "pool_empty" };

    const release = async (reason) => {
        await db
            .query(
                `UPDATE mystery_bag_cards
                 SET status = 'active', reservation_key = NULL, reserved_at = NULL, updated_at = NOW()
                 WHERE id = $1 AND status = 'reserved' AND reservation_key = $2`,
                [claimed.id, key]
            )
            .catch(() => {});
        logger.warn("packs.open.released", { buyerId, cardId: claimed.id, reason });
    };

    // ── 2. TAKE THE PENDING SLOT, AND TAKE IT FIRST ────────────────────────────────────────────────────────
    //
    // ⚠️ THE UNIQUE INDEX IS THE LOCK, AND IT HAS TO BE GRABBED BEFORE ANYTHING IS SPENT OR DESTROYED.
    //
    // `resumePendingOpen` at the top of this function is a READ, and between that read and this insert a
    // second request can create a pending open. The first version wrote this row LAST — after the credit was
    // spent and after the bag's Square variation was deleted — so losing that race threw an unhandled unique
    // violation with the member already charged and the bag already gone. Five concurrent opens reproduced it
    // immediately.
    //
    // Writing the row first turns the race into a clean resume: nothing has been taken, so the loser simply
    // gets the open that already exists.
    const valueCents = toCents(claimed.market_value);
    const tier = tierForCents(valueCents);
    const { revenueCents, taxCents } = splitPriceForTax(priceCents, taxRate);
    const cogs = await resolvePackCost(claimed);

    let row;
    try {
        row = await db.queryOne(
            `INSERT INTO mkt_pack_open
                (buyer_id, mystery_card_id, price_cents, card_value_cents, tier,
                 revenue_cents, tax_cents, cogs_cents, cogs_basis, idempotency_key, preview, pool)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             RETURNING id, created_at`,
            [
                buyerId, claimed.id, priceCents, valueCents, tier.key,
                revenueCents, taxCents, cogs.cents, cogs.basis, key, isPreviewOpen(buyerId, pool.key), pool.key,
            ]
        );
    } catch (error) {
        await release("lost_the_pending_race");
        if (String(error?.dbCode || error?.code) === "23505") {
            const existing = await resumePendingOpen(buyerId);
            if (existing) return { ok: true, open: existing, resumed: true };
            return { ok: false, error: "busy" };
        }
        logger.error("packs.open.book_failed", error, { buyerId, cardId: claimed.id });
        return { ok: false, error: "unavailable" };
    }

    const unbook = async (reason) => {
        await db.query(`DELETE FROM mkt_pack_open WHERE id = $1`, [row.id]).catch(() => {});
        await release(reason);
    };

    // ── 3. SPEND THE CREDIT ─────────────────────────────────────────────────────────────────────────────────
    // Guarded and atomic — two concurrent spends cannot overdraw. Nothing has been destroyed yet, so a
    // failure here unwinds completely.
    const spent = await spendCredit(buyerId, priceCents, "pack_open", key, { packOpen: true });
    if (!spent.ok) {
        await unbook("credit_spend_failed");
        return { ok: false, error: "insufficient_credit", priceCents, balanceCents };
    }

    // ── 4. TAKE THE BAG OFF THE REGISTER ────────────────────────────────────────────────────────────────────
    // The SKU is deleted, so the POS refuses the scan and the bag cannot be sold to somebody at the counter.
    //
    // ⚠️ THIS IS AFTER THE SPEND, NOT BEFORE IT, AND THE REASON IS SQUARE'S RATE LIMITER. Catalog writes
    // SERIALISE: five simultaneous opens produce `429 Catalog locked by prior request` for most of them. With
    // the delete first, every one of those rate-limited opens had to unwind a bag it had already claimed. With
    // it here, the common failure refunds cleanly instead — and `release` is guarded on our own reservation
    // key, so if the register genuinely won the bag in between, the release is a no-op and the member simply
    // gets their money back.
    //
    // A 'shelf' row (§1.4) has no packed variation and nothing to delete. Never delete on that branch: the
    // fallback would resolve to the card's own source single and take a real catalogue item with it.
    if (claimed.channel === "bagged" && claimed.packed_variation_id) {
        const deleted = await deleteWithRetry(claimed.packed_variation_id);
        if (!deleted) {
            await addCredit(buyerId, priceCents, "refund", key, { reason: "square_delete_failed" }).catch(() => {});
            await unbook("square_delete_failed");
            return { ok: false, error: "unavailable" };
        }
    } else if (claimed.channel === "shelf" && claimed.square_variation_id) {
        // ── ⚠️ DECREMENT, NEVER DELETE ──────────────────────────────────────────────────────────────────
        // A bag's SKU is a one-off and deleting it is correct. A shelf single is a real catalogue line with
        // sales history, a cost record and possibly more copies behind it — deleting it would destroy the
        // COGS of every past sale of that card, which has happened here before and is why the cost table is
        // ours rather than Square's.
        //
        // ⚠️ AND EXACTLY ONCE. An itemised Square ORDER decrements its own lines; this open is not an order
        // — it is store credit moving inside our ledger — so Square never sees it and we must do it
        // ourselves. Doing it where Square also does it is how counts read as theft.
        const adjusted = await adjustInventoryForSale(
            [{ catalogObjectId: claimed.square_variation_id, quantity: 1 }],
            { idempotencyKey: `pack-open-${row.id}` }
        ).catch((error) => {
            logger.error("packs.open.decrement_failed", error, { buyerId, openId: row.id });
            return null;
        });
        if (!adjusted) {
            // ⚠️ REFUNDED BEFORE ANYTHING IS REVEALED. §6.1: the member has seen nothing yet, so losing the
            // card to the register costs them a moment rather than a card they already watched arrive.
            await addCredit(buyerId, priceCents, "refund", key, { reason: "square_decrement_failed" }).catch(() => {});
            await unbook("square_decrement_failed");
            return { ok: false, error: "unavailable" };
        }
    }

    // ── 5. IT IS THEIRS ─────────────────────────────────────────────────────────────────────────────────────
    // From here the result EXISTS and is owed to the member, whatever happens to their browser.
    // The pool row is spent. mystery_sold_events / _assignments are written too so the existing audit trail,
    // the public hits board and the in-store tooling all see an online pull the same way they see a counter
    // one — one sold event, one assignment, one audit line.
    await db.query(
        `UPDATE mystery_bag_cards
         SET status = 'sold', sold_at = NOW(), reservation_key = NULL, reserved_at = NULL, updated_at = NOW()
         WHERE id = $1`,
        [claimed.id]
    );
    await recordSoldEvent(claimed, key, row.id).catch((error) =>
        logger.warn("packs.open.sold_event_failed", { cardId: claimed.id, message: error?.message })
    );

    await db
        .query(
            `INSERT INTO mkt_vault_event (buyer_id, pack_open_id, action, credit_delta_cents, meta)
             VALUES ($1, $2, 'opened', $3, $4)`,
            [buyerId, row.id, -priceCents, JSON.stringify({ card: claimed.card_name, valueCents })]
        )
        .catch(() => {});

    // ── 5. THE PHYSICAL CARD HAS TO CATCH UP ────────────────────────────────────────────────────────────────
    // A real sealed bag in a real tub. No deadline (Luke's call) — what replaces one is that an ORDER for this
    // card promotes its task to the top of the queue, because an order is the signal somebody is about to turn
    // up for a card still sealed in a bag.
    // ⚠️ BOTH CHANNELS RAISE ONE, AND THEY ARE DIFFERENT JOBS. A bag is "open the bag in the tub"; a shelf
    // single is "find this card in the case", which is slower, needs the card named well enough to find, and
    // fails often enough that `not_found` is a normal weekly path rather than an edge case (§6.3).
    //
    // No deadline on either, per Luke — it rides the existing queue exactly as the bags do, and an ORDER for
    // the card is what promotes its task to the top.
    await db
        .query(
            `INSERT INTO mkt_pack_pull_task (pack_open_id, mystery_card_id, bag_sku, kind, note)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                row.id, claimed.id,
                claimed.variation_sku || claimed.card_id,
                claimed.channel === "shelf" ? "find" : "pull",
                claimed.channel === "shelf" ? `Find in the case — ${claimed.card_name}` : null,
            ]
        )
        .catch((error) => logger.warn("packs.open.pull_task_failed", { message: error?.message }));

    await Promise.all([
        trackActivity(buyerId, "pack_open", { valueCents, tier: tier.key }).catch(() => {}),
        valueCents >= BIG_HIT_CENTS ? flagBigHit(buyerId).catch(() => {}) : Promise.resolve(),
    ]);

    logger.info("packs.open.success", {
        buyerId, openId: row.id, tier: tier.key, valueCents, priceCents, cogsBasis: cogs.basis,
    });

    return {
        ok: true,
        open: {
            id: row.id,
            pool: pool.key,
            priceCents,
            balanceCents: spent.balanceCents,
            card: { ...toPoolCard(claimed), valueCents, sellBackCents: buyBackCents(valueCents) },
            tier: tier.key,
            bigHit: valueCents >= BIG_HIT_CENTS,
            outcome: "pending",
        },
    };
}

// ── ⚠️ TELL THE OWNER A PACK WAS PULLED ──────────────────────────────────────────────────────────────────────
// Luke: "as an admin, I want to know whenever somebody pulls a pack. I kind of just want to know who it was,
// what they pulled, what pack they decided to open, how much they spent."
//
// All four facts go in the body, because the point of this push is that it answers the question WITHOUT being
// opened. A notification that only says "a pack was opened" costs a tap to learn anything and gets muted.
//
// ⚠️ IT FIRES AT THE OPEN, NOT AT THE SELL-OR-KEEP. The card is decided when the pack is opened — what happens
// to it afterwards is a second, later decision the member may sit on for days. Waiting for it would mean the
// alert about a $112 Zekrom arrives whenever somebody gets round to tapping a button.
//
// ⚠️ OWNER CHANNEL ONLY. This is "I want to know", not shelf work: the pull queue is what the employee needs
// and it has its own reminder. See [[push-defaults-to-owner-only]] — the default is right here for once, and
// is left explicit so nobody has to go and check what the default was.
//
// ⚠️ AND THE CALLER DECIDES WHEN. Nothing here is awaited inside the open path — a push must never sit between
// a member and their reveal, and [[vercel-unawaited-async-dies]] means it cannot be a floating promise either.
// The route wraps it in `after()`.
export async function notifyPackOpened(open, buyerName) {
    if (!open?.id) return;
    const { sendAdminPush } = await import("@/lib/push/send.js");
    const name = String(buyerName || "Someone").slice(0, 32);
    const card = String(open.card?.name || "a card").slice(0, 48);
    const spent = `$${((Number(open.priceCents) || 0) / 100).toFixed(2)}`;
    const worth = `$${((Number(open.card?.valueCents) || 0) / 100).toFixed(2)}`;
    const label = poolByKey(open.pool)?.brand || "Mystery pack";
    await sendAdminPush({
        // The hit is in the title so it survives a collapsed notification, where the body is what gets cut.
        title: open.bigHit ? `🔥 ${name} pulled ${card}` : `${name} opened a pack`,
        body: `${label} · ${spent} · ${card} · worth ${worth}`,
        channels: ["full"],
        route: "packFeed",
        data: { type: "pack_open", openId: String(open.id), pool: String(open.pool || "") },
        sound: open.bigHit ? { kind: "alert" } : null,
    }).catch(() => {});
}

/**
 * What did the card in this bag actually cost us?
 *
 * ⚠️ THE 65% STAMP IS LAST, AND THAT ORDERING IS THE WHOLE POINT. The bag carries `wolfden_unit_cost` = 65% of
 * its card's MARKET value, and it is tempting because it is right there — but nobody ever paid it. A chase
 * card out of a $120 box really cost about $8, not 65% of its $100 market. The house rule, learned when a 61%
 * margin turned out to be fiction: what we recorded paying beats an estimate, always.
 *
 * Measured 2026-10-26: only 37% of the active pool has a known cost, so `basis` is not decoration — it is how
 * a margin figure carries its own confidence.
 */
export async function resolvePackCost(poolRow) {
    if (poolRow.cost_cents !== null && poolRow.cost_cents !== undefined) {
        return { cents: Number(poolRow.cost_cents), basis: poolRow.cost_basis || "captured" };
    }
    if (poolRow.square_variation_id) {
        const known = await db
            .queryOne(
                `SELECT unit_cost_cents, source FROM wolfden_item_cost WHERE variation_id = $1`,
                [poolRow.square_variation_id]
            )
            .catch(() => null);
        if (known?.unit_cost_cents != null) {
            return { cents: Number(known.unit_cost_cents), basis: `item_cost:${known.source || "unknown"}` };
        }
    }
    // ── ⚠️ THE ESTIMATE IS PER CHANNEL, BECAUSE THE TWO CHANNELS COST DIFFERENT THINGS ──────────────────────
    // 65% is the BAG's number: a bag carries `wolfden_unit_cost` at 65% of its card's market, and when no
    // real cost was captured that is the closest thing to a figure we have for it.
    //
    // A shelf single is not that. Measured 2026-10-27 across the 578 single-card lines that DO carry a
    // recorded cost, we paid 45.3% of list — not the 60% trade rate, because what we actually paid and what
    // we quote at the counter are different numbers. Costing a shelf card at 65% understates every margin it
    // appears in by about a fifth.
    //
    // ⚠️ AND IT STILL ERRS HIGH ON PURPOSE. An estimate that overstates cost reports less profit than is
    // really there; one that understates it reports money we never made. Of the two directions to be wrong
    // in, only one of them ever gets shipped.
    const market = toCents(poolRow.market_value);
    const rate = poolRow.channel === "shelf" ? 0.46 : 0.65;
    return { cents: Math.round(market * rate), basis: poolRow.channel === "shelf" ? "estimate_shelf_46" : "estimate_65" };
}

/** Mirror an online pull into the existing sold-event trail so every reader sees it like a counter sale. */
async function recordSoldEvent(poolRow, key, openId) {
    const event = await db.queryOne(
        `INSERT INTO mystery_sold_events
            (idempotency_key, source, sold_at, quantity, sold_pack_variation_id, sold_pack_item_name)
         VALUES ($1, 'virtual_open', NOW(), 1, $2, $3)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING id`,
        [key, poolRow.packed_variation_id, poolRow.card_name]
    );
    if (!event) return;
    await db.query(
        `INSERT INTO mystery_sold_assignments (sold_event_id, mystery_card_id)
         VALUES ($1, $2) ON CONFLICT (mystery_card_id) DO NOTHING`,
        [event.id, poolRow.id]
    );
    await db.query(
        `INSERT INTO mystery_audit_log (mystery_card_id, action, payload_json)
         VALUES ($1, 'sold', $2::jsonb)`,
        [poolRow.id, JSON.stringify({ source: "virtual_open", packOpenId: openId })]
    );
}

async function flagBigHit(buyerId) {
    await db.query(
        `UPDATE mkt_buyer SET mystery_big_hit = TRUE, updated_at = NOW() WHERE id = $1`,
        [buyerId]
    ).catch(() => {});
    await syncEarnedBadges(buyerId).catch(() => {});
}

/** An open the member walked away from mid-reveal. The card is already theirs; they just have not chosen. */
export async function resumePendingOpen(buyerId) {
    const row = await db
        .queryOne(
            `SELECT o.id, o.price_cents, o.card_value_cents, o.tier, o.pool,
                    c.card_name, c.condition, c.image_url, c.item_type, c.market_value, c.id AS card_id
             FROM mkt_pack_open o
             JOIN mystery_bag_cards c ON c.id = o.mystery_card_id
             WHERE o.buyer_id = $1 AND o.outcome = 'pending'
             ORDER BY o.created_at DESC
             LIMIT 1`,
            [buyerId]
        )
        .catch(() => null);
    if (!row) return null;
    return {
        id: row.id,
        // ⚠️ CARRIED SO A RESUMED REVEAL KNOWS WHICH PACK IT CAME OUT OF. The modal brands itself from this;
        //    without it a member who walked away mid-pull comes back to a Pokémon card in a mystery bag.
        pool: row.pool || "bags",
        priceCents: row.price_cents,
        balanceCents: await getStoreCredit(buyerId),
        card: {
            ...toPoolCard({ ...row, id: row.card_id }),
            valueCents: row.card_value_cents,
            sellBackCents: buyBackCents(row.card_value_cents),
        },
        tier: row.tier,
        bigHit: row.card_value_cents >= BIG_HIT_CENTS,
        outcome: "pending",
    };
}

/**
 * Sell it back on the spot, or keep it. The two-button moment the whole reveal builds to.
 *
 * Sell-back pays the counter's trade rate — buyBackCents(), 60% rounded up to a quarter with a $1 floor.
 *
 * ⚠️ THE PAYOUT IS NOT THE CARD'S VALUE ANY MORE, AND THE TWO ARE NEVER INTERCHANGEABLE BELOW THIS LINE.
 * card_value_cents is what the card is WORTH — what the vault holds, what it is re-listed at. payoutCents is
 * what we hand over. Every row written here has to be told which one it wants, and the one that gets it wrong
 * is either a member underpaid or a shelf priced at 60% of market.
 *
 * It is a guarded single transition: the conditional UPDATE on outcome='pending' stops a double-tap paying twice.
 */
export async function choosePackOutcome({ buyerId, openId, choice }) {
    if (!vaultOpenFor(buyerId)) return { ok: false, error: "closed" };
    if (choice !== "vault" && choice !== "sell") return { ok: false, error: "bad_choice" };

    const open = await db
        .queryOne(
            `UPDATE mkt_pack_open SET outcome = $3
             WHERE id = $1 AND buyer_id = $2 AND outcome = 'pending'
             RETURNING id, mystery_card_id, card_value_cents, tier, pool`,
            [openId, buyerId, choice === "sell" ? "sold_back" : "vaulted"]
        )
        .catch(() => null);
    if (!open) return { ok: false, error: "already_chosen" };

    // ── ⚠️ RECORD THE PAYOUT, DO NOT LET A REPORT RE-DERIVE IT ──────────────────────────────────────────
    // The P&L needs what we actually paid, and that cannot ride in the guarded UPDATE above because the
    // card's value only comes back FROM that update. So it is a second statement — the guard has already
    // fired by this point, so there is no double-pay risk; the only exposure is a crash in between, which
    // leaves a 'sold_back' row with a NULL payout. That is DETECTABLE and the screen flags it, which is
    // the right failure: a missing number you can see beats a reconstructed one you cannot.
    //
    // ⚠️ AND IT IS buyBackCents(), NOT ARITHMETIC IN SQL. Re-implementing the rate, the quarter round-up
    // and the $1 floor in the query would be the fifth copy of a number buyback.js exists to keep single —
    // and a derived payout is wrong in the HOUSE's favour on every open that hits the round-up or floor.
    if (choice === "sell") {
        await db
            .query(`UPDATE mkt_pack_open SET buy_back_cents = $2 WHERE id = $1`,
                [open.id, buyBackCents(open.card_value_cents)])
            .catch((error) => logger.error("packs.payout_stamp_failed", error, { openId }));
    }

    // ── ⚠️ THE FIRST OPEN IS SPENT HERE, NOT AT THE OPEN ────────────────────────────────────────────────
    // A member who opens a pack and walks away mid-reveal leaves the row in 'pending'. Marking the magic
    // used at open time would burn it on a pack they never actually saw resolve — which is the one case
    // where they would feel cheated and be right. This runs on the guarded transition that proves the
    // reveal completed, and it is idempotent (ON CONFLICT DO NOTHING) so a double-tap cannot double-write.
    // ⚠️ AWAITED, NOT FIRE-AND-FORGET. Vercel freezes the instance the moment the response is returned,
    //    so a detached promise here is a write that lands on a warm instance and silently does not on a
    //    cold one — the house has been bitten by exactly this before. It is one INSERT on a primary key.
    await markFirstOpen({ buyerId, packOpenId: openId, pool: open.pool });

    const card = await db.queryOne(
        `SELECT id, card_name, condition, image_url, market_value, square_variation_id, channel, pool
         FROM mystery_bag_cards WHERE id = $1`,
        [open.mystery_card_id]
    );
    const valueCents = open.card_value_cents;
    const payoutCents = buyBackCents(valueCents);

    if (choice === "sell") {
        // ⚠️ THE BAG STILL HAS TO BE OPENED, AND CANCELLING THE TASK LOSES THE CARD.
        //
        // The first version cancelled it, reasoning that the card never moved so nobody needs to fetch it.
        // That is wrong, and it is a straight inventory loss on the commonest path: the bag's Square
        // variation was DELETED the moment the pack was opened, so the sealed bag now sitting in the tub has
        // no SKU and cannot be sold at the register — and the card inside it is one we have just paid full
        // market value for. Cancel the task and nobody is ever told to go and get it; the bag stays sealed
        // in the tub forever with a bought card inside.
        //
        // So the task survives and changes job: pull the bag, open it, put the card back on the shelf.
        // ── ⚠️ A SHELF CARD SOLD STRAIGHT BACK IS NOT A JOB AT ALL ──────────────────────────────────────
        // For a BAG this task has to survive and change meaning: the bag is sealed in the tub with a card
        // inside it that we have just paid for, and cancelling would mean nobody is ever told to go and get
        // it.
        //
        // A shelf single never moved. It is still in the case, and the buy-back has already put the count
        // back in Square — so there is nothing to pull, nothing to re-shelve and nothing to find. The live
        // test produced a task reading "Sold straight back — open the bag and re-shelve the card" against a
        // card that was never in a bag, which is a staff member sent to look for an object that does not
        // exist.
        //
        // Closed rather than deleted, so the queue's history still shows the task was raised and why it
        // went away.
        await db
            .query(
                card?.channel === "shelf"
                    ? `UPDATE mkt_pack_pull_task
                          SET status = 'done', done_at = NOW(), done_by = 'system',
                              note = 'Sold straight back before it was pulled — the card never left the case'
                        WHERE pack_open_id = $1 AND status = 'open'`
                    : `UPDATE mkt_pack_pull_task
                          SET kind = 'reshelve',
                              note = 'Sold straight back — open the bag and re-shelve the card'
                        WHERE pack_open_id = $1 AND status = 'open'`,
                [open.id]
            )
            .catch(() => {});

        const balanceCents = await addCredit(buyerId, payoutCents, "vault_sellback", open.id, {
            card: card?.card_name, immediate: true, marketCents: valueCents,
        });

        // ⚠️ THE SAME BUY-BACK AS THE VAULT'S, THROUGH THE SAME FUNCTION. Selling at the reveal and selling
        // from the vault are the same event and the same money; they had already drifted into two different
        // sets of consequences once (this path restocked nothing, recorded no cost and posted no trade), and
        // two paths for one payout always drift again.
        const parsedCard = parsePackCardName(card?.card_name || "");
        await completeBuyBack({
            buyerId,
            cards: [{
                squareVariationId: card?.square_variation_id || null,
                name: card?.card_name || parsedCard.name,
                subtitle: packCardSubtitle(card?.card_name || ""),
                setName: parsedCard.setCode,
                cardNumber: parsedCard.number,
                condition: parsedCard.condition || card?.condition || null,
                imageUrl: card?.image_url || null,
                // ⚠️ THE POOL KNOWS ITS CATEGORY FOR CERTAIN, so it says so rather than leaving the restock
                //    to infer it. A Magic single must come back as a Magic single — see categoryForVariation.
                categoryName: poolByKey(card?.pool)?.category || null,
                // ⚠️ MARKET, NOT THE PAYOUT. completeBuyBack re-rates this into what we paid; the card goes
                //    back on the shelf at what it is WORTH, which is the whole reason there is a margin.
                valueCents,
            }],
        }).catch((error) => logger.error("packs.sell_at_reveal.buyback_failed", error, { openId: open.id }));
        await db
            .query(
                `INSERT INTO mkt_vault_event (buyer_id, pack_open_id, action, credit_delta_cents, meta)
                 VALUES ($1, $2, 'sold_back', $3, $4)`,
                [buyerId, open.id, payoutCents, JSON.stringify({ card: card?.card_name, marketCents: valueCents, atReveal: true })]
            )
            .catch(() => {});
        await trackActivity(buyerId, "pack_sellback", { valueCents, payoutCents }).catch(() => {});
        return { ok: true, choice, creditedCents: payoutCents, balanceCents };
    }

    const parsed = parsePackCardName(card?.card_name || "");
    const vault = await db.queryOne(
        `INSERT INTO mkt_vault_card
            (buyer_id, pack_open_id, mystery_card_id, square_variation_id, card_name, set_name,
             card_number, condition, image_url, tier, pulled_value_cents, current_value_cents, releasable_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $12)
         RETURNING id`,
        [
            buyerId, open.id, card?.id, card?.square_variation_id || null, parsed.name,
            parsed.setCode, parsed.number, parsed.condition || card?.condition || null,
            card?.image_url || null, open.tier, valueCents, await releasableAt(buyerId),
        ]
    );
    await db
        .query(
            `INSERT INTO mkt_vault_event (buyer_id, vault_card_id, pack_open_id, action, meta)
             VALUES ($1, $2, $3, 'vaulted', $4)`,
            [buyerId, vault.id, open.id, JSON.stringify({ card: card?.card_name, valueCents })]
        )
        .catch(() => {});
    await trackActivity(buyerId, "pack_vaulted", { valueCents }).catch(() => {});
    return { ok: true, choice, vaultCardId: vault.id };
}

/**
 * When may a card physically leave the building?
 *
 * ⚠️ KEYED OFF THE MEMBER'S MOST RECENT CREDIT PURCHASE, NOT OFF THIS OPEN (§12). In-store chip payments
 * largely shift fraud liability to the issuer; an online credit top-up is card-not-present, where we are
 * liable. The hold is what stops a fast path from a reversible payment to goods walking out the same
 * afternoon. Keying it off the open instead would punish a member spending credit they topped up months ago,
 * which is most of them.
 */
const HOLD_DAYS = 7;
export async function releasableAt(buyerId) {
    const row = await db
        .queryOne(
            `SELECT credited_at FROM mkt_credit_purchase
             WHERE buyer_id = $1 AND status = 'paid' AND credited_at IS NOT NULL
               AND credited_at > NOW() - INTERVAL '${HOLD_DAYS} days'
             ORDER BY credited_at DESC LIMIT 1`,
            [buyerId]
        )
        .catch(() => null);
    if (!row?.credited_at) return null;
    return new Date(new Date(row.credited_at).getTime() + HOLD_DAYS * 86400000);
}
