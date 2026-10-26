import "server-only";

import { randomUUID } from "node:crypto";

import { deleteSquareCatalogObject, getMysteryBagPriceInfoFromSquare, getShopSalesTaxRate } from "@/lib/consignment/square";
import { db } from "@/lib/db";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { syncEarnedBadges } from "@/lib/marketplace/badges.js";
import { packCardSubtitle, parsePackCardName } from "@/lib/marketplace/pack-card-name.js";
import { BIG_HIT_CENTS, tierForCents } from "@/lib/marketplace/pack-rarity.js";
import { addCredit, getStoreCredit, spendCredit } from "@/lib/marketplace/store-credit.js";
import { isPreviewOpen, vaultOpenFor } from "@/lib/marketplace/vault-gate.js";
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

/** The live pack price, in cents. Square is the source; the env override and the default are the fallbacks. */
export async function packPriceCents() {
    const info = await getMysteryBagPriceInfoFromSquare().catch(() => null);
    const fromSquare = Number(info?.price || 0);
    if (fromSquare > 0) return Math.round(fromSquare * 100);
    const fromEnv = Number(process.env.MYSTERY_BAG_PRICE || 0);
    if (fromEnv > 0) return Math.round(fromEnv * 100);
    return DEFAULT_PRICE_CENTS;
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
        tier: tierForCents(valueCents).key,
        itemType: row.item_type || "card",
    };
}

/**
 * What is in the packs, and what a pack costs. Public-facing — this is the "inspect any time" shelf, and it
 * stays honest about a pool the shelf is draining at the same time, so it is never cached across a session.
 */
export async function packPoolSummary() {
    const [rows, priceCents] = await Promise.all([
        db.query(
            `SELECT id, card_name, condition, market_value, image_url, item_type
             FROM mystery_bag_cards
             WHERE status = 'active'
             ORDER BY market_value DESC`
        ),
        packPriceCents(),
    ]);

    const cards = rows.map(toPoolCard);
    const totalCents = cards.reduce((sum, c) => sum + c.valueCents, 0);
    const byTier = {};
    for (const card of cards) byTier[card.tier] = (byTier[card.tier] || 0) + 1;

    return {
        priceCents,
        remaining: cards.length,
        poolValueCents: totalCents,
        evCents: cards.length ? Math.round(totalCents / cards.length) : 0,
        byTier,
        cards,
    };
}

/**
 * The open. Returns `{ ok, open }` or `{ ok:false, error }`.
 *
 * ⚠️ READ THE ORDER OF THE STEPS BEFORE CHANGING ANY OF THEM.
 */
export async function openPack({ buyerId, idempotencyKey = null } = {}) {
    if (!vaultOpenFor(buyerId)) return { ok: false, error: "closed" };

    // A stuck open is RESUMED, never charged for twice. The partial unique index on (buyer_id) where
    // outcome='pending' is what makes this a guarantee rather than a hope.
    const pending = await resumePendingOpen(buyerId);
    if (pending) return { ok: true, open: pending, resumed: true };

    const priceCents = await packPriceCents();
    const balanceCents = await getStoreCredit(buyerId);
    if (balanceCents < priceCents) {
        return { ok: false, error: "insufficient_credit", priceCents, balanceCents };
    }

    // ── 1. CLAIM A BAG ──────────────────────────────────────────────────────────────────────────────────────
    // Inside a transaction, because FOR UPDATE SKIP LOCKED means nothing outside one. Two members tapping at
    // the same moment cannot take the same bag; the loser simply draws a different one.
    const key = idempotencyKey || `vpo:${randomUUID()}`;
    const claimed = await db.tx(async (client) => {
        const picked = await client.query(
            `UPDATE mystery_bag_cards
             SET status = 'reserved', reservation_key = $1, reserved_at = NOW(), updated_at = NOW()
             WHERE id = (
                 SELECT id FROM mystery_bag_cards
                 WHERE status = 'active'
                 ORDER BY random()
                 LIMIT 1
                 FOR UPDATE SKIP LOCKED
             )
             AND status = 'active'
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

    if (!claimed) return { ok: false, error: "pool_empty" };

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

    // ── 2. TAKE THE BAG OFF THE REGISTER, AND WAIT FOR IT ───────────────────────────────────────────────────
    // ⚠️ BEFORE THE CREDIT IS SPENT, AND AWAITED. This is what stops the bag being sold at the counter to
    // somebody else — the SKU is gone, so the POS refuses the scan. If it fails we have taken nothing from the
    // member and the bag goes back in the pool: a bag we could not un-list must not be sold twice.
    //
    // A 'shelf' row (§1.4) has no packed variation and nothing to delete — its single stays on the shelf and
    // is decremented by its own path. Never delete on that branch: the fallback would resolve to the card's
    // own source single and take a real catalogue item with it.
    if (claimed.channel === "bagged" && claimed.packed_variation_id) {
        try {
            await deleteSquareCatalogObject(claimed.packed_variation_id);
        } catch (error) {
            await release("square_delete_failed");
            logger.error("packs.open.square_delete_failed", error, { buyerId, cardId: claimed.id });
            return { ok: false, error: "unavailable" };
        }
    }

    // ── 3. SPEND THE CREDIT ─────────────────────────────────────────────────────────────────────────────────
    // Guarded and atomic — two concurrent spends cannot overdraw. If the balance moved underneath us the bag
    // goes back; the member is never charged for a pack they did not get.
    const spent = await spendCredit(buyerId, priceCents, "pack_open", key, { packOpen: true });
    if (!spent.ok) {
        await release("credit_spend_failed");
        return { ok: false, error: "insufficient_credit", priceCents, balanceCents };
    }

    // ── 4. BOOK IT ──────────────────────────────────────────────────────────────────────────────────────────
    // From here the result EXISTS and is owed to the member, whatever happens to their browser.
    const valueCents = toCents(claimed.market_value);
    const tier = tierForCents(valueCents);
    const taxRate = await getShopSalesTaxRate().catch(() => 0);
    const { revenueCents, taxCents } = splitPriceForTax(priceCents, taxRate);
    const cogs = await resolvePackCost(claimed);

    const row = await db.queryOne(
        `INSERT INTO mkt_pack_open
            (buyer_id, mystery_card_id, price_cents, card_value_cents, tier,
             revenue_cents, tax_cents, cogs_cents, cogs_basis, idempotency_key, preview)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id, created_at`,
        [
            buyerId, claimed.id, priceCents, valueCents, tier.key,
            revenueCents, taxCents, cogs.cents, cogs.basis, key, isPreviewOpen(buyerId),
        ]
    );

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
    if (claimed.channel === "bagged") {
        await db
            .query(
                `INSERT INTO mkt_pack_pull_task (pack_open_id, mystery_card_id, bag_sku)
                 VALUES ($1, $2, $3)`,
                [row.id, claimed.id, claimed.variation_sku || claimed.card_id]
            )
            .catch((error) => logger.warn("packs.open.pull_task_failed", { message: error?.message }));
    }

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
            priceCents,
            balanceCents: spent.balanceCents,
            card: { ...toPoolCard(claimed), valueCents },
            tier: tier.key,
            bigHit: valueCents >= BIG_HIT_CENTS,
            outcome: "pending",
        },
    };
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
    const market = toCents(poolRow.market_value);
    return { cents: Math.round(market * 0.65), basis: "estimate_65" };
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
            `SELECT o.id, o.price_cents, o.card_value_cents, o.tier,
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
        priceCents: row.price_cents,
        balanceCents: await getStoreCredit(buyerId),
        card: { ...toPoolCard({ ...row, id: row.card_id }), valueCents: row.card_value_cents },
        tier: row.tier,
        bigHit: row.card_value_cents >= BIG_HIT_CENTS,
        outcome: "pending",
    };
}

/**
 * Sell it back on the spot, or keep it. The two-button moment the whole reveal builds to.
 *
 * Sell-back pays 100% of the card's value as credit (§5). It is a guarded single transition: the conditional
 * UPDATE on outcome='pending' is what stops a double-tap paying twice.
 */
export async function choosePackOutcome({ buyerId, openId, choice }) {
    if (!vaultOpenFor(buyerId)) return { ok: false, error: "closed" };
    if (choice !== "vault" && choice !== "sell") return { ok: false, error: "bad_choice" };

    const open = await db
        .queryOne(
            `UPDATE mkt_pack_open SET outcome = $3
             WHERE id = $1 AND buyer_id = $2 AND outcome = 'pending'
             RETURNING id, mystery_card_id, card_value_cents, tier`,
            [openId, buyerId, choice === "sell" ? "sold_back" : "vaulted"]
        )
        .catch(() => null);
    if (!open) return { ok: false, error: "already_chosen" };

    const card = await db.queryOne(
        `SELECT id, card_name, condition, image_url, market_value, square_variation_id
         FROM mystery_bag_cards WHERE id = $1`,
        [open.mystery_card_id]
    );
    const valueCents = open.card_value_cents;

    if (choice === "sell") {
        // Sold straight back without ever entering the vault. The physical card never moved, so there is no
        // pull task to honour — cancel it rather than sending somebody to the tub for a card we just re-bought.
        await db
            .query(
                `UPDATE mkt_pack_pull_task SET status = 'done', done_at = NOW(), done_by = 'auto:sold_back',
                        note = 'sold back before leaving the shop'
                 WHERE pack_open_id = $1 AND status = 'open'`,
                [open.id]
            )
            .catch(() => {});
        const balanceCents = await addCredit(buyerId, valueCents, "vault_sellback", open.id, {
            card: card?.card_name, immediate: true,
        });
        await db
            .query(
                `INSERT INTO mkt_vault_event (buyer_id, pack_open_id, action, credit_delta_cents, meta)
                 VALUES ($1, $2, 'sold_back', $3, $4)`,
                [buyerId, open.id, valueCents, JSON.stringify({ card: card?.card_name, atReveal: true })]
            )
            .catch(() => {});
        await trackActivity(buyerId, "pack_sellback", { valueCents }).catch(() => {});
        return { ok: true, choice, creditedCents: valueCents, balanceCents };
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
