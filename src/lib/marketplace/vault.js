import "server-only";

import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { INSURE_OVER_CENTS, getShippingRates, insuranceCostCents, isEasyPostEnabled } from "@/lib/shipping/easypost";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { tierByKey } from "@/lib/marketplace/pack-rarity.js";
import { releasableAt } from "@/lib/marketplace/packs.js";
import { addCredit, spendCredit } from "@/lib/marketplace/store-credit.js";
import { buyBackCents } from "@/lib/marketplace/buyback.js";
import { completeBuyBack } from "@/lib/marketplace/vault-restock.js";
import { poolByKey } from "@/lib/marketplace/pack-pools.js";
import { vaultOpenFor } from "@/lib/marketplace/vault-gate.js";
import { createServerLogger } from "@/lib/server-logger";

const logger = createServerLogger({ source: "api", subsystem: "vault" });

// ── THE CARD VAULT ───────────────────────────────────────────────────────────────────────────────────────────
// Cards a member pulled and kept. They can sell any of them back for store credit at any time, ship them, or
// collect them from the shop.
//
// ⚠️ A VAULT CARD IS A REAL CARD IN OUR BUILDING. Everything here moves physical stock or real money, so every
// transition is guarded on the row's current status rather than on what the client believed when it rendered.

const money = (cents) => Math.max(0, Math.round(Number(cents) || 0));

function toVaultCard(row) {
    const tier = tierByKey(row.tier);
    return {
        id: row.id,
        name: row.card_name,
        subtitle: [row.set_name, row.card_number, row.condition].filter(Boolean).join(" · "),
        setName: row.set_name,
        cardNumber: row.card_number,
        condition: row.condition,
        imageUrl: row.image_url,
        tier: row.tier,
        tierLabel: tier.label,
        glow: tier.glow,
        edge: tier.edge,
        valueCents: money(row.current_value_cents),
        // ⚠️ SENT, NOT DERIVED — the same rule as the pack payload. Two numbers live on a vault card now and
        //    they are not interchangeable: what it is WORTH, and what we would PAY for it.
        sellBackCents: buyBackCents(money(row.current_value_cents)),
        pulledValueCents: money(row.pulled_value_cents),
        status: row.status,
        orderId: row.order_id || null,
        // Null means releasable now. A date means the credit that bought it has not settled yet (§12).
        releasableAt: row.releasable_at || null,
        releasable: !row.releasable_at || new Date(row.releasable_at) <= new Date(),
        pulledAt: row.created_at,
    };
}

/**
 * ── ⚠️ THE ONLY WAY A CARD LEAVES THE VAULT INTO A MEMBER'S HANDS ────────────────────────────────────────────
 * Until this existed the vault had exactly two exits: sold back, or a member-placed order — and the order path
 * only ever went 'held' → 'on_order' → ('held' again, on cancel). NOTHING anywhere moved a card to a terminal
 * state when the member actually walked out with it.
 *
 * What that cost, on 2026-10-29: Anamarisa collected nine cards at the counter, Eric marked the shelf jobs
 * Done in the employee app, and all nine stayed 'held' in her vault — still listed, still carrying a sell-back
 * price. $122 of cards she was holding in her hand and could also have sold back to us for credit.
 *
 * Luke: "When Eric marks them as picked up or done or whatever, they should definitely get removed from her
 * card vault. Otherwise, she can just sell them back and exploit the system."
 *
 * ⚠️ 'collected' IS DELIBERATELY NOT 'sold_back'. The refund path next door reuses 'sold_back' for a missing
 * bag, which is honest there — the member got credit. Here the member got the CARD, and a row that claims we
 * bought it back would put a sale in the books that never happened. The two must stay distinguishable in the
 * ledger for exactly as long as anybody asks "where did this card go".
 *
 * ⚠️ MATCHES 'held' AND 'on_order'. A card can be handed over at the counter whether or not the member ever
 * raised an order for it, and both were sellable-after-the-fact in their own way: 'held' directly, 'on_order'
 * by cancelling the order first. Closing one door and not the other would have left the exploit intact.
 */
export async function collectVaultCards({ buyerId = null, cardIds = null, packOpenId = null, orderId = null, by = "staff" }) {
    const where = [];
    const args = [];
    if (buyerId) { args.push(buyerId); where.push(`buyer_id = $${args.length}`); }
    if (cardIds?.length) { args.push(cardIds); where.push(`id = ANY($${args.length}::uuid[])`); }
    if (packOpenId) { args.push(packOpenId); where.push(`pack_open_id = $${args.length}`); }
    if (orderId) { args.push(orderId); where.push(`order_id = $${args.length}`); }
    // ⚠️ A GUARD, NOT A CONVENIENCE. With no selector this would collect every card in the table, and the
    // callers below build their selectors from request bodies.
    if (!where.length) return [];

    args.push(String(by || "staff").slice(0, 60));
    const byArg = `$${args.length}`;
    const rows = await db.query(
        `UPDATE mkt_vault_card
         SET status = 'collected', collected_at = NOW(), collected_by = ${byArg}, updated_at = NOW()
         WHERE ${where.join(" AND ")} AND status IN ('held', 'on_order')
         RETURNING id, buyer_id, card_name, current_value_cents`,
        args
    );
    // One event per card so the member's own vault history says where it went, in the same list that
    // already shows them opening and selling. A silent disappearance is the thing support cannot answer.
    for (const r of rows) {
        await db.query(
            `INSERT INTO mkt_vault_event (buyer_id, action, credit_delta_cents, meta)
             VALUES ($1, 'collected', 0, $2)`,
            [r.buyer_id, JSON.stringify({ card: r.card_name, valueCents: r.current_value_cents, by })]
        ).catch(() => {});
    }
    return rows;
}

/** Everything the vault screen needs, in one read. */
export async function getVault(buyerId) {
    if (!vaultOpenFor(buyerId)) return null;

    const [cards, events, order, lifetime] = await Promise.all([
        db.query(
            `SELECT id, card_name, set_name, card_number, condition, image_url, tier,
                    pulled_value_cents, current_value_cents, status, order_id, releasable_at, created_at
             FROM mkt_vault_card
             WHERE buyer_id = $1 AND status IN ('held', 'on_order')
             ORDER BY current_value_cents DESC, created_at DESC`,
            [buyerId]
        ),
        db.query(
            `SELECT id, action, credit_delta_cents, meta, created_at
             FROM mkt_vault_event
             WHERE buyer_id = $1
             ORDER BY created_at DESC
             LIMIT 60`,
            [buyerId]
        ),
        db.query(
            `SELECT o.id, o.fulfillment_mode, o.fulfillment_status, o.status, o.tracking_number,
                    o.shipping_carrier, o.total_cents, o.created_at,
                    COUNT(v.id)::int AS card_count
             FROM shop_orders o
             JOIN mkt_vault_card v ON v.order_id = o.id
             WHERE v.buyer_id = $1
             GROUP BY o.id
             ORDER BY o.created_at DESC
             LIMIT 25`,
            [buyerId]
        ),
        // ── ⚠️ ITS OWN AGGREGATE, NOT A SUM OVER `events` ───────────────────────────────────────────────
        // The obvious move is to add up the sold_back rows already in hand and save a round trip. That list
        // is `LIMIT 60`, so the lifetime figure would be right for everybody until somebody's sixty-first
        // event and then silently start shrinking — a number that goes DOWN when you sell another card.
        // A quiet wrong answer costs more than a query on a page a member opened on purpose.
        //
        // It cannot come from mkt_vault_card.sold_back_cents either: selling at the reveal never creates a
        // vault card, so half the history lives only in the event table.
        db.queryOne(
            `SELECT COALESCE(SUM(credit_delta_cents), 0)::int AS cents
             FROM mkt_vault_event
             WHERE buyer_id = $1 AND action = 'sold_back' AND credit_delta_cents > 0`,
            [buyerId]
        ),
    ]);

    const mapped = cards.map(toVaultCard);
    const held = mapped.filter((c) => c.status === "held");
    const onOrder = mapped.filter((c) => c.status === "on_order");

    return {
        held,
        onOrder,
        orders: order.map((o) => ({
            id: o.id,
            mode: o.fulfillment_mode,
            fulfillmentStatus: o.fulfillment_status,
            status: o.status,
            trackingNumber: o.tracking_number,
            carrier: o.shipping_carrier,
            totalCents: money(o.total_cents),
            cardCount: o.card_count,
            createdAt: o.created_at,
            // ⚠️ Luke's call: a PICKUP order can be self-cancelled right up until it is picked up — even once
            //    staff have prepared it. A prepared-then-cancelled order raises a re-file task so the cards do
            //    not sit in a holding bag the system believes are back in the vault.
            canCancel: o.fulfillment_mode === "pickup"
                && !["picked_up", "cancelled"].includes(o.fulfillment_status),
        })),
        history: events.map((e) => ({
            id: Number(e.id),
            action: e.action,
            creditDeltaCents: Number(e.credit_delta_cents || 0),
            meta: e.meta || null,
            at: e.created_at,
        })),
        totals: {
            heldCount: held.length,
            heldValueCents: held.reduce((sum, c) => sum + c.valueCents, 0),
            // ⚠️ SUMMED PER CARD, NEVER RATED ON THE TOTAL. buyBackCents rounds up to a quarter, so rating a
            //    basket once pays less than rating each card — selling five together would quietly be worth
            //    less than selling them one at a time.
            heldSellBackCents: held.reduce((sum, c) => sum + c.sellBackCents, 0),
            onOrderCount: onOrder.length,
            // Everything this member has ever taken back in credit. It only goes up, which is the point:
            // it is the one number on this screen that always reads as winning, and it is simply true.
            earnedBackCents: Number(lifetime?.cents || 0),
        },
    };
}

/**
 * Sell cards back to us for store credit, at the counter's trade rate — see buyback.js.
 *
 * ⚠️ THE CREDIT GOES OUT FIRST, AND THE SQUARE RESTOCK IS BEST-EFFORT AFTER IT. That ordering is deliberate:
 * the member's money is the part that has to be right, and a Square outage must not leave somebody holding
 * neither the card nor the credit. A restock that fails leaves a loud warning and a card for a human to put
 * back — recoverable. A credit that fails after we took the card is not.
 */
export async function sellVaultCards({ buyerId, cardIds }) {
    if (!vaultOpenFor(buyerId)) return { ok: false, error: "closed" };
    const ids = (Array.isArray(cardIds) ? cardIds : []).filter(Boolean).slice(0, 50);
    if (!ids.length) return { ok: false, error: "nothing_selected" };

    // Guarded on status: a card already in an order, or already sold, cannot be sold again. The UPDATE is the
    // claim — two taps can only win once.
    const claimed = await db.query(
        `UPDATE mkt_vault_card
         SET status = 'sold_back', sold_back_at = NOW(), updated_at = NOW()
         WHERE buyer_id = $1 AND id = ANY($2::uuid[]) AND status = 'held'
         RETURNING id, card_name, set_name, card_number, condition, image_url,
                   square_variation_id, current_value_cents, tier, mystery_card_id`,
        [buyerId, ids]
    );
    if (!claimed.length) return { ok: false, error: "nothing_sellable" };

    // ⚠️ sold_back_cents IS WHAT WE PAID, NOT WHAT THE CARD WAS WORTH. It used to be set to
    //    current_value_cents inside the claiming UPDATE, which was correct only while the rate was 100%.
    //    Written here instead, from buyBackCents, so the column cannot silently keep meaning "market" —
    //    the History tab reads it back as "sold back for $X" and would have been off by 40% forever.
    //
    // ⚠️ AND IT IS RATED PER CARD, NEVER ON THE TOTAL. buyBackCents rounds up to a quarter, so rating a
    //    basket once pays less than rating each card and adding them up — the member would be quietly
    //    charged for selling two cards together instead of one at a time.
    const payouts = new Map(claimed.map((c) => [c.id, buyBackCents(money(c.current_value_cents))]));
    for (const card of claimed) {
        await db
            .query(`UPDATE mkt_vault_card SET sold_back_cents = $2 WHERE id = $1`, [card.id, payouts.get(card.id)])
            .catch(() => {});
    }

    const totalCents = claimed.reduce((sum, c) => sum + payouts.get(c.id), 0);
    const ref = `vault:${randomUUID()}`;
    const balanceCents = await addCredit(buyerId, totalCents, "vault_sellback", ref, {
        cards: claimed.map((c) => c.card_name),
    });

    for (const card of claimed) {
        await db
            .query(
                `INSERT INTO mkt_vault_event (buyer_id, vault_card_id, action, credit_delta_cents, meta)
                 VALUES ($1, $2, 'sold_back', $3, $4)`,
                [
                    buyerId,
                    card.id,
                    payouts.get(card.id),
                    JSON.stringify({ card: card.card_name, marketCents: money(card.current_value_cents) }),
                ]
            )
            .catch(() => {});
    }

    // ── ⚠️ WHICH POOL EACH CARD CAME OUT OF ─────────────────────────────────────────────────────────────
    // A vault card does not carry its pool; the pool row it was pulled from does. One lookup rather than a
    // column, because this is the only place that needs it — and it is the place the category bug lived:
    // without it a Magic single re-created on this path comes back as a Pokémon one.
    const poolByCard = new Map();
    const poolRowIds = claimed.map((c) => c.mystery_card_id).filter(Boolean);
    if (poolRowIds.length) {
        const rows = await db
            .query(`SELECT id, pool FROM mystery_bag_cards WHERE id = ANY($1::uuid[])`, [poolRowIds])
            .catch(() => []);
        for (const r of rows) poolByCard.set(r.id, r.pool);
    }

    // ── The card becomes sellable again, and the trade ledger learns we bought it ──────────────────────────
    // ⚠️ THE SAME FUNCTION THE REVEAL'S SELL BUTTON CALLS. Those two were separate once and immediately
    //    disagreed: selling at the reveal restocked nothing, recorded no cost and posted no trade. One
    //    payout, one path.
    const restocked = await completeBuyBack({
        buyerId,
        cards: claimed.map((card) => ({
            squareVariationId: card.square_variation_id,
            name: card.card_name,
            subtitle: [card.set_name, card.card_number, card.condition].filter(Boolean).join(" · "),
            setName: card.set_name,
            cardNumber: card.card_number,
            condition: card.condition,
            imageUrl: card.image_url,
            // ⚠️ A VAULT CARD REMEMBERS WHICH POOL IT CAME OUT OF, through the pool row it was pulled from.
            //    This is the path the category bug actually lived on: hold a Magic single, let its sold-out
            //    item get deleted, sell it back a week later, and the restock re-creates it — as Pokémon,
            //    unless somebody says otherwise. See categoryForVariation in vault-restock.js.
            categoryName: poolByKey(poolByCard.get(card.mystery_card_id))?.category || null,
            // ⚠️ MARKET, NOT THE PAYOUT — completeBuyBack re-rates it into what we paid. The card goes back
            //    on the shelf at what it is worth.
            valueCents: money(card.current_value_cents),
            vaultCardId: card.id,
        })),
    }).catch((error) => {
        logger.error("vault.sell.buyback_failed", error, { buyerId });
        return [];
    });

    for (const { card, result } of restocked) {
        if (result?.variationId && result.variationId !== card.squareVariationId) {
            await db
                .query(`UPDATE mkt_vault_card SET square_variation_id = $2 WHERE id = $1`,
                    [card.vaultCardId, result.variationId])
                .catch(() => {});
        }
    }

    await trackActivity(buyerId, "vault_sellback", { cents: totalCents, count: claimed.length }).catch(() => {});
    logger.info("vault.sell.success", { buyerId, count: claimed.length, totalCents });

    return { ok: true, soldCount: claimed.length, creditedCents: totalCents, balanceCents };
}

/** Cards eligible to leave the building right now — the hold in §12 is applied here, not in the UI. */
export async function releasableCards(buyerId, cardIds) {
    const rows = await db.query(
        `SELECT id, card_name, current_value_cents, releasable_at, square_variation_id
         FROM mkt_vault_card
         WHERE buyer_id = $1 AND id = ANY($2::uuid[]) AND status = 'held'`,
        [buyerId, cardIds]
    );
    const now = new Date();
    return {
        ready: rows.filter((r) => !r.releasable_at || new Date(r.releasable_at) <= now),
        held: rows.filter((r) => r.releasable_at && new Date(r.releasable_at) > now),
    };
}

/** Refresh the hold stamp on every held card — used after a credit purchase settles. */
export async function refreshReleaseHold(buyerId) {
    const at = await releasableAt(buyerId);
    await db
        .query(`UPDATE mkt_vault_card SET releasable_at = $2, updated_at = NOW() WHERE buyer_id = $1 AND status = 'held'`,
            [buyerId, at])
        .catch(() => {});
}

// ── GETTING THE CARDS OUT OF THE BUILDING ────────────────────────────────────────────────────────────────────
// A vault shipment is a row in `shop_orders`, not a parallel order system. That one decision is what puts it
// on the admin and employee orders screens that already exist, with no new screen to build.

const PICKUP = "pickup";
const SHIPPING = "shipping";

/**
 * Quote a shipment before the member commits to it.
 *
 * ⚠️ THE QUOTE INCLUDES INSURANCE AND THE RATE DOES NOT. EasyPost bills insurance when the LABEL IS BOUGHT,
 * so a price built from the rate alone is short by exactly that much — and we would absorb the difference on
 * precisely the shipments where it is largest. The estimate is added here and the figure is remembered on the
 * order so the label purchase charges what the member was told.
 */
export async function quoteVaultShipping({ buyerId, cardIds, toAddress }) {
    if (!vaultOpenFor(buyerId)) return { ok: false, error: "closed" };

    const { ready, held } = await releasableCards(buyerId, cardIds || []);
    if (!ready.length) return { ok: false, error: held.length ? "on_hold" : "nothing_selected", held };

    const declaredCents = ready.reduce((sum, c) => sum + money(c.current_value_cents), 0);
    const insured = declaredCents >= INSURE_OVER_CENTS;
    const insuranceCents = insured ? insuranceCostCents(declaredCents) : 0;

    if (!isEasyPostEnabled()) {
        return { ok: false, error: "shipping_unavailable" };
    }

    // One parcel: cards are light and flat, so the existing weight model is already right for them.
    const quote = await getShippingRates({
        toAddress,
        items: ready.map(() => ({ quantity: 1, catalogObjectId: "vault-card" })),
    }).catch(() => null);
    if (!quote?.rates?.length) return { ok: false, error: "no_rates" };

    return {
        ok: true,
        shipmentId: quote.shipmentId,
        declaredCents,
        insured,
        insuranceCents,
        cardCount: ready.length,
        heldBack: held.map((h) => ({ id: h.id, name: h.card_name, releasableAt: h.releasable_at })),
        rates: quote.rates.map((r) => ({
            ...r,
            // What the member will actually be charged, which is the only number worth showing them.
            totalCents: r.amountCents + insuranceCents,
        })),
    };
}

/**
 * Create the order. Pickup is free; shipping is paid in store credit or left for a card charge.
 *
 * ⚠️ THE CARDS ARE CLAIMED BEFORE ANYTHING IS CHARGED, and the claim is a guarded UPDATE on status='held'.
 * A card that is already on another order, or already sold back, simply is not claimed — so two taps cannot
 * put one card on two orders.
 */
export async function createVaultOrder({
    buyerId, cardIds, mode, shipping = null, shipmentId = null, rateId = null,
    shippingCents = 0, insuranceCents = 0, payWithCredit = true,
}) {
    if (!vaultOpenFor(buyerId)) return { ok: false, error: "closed" };
    const fulfillment = mode === SHIPPING ? SHIPPING : PICKUP;
    const ids = (Array.isArray(cardIds) ? cardIds : []).filter(Boolean).slice(0, 50);
    if (!ids.length) return { ok: false, error: "nothing_selected" };

    const { ready, held } = await releasableCards(buyerId, ids);
    if (!ready.length) {
        return { ok: false, error: held.length ? "on_hold" : "nothing_selected", held: held.map((h) => h.card_name) };
    }

    const costCents = fulfillment === SHIPPING ? money(shippingCents) + money(insuranceCents) : 0;

    // Shipping is charged BEFORE the order exists, so a failed payment leaves nothing half-made.
    if (costCents > 0 && payWithCredit) {
        const spent = await spendCredit(buyerId, costCents, "spend_online", `vault-ship:${buyerId}`, {
            cards: ready.length,
        });
        if (!spent.ok) return { ok: false, error: "insufficient_credit", neededCents: costCents };
    }

    const itemsJson = ready.map((c) => ({
        catalogObjectId: c.square_variation_id || "vault-card",
        name: c.card_name,
        quantity: 1,
        // ⚠️ ZERO. The card was paid for when the pack was opened; a vault shipment carries no merchandise
        //    revenue, and billing it again would charge a member twice for one card.
        unitPriceCents: 0,
        vaultCardId: c.id,
    }));

    const order = await db.queryOne(
        `INSERT INTO shop_orders
            (catalog_object_id, item_name, quantity, subtotal_cents, online_fee_cents, tax_cents,
             shipping_cents, insurance_cents, total_cents, idempotency_key, items_json, fulfillment_mode,
             shipping_name, shipping_email, shipping_phone, shipping_address_line1, shipping_address_line2,
             shipping_city, shipping_state, shipping_postal_code, shipping_country,
             easypost_shipment_id, easypost_rate_id, customer_email, vault_order, status, square_status)
         VALUES ('VAULT', $1, $2, 0, 0, $3, $4, $5, $6, $7, $8::jsonb, $9,
                 $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $11, TRUE, 'completed', 'VAULT')
         RETURNING id, created_at`,
        [
            `Vault ${fulfillment === PICKUP ? "pickup" : "shipment"} (${ready.length} card${ready.length === 1 ? "" : "s"})`,
            ready.length,
            // ⚠️ subtotal is 0, so the taxable base is the SHIPPING alone (§7.4). Tax on the cards was taken
            //    at the open; charging it again here would tax one card twice.
            0,
            money(shippingCents),
            money(insuranceCents),
            costCents,
            `vault-${randomUUID()}`,
            JSON.stringify(itemsJson),
            fulfillment,
            shipping?.name || null, shipping?.email || null, shipping?.phone || null,
            shipping?.addressLine1 || null, shipping?.addressLine2 || null, shipping?.city || null,
            shipping?.state || null, shipping?.postalCode || null, shipping?.country || "US",
            shipmentId, rateId,
        ]
    );

    const claimed = await db.query(
        `UPDATE mkt_vault_card
         SET status = 'on_order', order_id = $3, updated_at = NOW()
         WHERE buyer_id = $1 AND id = ANY($2::uuid[]) AND status = 'held'
         RETURNING id, card_name, mystery_card_id`,
        [buyerId, ready.map((r) => r.id), order.id]
    );

    // ⚠️ AN ORDER ON AN UN-PULLED BAG JUMPS THE QUEUE. There is no deadline on the pull queue (Luke's call),
    //    so the order IS the signal that somebody is about to turn up for a card still sealed in a bag.
    //    Without this, "no deadline" becomes a member at the counter while someone digs through a tub.
    await db
        .query(
            `UPDATE mkt_pack_pull_task
             SET promoted = TRUE
             WHERE status = 'open'
               AND mystery_card_id = ANY($1::uuid[])`,
            [claimed.map((c) => c.mystery_card_id).filter(Boolean)]
        )
        .catch(() => {});

    await db
        .query(
            `INSERT INTO mkt_vault_event (buyer_id, action, credit_delta_cents, meta)
             VALUES ($1, 'ordered', $2, $3)`,
            [buyerId, -costCents, JSON.stringify({ orderId: order.id, mode: fulfillment, cards: claimed.length })]
        )
        .catch(() => {});

    await trackActivity(buyerId, "vault_order", { mode: fulfillment, cards: claimed.length }).catch(() => {});
    logger.info("vault.order.created", { buyerId, orderId: order.id, mode: fulfillment, cards: claimed.length });

    return {
        ok: true,
        orderId: order.id,
        mode: fulfillment,
        cardCount: claimed.length,
        chargedCents: costCents,
        heldBack: held.map((h) => h.card_name),
    };
}

/**
 * The member cancels their own pickup order.
 *
 * ⚠️ ALLOWED RIGHT UP UNTIL PICKUP, INCLUDING AFTER STAFF HAVE PREPARED IT (Luke's call). Which means a
 * cancelled order can leave sleeved cards sitting in a holding bag that the system now believes are back in
 * the vault — so a prepared order raises a RE-FILE task on the same queue as the pulls. Without that, the tub
 * and the database quietly part company and nobody finds out until somebody goes looking for a card.
 *
 * Shipping orders are not self-cancellable: a bought label is real money, and that falls back to the existing
 * request-cancel review.
 */
export async function cancelVaultOrder({ buyerId, orderId }) {
    if (!vaultOpenFor(buyerId)) return { ok: false, error: "closed" };

    const order = await db.queryOne(
        `SELECT id, fulfillment_mode, fulfillment_status, shipping_cents, insurance_cents, total_cents
         FROM shop_orders WHERE id = $1 AND vault_order = TRUE`,
        [orderId]
    );
    if (!order) return { ok: false, error: "not_found" };
    if (order.fulfillment_mode !== PICKUP) return { ok: false, error: "shipping_order" };
    if (["picked_up", "cancelled"].includes(order.fulfillment_status)) {
        return { ok: false, error: "too_late" };
    }

    const wasPrepared = order.fulfillment_status === "ready";

    const returned = await db.query(
        `UPDATE mkt_vault_card
         SET status = 'held', order_id = NULL, updated_at = NOW()
         WHERE buyer_id = $1 AND order_id = $2 AND status = 'on_order'
         RETURNING id, card_name, mystery_card_id`,
        [buyerId, orderId]
    );
    if (!returned.length) return { ok: false, error: "nothing_to_cancel" };

    await db.query(
        `UPDATE shop_orders
         SET fulfillment_status = 'cancelled', status = 'canceled', updated_at = NOW()
         WHERE id = $1`,
        [orderId]
    );

    if (wasPrepared) {
        for (const card of returned) {
            await db
                .query(
                    `INSERT INTO mkt_pack_pull_task (pack_open_id, mystery_card_id, bag_sku, kind, note)
                     SELECT o.id, $1, COALESCE(c.variation_sku, c.card_id), 'refile',
                            'Pickup order cancelled after it was prepared — put this card back'
                     FROM mkt_vault_card v
                     JOIN mystery_bag_cards c ON c.id = v.mystery_card_id
                     JOIN mkt_pack_open o ON o.id = v.pack_open_id
                     WHERE v.id = $2
                     LIMIT 1`,
                    [card.mystery_card_id, card.id]
                )
                .catch((error) => logger.warn("vault.cancel.refile_failed", { message: error?.message }));
        }
        logger.info("vault.cancel.refile_raised", { orderId, cards: returned.length });
    }

    await db
        .query(
            `INSERT INTO mkt_vault_event (buyer_id, action, credit_delta_cents, meta)
             VALUES ($1, 'cancelled', 0, $2)`,
            [buyerId, JSON.stringify({ orderId, cards: returned.length, wasPrepared })]
        )
        .catch(() => {});

    logger.info("vault.order.cancelled", { buyerId, orderId, cards: returned.length, wasPrepared });
    return { ok: true, returnedCount: returned.length, wasPrepared };
}

/**
 * How many cards the member is holding, and what they are worth — for a CTA that has to earn its place.
 *
 * ⚠️ THE SAME PREDICATE getVault USES, deliberately: status IN ('held','on_order'). A count that disagrees
 * with the screen it links to is worse than no count, and 'held' alone would drop cards already on their way
 * to the member — who would read that as the vault losing them.
 *
 * Cheap on purpose (one aggregate, no rows) because it is read on a screen that is not the vault.
 */
export async function vaultSummary(buyerId) {
    if (!buyerId || !vaultOpenFor(buyerId)) return null;
    const row = await db
        .queryOne(
            `SELECT COUNT(*)::int AS cards, COALESCE(SUM(current_value_cents), 0)::bigint AS cents
               FROM mkt_vault_card
              WHERE buyer_id = $1 AND status IN ('held', 'on_order')`,
            [buyerId]
        )
        .catch(() => null);
    if (!row) return null;
    return { cards: Number(row.cards) || 0, valueCents: Number(row.cents) || 0 };
}
