import "server-only";

import { db } from "@/lib/db";

// ── SELLING RULES PER PRODUCT ────────────────────────────────────────────────────────────────────────────────
// Luke: "for certain select items I need the ability to either prevent them from being sold on the store or
// in-store pickup only ... I don't want bots to buy them all out, because I really want to leverage these
// competitive prices to get real customers coming in the door."
//
// Two independent flags, both per Square variation:
//
//   PICKUP ONLY     the item cannot be shipped. Checkout refuses a shipping order that contains one.
//   LIMIT N         at most N per customer, for the current run of stock.
//
// ⚠️ PICKUP-ONLY IS THE STRONGER ANTI-BOT MEASURE OF THE TWO, and it is worth being clear about why: every
// signal the limit matches on can be varied by someone determined enough — a fresh inbox is free, a
// residential proxy is cheap. Making somebody physically stand in a shop in Montgomery cannot be scripted.
// The limit exists to stop the easy, high-volume version of the attack and to stop one person reserving the
// whole shelf; pickup-only is what actually protects the stock, and it is also the thing that gets people
// through the door, which was the point of the prices in the first place.

export const SIGNALS = Object.freeze(["account", "email", "phone", "address", "ip", "card"]);

// ── NORMALISING THE SIGNALS ──────────────────────────────────────────────────────────────────────────────────
// Matching on the raw strings catches nobody. Everything below is the cheap, well-known version of each trick.

/**
 * ⚠️ PLUS-TAGS AND DOTS ARE THE SAME INBOX, and this is the single highest-value line in the file.
 * luke+1@gmail.com, luke+2@gmail.com and l.u.k.e@gmail.com all deliver to luke@gmail.com — it is the first
 * thing anybody reaches for to look like fifty customers, it takes no tooling at all, and collapsing them is
 * four lines of string work.
 *
 * The plus-tag is stripped for every provider (the convention is near-universal and nobody loses a real
 * address to it). Dots are stripped only for Google, because elsewhere they are significant.
 */
export function normalizeEmail(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw.includes("@")) return "";
    const [localRaw, domain] = raw.split("@");
    const local = localRaw.split("+")[0];
    const isGoogle = domain === "gmail.com" || domain === "googlemail.com";
    const cleaned = isGoogle ? local.replace(/\./g, "") : local;
    if (!cleaned || !domain) return "";
    return `${cleaned}@${isGoogle ? "gmail.com" : domain}`;
}

/** Digits only, and the US country code dropped, so +1 507 555 0123 and (507) 555-0123 are one number. */
export function normalizePhone(value) {
    const digits = String(value || "").replace(/\D/g, "");
    const trimmed = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
    return trimmed.length >= 10 ? trimmed : "";
}

/**
 * Street + ZIP5, lowercased, punctuation gone, and the common unit words folded together.
 *
 * ⚠️ DELIBERATELY IGNORES THE NAME AND THE UNIT NUMBER. Ordering under "J. Smith" and then "John Smith" to the
 * same house is the obvious dodge, so the name is not part of this. Apartment numbers are left out for the
 * same reason — "Apt 4" and "#4" and "Unit 4" are one address typed three ways.
 *
 * The cost of that choice is real and it is the reason IP and address do not hard-block on their own in a
 * world where two flatmates genuinely both want one. Here they do, because Luke's call was: "whenever we
 * detect we say that its limited 1."
 */
export function normalizeAddress(line1, postalCode) {
    const street = String(line1 || "")
        .toLowerCase()
        .replace(/[.,#]/g, " ")
        .replace(/\b(apartment|apt|unit|suite|ste|number|no)\b\s*\w*/g, " ")
        .replace(/\b(street|st)\b/g, "st")
        .replace(/\b(avenue|ave)\b/g, "ave")
        .replace(/\b(road|rd)\b/g, "rd")
        .replace(/\b(drive|dr)\b/g, "dr")
        .replace(/\b(lane|ln)\b/g, "ln")
        .replace(/\b(court|ct)\b/g, "ct")
        .replace(/\b(north|n)\b/g, "n")
        .replace(/\b(south|s)\b/g, "s")
        .replace(/\b(east|e)\b/g, "e")
        .replace(/\b(west|w)\b/g, "w")
        .replace(/\s+/g, " ")
        .trim();
    // ⚠️ AND A TRAILING BARE NUMBER IS A UNIT NUMBER. Stripping the word "apt" is not enough: "123 Main
    // St #4" loses its hash to the punctuation pass and arrives here as "123 main st 4", which would not match
    // the same address written "Apt 4". The house number is the FIRST token and is kept; a loose number after
    // the street name is a unit. "42nd" and "7th" survive because they carry two letters.
    const tokens = street.split(" ").filter(Boolean);
    const cleaned = tokens.filter((t, i) => i === 0 || !/^\d+[a-z]?$/.test(t)).join(" ");
    const zip = String(postalCode || "").replace(/\D/g, "").slice(0, 5);
    return cleaned && zip ? `${cleaned}|${zip}` : "";
}

/**
 * The caller's IP.
 *
 * ⚠️ THE FIRST ENTRY OF x-forwarded-for, NOT THE LAST. The header is a chain the proxies append to, so the
 * left-most value is the client and everything after it is infrastructure. Reading the end of it would key
 * every order in the world to one Vercel edge address and refuse the second customer of the day.
 */
export function clientIpFrom(request) {
    const fwd = request?.headers?.get?.("x-forwarded-for") || "";
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
    return request?.headers?.get?.("x-real-ip")?.trim() || "";
}

/**
 * The set of signals that identify one buyer, from everything a checkout knows about them.
 *
 * Returns [{ kind, value }] with the empties dropped — a guest with no phone simply contributes fewer
 * signals rather than contributing an empty one that would collide with every other blank.
 */
export function identitySignals({ customerId, email, phone, addressLine1, postalCode, ip, cardFingerprint } = {}) {
    const out = [];
    const push = (kind, value) => { if (value) out.push({ kind, value: String(value) }); };
    push("account", customerId);
    push("email", normalizeEmail(email));
    push("phone", normalizePhone(phone));
    push("address", normalizeAddress(addressLine1, postalCode));
    push("ip", String(ip || "").trim());
    push("card", cardFingerprint);
    return out;
}

// ── READING THE RULES ────────────────────────────────────────────────────────────────────────────────────────

/**
 * Rules for a set of variations, as a map. One query however many ids.
 *
 * ⚠️ RETURNS {} RATHER THAN THROWING when the table is unreachable, and every caller treats a missing rule as
 * "no restriction". That is the correct failure direction for a storefront: a database hiccup must not make
 * the shop refuse orders it has no reason to refuse. The claim INSERT is what actually enforces the limit,
 * and that one is allowed to fail loudly.
 */
export async function getItemRules(variationIds = []) {
    const ids = [...new Set((variationIds || []).filter(Boolean).map(String))];
    if (!ids.length) return {};
    const rows = await db.query(
        `SELECT variation_id, pickup_only, limit_per_customer, run_started_at
           FROM shop_item_rules
          WHERE variation_id = ANY($1)
            AND (pickup_only = TRUE OR limit_per_customer IS NOT NULL)`,
        [ids],
    ).catch(() => []);
    const map = {};
    for (const r of rows || []) {
        map[r.variation_id] = {
            variationId: r.variation_id,
            pickupOnly: Boolean(r.pickup_only),
            limitPerCustomer: r.limit_per_customer == null ? null : Number(r.limit_per_customer),
            runStartedAt: r.run_started_at,
        };
    }
    return map;
}

/** One variation's rule, or null. */
export async function getItemRule(variationId) {
    return (await getItemRules([variationId]))[variationId] || null;
}

// ── THE CART CHECK ───────────────────────────────────────────────────────────────────────────────────────────

/**
 * Everything that can refuse a cart, decided before a card is charged.
 *
 * Returns { ok, code, error, items } — `items` names the offending products so the message can say which one
 * rather than "something in your cart".
 *
 * ⚠️ READ-ONLY. It does NOT claim anything. Claiming happens once, immediately before payment, because a
 * claim that is taken during a cart preview would lock a customer out of their own order.
 */
export async function checkCartRules(cartItems, { fulfillmentMode, customerId, signals = [] } = {}) {
    const lines = (cartItems || []).map((i) => ({
        id: String(i?.catalogObjectId || ""),
        name: i?.name || "that item",
        qty: Math.max(1, Number(i?.quantity) || 1),
    })).filter((l) => l.id);
    if (!lines.length) return { ok: true };

    const rules = await getItemRules(lines.map((l) => l.id));
    if (!Object.keys(rules).length) return { ok: true };

    // ── 1. PICKUP ONLY ──────────────────────────────────────────────────────────────────────────────
    if (fulfillmentMode === "shipping") {
        const blocked = lines.filter((l) => rules[l.id]?.pickupOnly);
        if (blocked.length) {
            return {
                ok: false,
                code: "pickup_only",
                items: blocked.map((l) => l.name),
                error: blocked.length === 1
                    ? `${blocked[0].name} is in-store pickup only and can't be shipped. Switch to pickup, or remove it to ship the rest.`
                    : "Some items in your cart are in-store pickup only and can't be shipped. Switch to pickup, or remove them to ship the rest.",
            };
        }
    }

    // ── 2. THE LIMIT ────────────────────────────────────────────────────────────────────────────────
    const limited = lines.filter((l) => rules[l.id]?.limitPerCustomer != null);
    if (!limited.length) return { ok: true };

    // ⚠️ AN ACCOUNT IS REQUIRED, AND THIS IS THE GATE THAT MATTERS MOST. Guest checkout is where the cheap
    // version of this attack lives: an email address costs nothing and there is an endless supply. Luke's
    // call. It costs some impulse buys and it is worth it on these specific items.
    if (!customerId) {
        return {
            ok: false,
            code: "account_required",
            items: limited.map((l) => l.name),
            error: limited.length === 1
                ? `${limited[0].name} is limited to ${rules[limited[0].id].limitPerCustomer} per customer, so you'll need to sign in to buy it.`
                : "Some items in your cart are limited per customer, so you'll need to sign in to buy them.",
        };
    }

    for (const line of limited) {
        const rule = rules[line.id];
        const limit = rule.limitPerCustomer;

        // The cart alone over the limit — caught here so the message is about the cart rather than about a
        // mysterious prior order.
        if (line.qty > limit) {
            return {
                ok: false,
                code: "over_limit",
                items: [line.name],
                limit,
                error: `${line.name} is limited to ${limit} per customer.`,
            };
        }

        const taken = await countClaims(line.id, rule.runStartedAt, signals);
        if (taken + line.qty > limit) {
            return {
                ok: false,
                code: "already_purchased",
                items: [line.name],
                limit,
                error: `${line.name} is limited to ${limit} per customer, and our records show you've already got one. If that's wrong, give the shop a shout and we'll sort it.`,
            };
        }
    }

    return { ok: true };
}

/** How many of this run's slots the signals in front of us have already used. */
async function countClaims(variationId, runStartedAt, signals) {
    if (!signals?.length) return 0;
    const row = await db.queryOne(
        `SELECT COALESCE(MAX(slot) + 1, 0) AS taken
           FROM shop_item_claims
          WHERE variation_id = $1 AND run_started_at = $2
            AND (signal_kind, signal_value) IN (
                SELECT * FROM UNNEST($3::text[], $4::text[])
            )`,
        [variationId, runStartedAt, signals.map((s) => s.kind), signals.map((s) => s.value)],
    ).catch(() => null);
    return Number(row?.taken) || 0;
}

// ── TAKING THE SLOT ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * Reserve this buyer's slot on every limited item in the cart, atomically.
 *
 * ⚠️ THE INSERT *IS* THE CHECK. checkCartRules above is for the message; this is the enforcement. Counting and
 * then inserting leaves a window of a few milliseconds where two orders both read "none taken" and both go
 * through, and a few milliseconds is an eternity to the thing we are defending against. ON CONFLICT DO NOTHING
 * with the primary key doing the work has no window: whoever lands second gets no row back and is refused.
 *
 * Returns { ok } or { ok: false, code, error, items }. On refusal everything already claimed in this call is
 * released, so a two-item cart cannot half-claim.
 */
export async function claimCartRules(cartItems, { orderId, customerId, signals = [] } = {}) {
    const lines = (cartItems || []).map((i) => ({
        id: String(i?.catalogObjectId || ""),
        name: i?.name || "that item",
        qty: Math.max(1, Number(i?.quantity) || 1),
    })).filter((l) => l.id);
    const rules = await getItemRules(lines.map((l) => l.id));
    const limited = lines.filter((l) => rules[l.id]?.limitPerCustomer != null);
    if (!limited.length) return { ok: true };
    if (!customerId) return { ok: false, code: "account_required", error: "Sign in to buy a limited item." };
    if (!signals.length) return { ok: false, code: "no_signals", error: "We couldn't verify your details. Try again." };

    for (const line of limited) {
        const rule = rules[line.id];
        const taken = await countClaims(line.id, rule.runStartedAt, signals);
        if (taken + line.qty > rule.limitPerCustomer) {
            await releaseClaims(orderId);
            return {
                ok: false, code: "already_purchased", items: [line.name], limit: rule.limitPerCustomer,
                error: `${line.name} is limited to ${rule.limitPerCustomer} per customer.`,
            };
        }

        for (let n = 0; n < line.qty; n += 1) {
            const slot = taken + n;
            for (const s of signals) {
                const got = await db.queryOne(
                    `INSERT INTO shop_item_claims (variation_id, run_started_at, signal_kind, signal_value, slot, order_id)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     ON CONFLICT DO NOTHING
                     RETURNING signal_kind`,
                    [line.id, rule.runStartedAt, s.kind, s.value, slot, orderId || null],
                ).catch(() => null);
                if (!got) {
                    // Somebody with this signal already holds the slot. Hand back everything this order took.
                    await releaseClaims(orderId);
                    return {
                        ok: false, code: "already_purchased", items: [line.name], limit: rule.limitPerCustomer,
                        error: `${line.name} is limited to ${rule.limitPerCustomer} per customer, and our records show you've already got one. If that's wrong, give the shop a shout and we'll sort it.`,
                    };
                }
            }
        }
    }
    return { ok: true };
}

/**
 * Give the slot back.
 *
 * ⚠️ CALLED WHEN A PAYMENT FAILS, NOT ONLY WHEN AN ORDER IS CANCELLED. A declined card that kept its claim
 * would lock a real customer out of the item they just failed to buy, with no way to tell them why — the
 * worst possible outcome for a feature whose whole purpose is getting real customers served.
 */
export async function releaseClaims(orderId) {
    if (!orderId) return;
    await db.query(`DELETE FROM shop_item_claims WHERE order_id = $1`, [orderId]).catch(() => {});
}

// ── ADMIN ────────────────────────────────────────────────────────────────────────────────────────────────────

/** Every rule that currently does something, for the app's list. */
export async function listItemRules() {
    const rows = await db.query(
        `SELECT r.variation_id, r.pickup_only, r.limit_per_customer, r.run_started_at, r.run_qty,
                COALESCE(r.item_name, f.name) AS item_name, f.quantity AS stock, r.note, r.updated_by, r.updated_at,
                (SELECT COUNT(DISTINCT slot) FROM shop_item_claims c
                  WHERE c.variation_id = r.variation_id AND c.run_started_at = r.run_started_at) AS claimed
           FROM shop_item_rules r
           LEFT JOIN inventory_feed f ON f.variation_id = r.variation_id
          WHERE r.pickup_only = TRUE OR r.limit_per_customer IS NOT NULL
          ORDER BY r.updated_at DESC`,
    ).catch(() => []);
    return (rows || []).map((r) => ({
        variationId: r.variation_id,
        itemName: r.item_name || r.variation_id,
        pickupOnly: Boolean(r.pickup_only),
        limitPerCustomer: r.limit_per_customer == null ? null : Number(r.limit_per_customer),
        runStartedAt: r.run_started_at,
        runQty: r.run_qty == null ? null : Number(r.run_qty),
        stock: r.stock == null ? null : Number(r.stock),
        // How many of this run have been taken — the number Luke will actually look at during a drop.
        claimed: Number(r.claimed) || 0,
        note: r.note || null,
        updatedBy: r.updated_by || null,
        updatedAt: r.updated_at,
    }));
}

/**
 * Set or clear a product's rules.
 *
 * ⚠️ CHANGING THE LIMIT DOES NOT START A NEW RUN. Those are separate on purpose: fixing a typo in the limit
 * mid-drop must not hand everybody who already bought one a second go. A new run is an explicit act — see
 * startNewRun, and the automatic one on restock.
 */
export async function setItemRule(variationId, { pickupOnly, limitPerCustomer, itemName, note } = {}, actor = null) {
    const id = String(variationId || "").trim();
    if (!id) return { ok: false, error: "bad_variation" };
    const limit = limitPerCustomer == null || limitPerCustomer === "" ? null : Math.max(1, Math.round(Number(limitPerCustomer) || 0));
    if (limit != null && !Number.isFinite(limit)) return { ok: false, error: "bad_limit" };

    const stock = await db.queryOne(`SELECT quantity, name FROM inventory_feed WHERE variation_id = $1`, [id]).catch(() => null);

    const row = await db.queryOne(
        `INSERT INTO shop_item_rules (variation_id, pickup_only, limit_per_customer, item_name, note, updated_by, run_qty)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (variation_id) DO UPDATE
            SET pickup_only = $2, limit_per_customer = $3,
                item_name = COALESCE($4, shop_item_rules.item_name),
                note = $5, updated_by = $6, updated_at = NOW(),
                -- The run quantity is only meaningful while a run is open; refreshed when the limit is first
                -- put on something that had none.
                run_qty = CASE WHEN shop_item_rules.limit_per_customer IS NULL AND $3 IS NOT NULL
                               THEN $7 ELSE shop_item_rules.run_qty END,
                run_started_at = CASE WHEN shop_item_rules.limit_per_customer IS NULL AND $3 IS NOT NULL
                                      THEN NOW() ELSE shop_item_rules.run_started_at END
         RETURNING variation_id, pickup_only, limit_per_customer, run_started_at`,
        [id, Boolean(pickupOnly), limit, itemName || stock?.name || null, note || null, actor || null,
            stock?.quantity == null ? null : Number(stock.quantity)],
    ).catch((e) => ({ error: e?.message }));

    if (!row || row.error) return { ok: false, error: row?.error || "write_failed" };
    return {
        ok: true,
        rule: {
            variationId: row.variation_id,
            pickupOnly: Boolean(row.pickup_only),
            limitPerCustomer: row.limit_per_customer == null ? null : Number(row.limit_per_customer),
            runStartedAt: row.run_started_at,
        },
    };
}

/**
 * Start a fresh run: everybody becomes eligible again.
 *
 * ⚠️ THE OLD CLAIMS ARE LEFT WHERE THEY ARE. Moving the timestamp forward is enough — every check is scoped to
 * run_started_at, so the previous run's rows simply stop matching. Deleting them would throw away the record
 * of who bought what during the last drop, which is exactly what you want to look at when deciding whether
 * the limit worked.
 */
export async function startNewRun(variationId, actor = null) {
    const id = String(variationId || "").trim();
    if (!id) return { ok: false, error: "bad_variation" };
    const stock = await db.queryOne(`SELECT quantity FROM inventory_feed WHERE variation_id = $1`, [id]).catch(() => null);
    const row = await db.queryOne(
        `UPDATE shop_item_rules
            SET run_started_at = NOW(), run_qty = $2, updated_by = $3, updated_at = NOW()
          WHERE variation_id = $1
          RETURNING run_started_at, run_qty`,
        [id, stock?.quantity == null ? null : Number(stock.quantity), actor || null],
    ).catch(() => null);
    if (!row) return { ok: false, error: "no_rule" };
    return { ok: true, runStartedAt: row.run_started_at, runQty: Number(row.run_qty) || null };
}

/**
 * A restock starts a new run on its own.
 *
 * Luke, on how long the limit lasts: "For the existing quantity initially stocked." So when more arrives, the
 * run is over and the next one begins — otherwise a December restock would still be refusing the customers who
 * bought in October, which is the opposite of the point.
 *
 * ⚠️ DRIVEN BY THE RESTOCK EVENT, NOT BY STOCK HITTING ZERO. Quantity dips to zero and back constantly from
 * ordinary sync timing, and resetting on that would hand out a free extra to anyone watching. The inventory
 * feed already decides what a genuine restock is (last_change_kind = 'restock'); this just listens.
 *
 * Called from the feed reconcile. Returns the ids it rolled over, for the log.
 */
export async function rollRunsOnRestock(restockedVariationIds = []) {
    const ids = [...new Set((restockedVariationIds || []).filter(Boolean).map(String))];
    if (!ids.length) return [];
    const rows = await db.query(
        `UPDATE shop_item_rules r
            SET run_started_at = NOW(),
                run_qty = f.quantity,
                updated_by = 'restock',
                updated_at = NOW()
           FROM inventory_feed f
          WHERE f.variation_id = r.variation_id
            AND r.variation_id = ANY($1)
            AND r.limit_per_customer IS NOT NULL
          RETURNING r.variation_id`,
        [ids],
    ).catch(() => []);
    return (rows || []).map((r) => r.variation_id);
}

/**
 * The card, recorded after the charge.
 *
 * ⚠️ RECORDED AND FLAGGED, NEVER AUTO-REFUNDED, and the reason is a timing one rather than a policy one.
 * Square only tells us the card's fingerprint once the payment has been created, which is after the money has
 * moved — so unlike every other signal it cannot refuse an order, because refusing would mean reversing a
 * captured payment on our own say-so. A couple sharing one card is not a bot farm, and auto-refunding them
 * would be a worse failure than letting a second box through.
 *
 * So it marks the order and the shop orders screen shows it. The call stays Luke's.
 *
 * ⚠️ AND IT IS NOT A CARD NUMBER. The fingerprint is an opaque stable hash. It cannot be reversed and it
 * cannot be charged.
 */
export async function recordCardSignal(order, payment, cartItems = []) {
    const fingerprint = payment?.card_details?.card?.fingerprint || null;
    if (!order?.id || !fingerprint) return { ok: true, flagged: false };

    await db.query(`UPDATE shop_orders SET card_fingerprint = $2 WHERE id = $1`, [order.id, fingerprint]).catch(() => {});

    const ids = (cartItems || []).map((i) => String(i?.catalogObjectId || "")).filter(Boolean);
    const rules = await getItemRules(ids);
    const limited = Object.values(rules).filter((r) => r.limitPerCustomer != null);
    if (!limited.length) return { ok: true, flagged: false };

    for (const rule of limited) {
        // The same card, on a different order, for this same product, inside this run.
        // ⚠️ status <> 'failed' so a declined attempt never counts as a purchase.
        const dupe = await db.queryOne(
            `SELECT id FROM shop_orders
              WHERE card_fingerprint = $1 AND id <> $2
                AND created_at >= $3
                AND status <> 'failed'
                AND items_json @> $4::jsonb
              LIMIT 1`,
            [fingerprint, order.id, rule.runStartedAt, JSON.stringify([{ catalogObjectId: rule.variationId }])],
        ).catch(() => null);

        if (dupe) {
            await db.query(`UPDATE shop_orders SET rule_flag = 'duplicate_card' WHERE id = $1`, [order.id]).catch(() => {});
            return { ok: true, flagged: true, matchedOrderId: dupe.id, variationId: rule.variationId };
        }
    }
    return { ok: true, flagged: false };
}

/**
 * Let one blocked person through.
 *
 * ⚠️ THIS EXISTS BECAUSE THE REFUSAL MESSAGE PROMISES IT. The customer is told "if that's wrong, give the shop
 * a shout and we'll sort it" — and a promise the shop cannot keep is worse than no promise. Every signal here
 * has a real false positive behind it: a household on one WiFi, two people at one address, a couple sharing a
 * card. The limit is deliberately strict (Luke: "whenever we detect we say that its limited 1"), and strict is
 * only reasonable when somebody can say "no, they're fine."
 *
 * Takes an email because that is what a customer will give over the phone. Clears every signal recorded
 * against them for that product's current run, so they can simply order again.
 */
export async function releaseByEmail(variationId, email) {
    const id = String(variationId || "").trim();
    const norm = normalizeEmail(email);
    if (!id || !norm) return { ok: false, error: "bad_input" };

    const rule = await getItemRule(id);
    if (!rule) return { ok: false, error: "no_rule" };

    // Find the orders that email claimed with, then drop every signal those orders registered — releasing
    // only the email row would leave their IP and address still holding the slot.
    const orders = await db.query(
        `SELECT DISTINCT order_id FROM shop_item_claims
          WHERE variation_id = $1 AND run_started_at = $2 AND signal_kind = 'email' AND signal_value = $3
            AND order_id IS NOT NULL`,
        [id, rule.runStartedAt, norm],
    ).catch(() => []);

    let freed = 0;
    for (const o of orders || []) {
        const gone = await db.query(
            `DELETE FROM shop_item_claims WHERE order_id = $1 AND variation_id = $2 RETURNING signal_kind`,
            [o.order_id, id],
        ).catch(() => []);
        freed += (gone || []).length;
    }

    // A claim with no order id cannot happen through checkout, but clear the bare email row too so a
    // hand-made row can never strand somebody.
    const extra = await db.query(
        `DELETE FROM shop_item_claims
          WHERE variation_id = $1 AND run_started_at = $2 AND signal_kind = 'email' AND signal_value = $3
          RETURNING signal_kind`,
        [id, rule.runStartedAt, norm],
    ).catch(() => []);
    freed += (extra || []).length;

    return { ok: true, freed, orders: (orders || []).length };
}

/**
 * Who has taken this run's slots, for the admin screen.
 *
 * Grouped by order so it reads as a list of purchases rather than a list of signals, and showing the email
 * because that is the one a human recognises.
 */
export async function listRunClaims(variationId, { limit = 100 } = {}) {
    const id = String(variationId || "").trim();
    if (!id) return [];
    const rule = await getItemRule(id);
    if (!rule) return [];
    const rows = await db.query(
        `SELECT c.order_id,
                MAX(CASE WHEN c.signal_kind = 'email' THEN c.signal_value END) AS email,
                MAX(CASE WHEN c.signal_kind = 'ip' THEN c.signal_value END) AS ip,
                MIN(c.created_at) AS at,
                MAX(o.customer_name) AS name,
                MAX(o.status) AS status,
                MAX(o.rule_flag) AS flag
           FROM shop_item_claims c
           LEFT JOIN shop_orders o ON o.id = c.order_id
          WHERE c.variation_id = $1 AND c.run_started_at = $2
          GROUP BY c.order_id
          ORDER BY MIN(c.created_at) DESC
          LIMIT $3`,
        [id, rule.runStartedAt, limit],
    ).catch(() => []);
    return (rows || []).map((r) => ({
        orderId: r.order_id, email: r.email || null, ip: r.ip || null,
        name: r.name || null, status: r.status || null, flag: r.flag || null, at: r.at,
    }));
}
