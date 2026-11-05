import "server-only";

import { db } from "@/lib/db";
import { listPreorders, markPreorderArrived } from "@/lib/shop-item-rules.js";
import { sendPreorderArrivedEmail } from "@/lib/shop-order-email.js";

// ── MARKING A PRE-ORDER ARRIVED ──────────────────────────────────────────────────────────────────────────
// Luke: "we need to make another screen in the admin and employee app that's pre-sale items, where either me
// or Eric can go in there and when the items arrive, mark them as arrived. And my expectation is when we mark
// them as arrived, anybody who's ordered them will get an email."
//
// ⚠️ THE SERVER DOES ALL THREE PARTS, NOT THE PHONE. The app already talks to Square directly for restock,
// so renaming the item there was the obvious shape and it is the wrong one: three steps that must all happen
// (rename, clear the flag, email everybody) would then be three round trips from a handset in a shop with
// patchy signal, any of which can be the one that drops. One call, one place, and a half-finished arrival is
// a thing the next tap can finish rather than a mess two systems disagree about.
//
// The ORDER of the three matters and is deliberate:
//   1. claim the holders   -- the only irreversible step, and it is the one that must not happen twice
//   2. rename in Square    -- cosmetic; if it fails the item is merely still called Pre-Order
//   3. send the emails     -- after the flag is down, so a retry cannot re-send
// See markPreorderArrived, which owns 1 and the flag.

const SQUARE_VERSION = "2025-01-23";
const squareBase = () =>
    (process.env.SQUARE_ENVIRONMENT || "production") === "sandbox"
        ? "https://connect.squareupsandbox.com"
        : "https://connect.squareup.com";

/** The prefix, in one place, because it is written at restock and removed here. */
export const PREORDER_PREFIX = "[Pre-Order] ";

export const preorderName = (name) =>
    String(name || "").startsWith(PREORDER_PREFIX) ? String(name) : `${PREORDER_PREFIX}${String(name || "").trim()}`;

export const plainName = (name) => String(name || "").replace(PREORDER_PREFIX, "").trim();

/**
 * Take "[Pre-Order] " off the Square ITEM that owns this variation.
 *
 * ⚠️ THE NAME IS ON THE ITEM, NOT THE VARIATION. A variation is "Regular" / "Booster Box"; the thing a
 * customer reads on the storefront and a cashier reads on the POS is the parent item's name. Renaming the
 * variation would leave the prefix exactly where everybody looks.
 *
 * ⚠️ AND SQUARE UPSERTS WITH A VERSION. Sending the object back without the version it was read at is how
 * you get a 409 under any concurrent edit; sending a stale one is how you silently clobber somebody's price
 * change. Read, edit the one field, write it straight back.
 */
async function renameSquareItem(variationId, nextNameFor) {
    const token = process.env.SQUARE_ACCESS_TOKEN;
    if (!token) return { ok: false, error: "no_square_token" };
    const headers = {
        "Square-Version": SQUARE_VERSION,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
    };

    const varRes = await fetch(`${squareBase()}/v2/catalog/object/${encodeURIComponent(variationId)}`, { headers });
    if (!varRes.ok) return { ok: false, error: `square_read_${varRes.status}` };
    const varJson = await varRes.json();
    const itemId = varJson?.object?.item_variation_data?.item_id;
    if (!itemId) return { ok: false, error: "no_parent_item" };

    const itemRes = await fetch(`${squareBase()}/v2/catalog/object/${encodeURIComponent(itemId)}`, { headers });
    if (!itemRes.ok) return { ok: false, error: `square_read_item_${itemRes.status}` };
    const itemJson = await itemRes.json();
    const object = itemJson?.object;
    if (!object?.item_data) return { ok: false, error: "no_item_data" };

    const current = object.item_data.name || "";
    const next = nextNameFor(current);
    // ⚠️ NO WRITE WHEN THERE IS NOTHING TO CHANGE, which is what makes both callers idempotent. Setting a
    // pre-order twice must not bake the prefix in twice, and arriving twice must not rewrite a name
    // somebody has since edited by hand in Square.
    if (!next || next === current) return { ok: true, renamed: false, name: current };

    const put = await fetch(`${squareBase()}/v2/catalog/object`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            idempotency_key: `preorder-name-${variationId}-${object.version}`,
            object: { ...object, item_data: { ...object.item_data, name: next } },
        }),
    });
    if (!put.ok) return { ok: false, error: `square_write_${put.status}`, detail: (await put.text()).slice(0, 200) };
    return { ok: true, renamed: true, name: next };
}

/** Everything still waiting, for the app screen. */
export async function preorderBoard() {
    return { items: await listPreorders() };
}

/**
 * The whole arrival, in one call.
 *
 * Returns what happened to each part rather than a bare ok, because the three can genuinely disagree —
 * Square can be down while the emails go out perfectly — and the screen should be able to say which.
 */
export async function arrivePreorder(variationId, { by } = {}) {
    const claimed = await markPreorderArrived(variationId);
    if (!claimed.ok) return claimed;

    const square = await renameSquareItem(variationId, (current) => claimed.baseName || plainName(current))
        .catch((e) => ({ ok: false, error: e?.message || "square_failed" }));

    // ⚠️ ONE READ FOR ALL THE ORDERS, NOT ONE PER HOLDER. A pre-order with forty buyers would otherwise be
    // forty round trips on the neon() HTTP driver before a single email is sent — the exact family-A waste
    // CLAUDE.md opens with, on a path a human is standing there waiting for.
    const ids = claimed.holders.map((h) => h.orderId);
    const orders = ids.length
        ? await db.query(`SELECT * FROM shop_orders WHERE id = ANY($1)`, [ids]).catch(() => [])
        : [];
    const byId = new Map((orders || []).map((o) => [String(o.id), o]));

    let emailed = 0;
    const failures = [];
    for (const hold of claimed.holders) {
        const order = byId.get(String(hold.orderId));
        if (!order) { failures.push(hold.orderId); continue; }
        // ⚠️ allSettled-STYLE PER ORDER. One bad address must not stop the other thirty-nine people being
        // told, and the holds are already marked notified — a throw here would lose the rest silently.
        const sent = await sendPreorderArrivedEmail(order, hold.itemName || claimed.itemName).catch(() => false);
        if (sent) emailed += 1; else failures.push(hold.orderId);
    }

    await db.query(
        `UPDATE shop_item_rules SET updated_by = COALESCE($2, updated_by), updated_at = NOW()
          WHERE variation_id = $1`,
        [String(variationId), by || null],
    ).catch(() => {});

    return {
        ok: true,
        itemName: claimed.itemName,
        holders: claimed.holders.length,
        emailed,
        failed: failures,
        square,
    };
}

/**
 * Put "[Pre-Order] " ON the Square item, for a variation that already existed.
 *
 * ⚠️ THE APP ONLY PREFIXES ITEMS IT CREATES, AND THAT IS HALF THE CASES. pushRestockItemsToSquare has two
 * branches: a brand-new item gets its name built with the prefix, and an item already in the catalogue --
 * matched by SKU, or adopted by name -- takes the existing-variation branch, has its stock and price
 * updated, and is never renamed at all. So pre-ordering something the shop has carried before, or topping
 * up a pre-order with a second restock, produced the flag and the date correctly and left the one guard
 * Luke actually asked for off the item: "it would add pre-order to the item name in Square. So it's baked
 * into the unit, so it's very, very clear."
 *
 * Doing it here rather than in Kotlin means ONE implementation of the prefix for both branches and for
 * arrival, so the string that gets added can never disagree with the string that gets removed.
 */
export async function applySquarePrefix(variationId) {
    return renameSquareItem(variationId, (current) => preorderName(current)).catch((e) => ({
        ok: false, error: e?.message || "square_failed",
    }));
}

/**
 * Take "[Pre-Order] " back OFF without marking anything arrived — for a drop that got CANCELLED.
 *
 * ⚠️ CANCELLING IS NOT ARRIVING, AND IT MUST NOT BORROW arrivePreorder TO DO THE RENAME. Arriving claims
 * the holders and emails every one of them "your pre-order is in the shop". A cancelled allocation is the
 * opposite news, and sending that email would be worse than leaving the name wrong.
 *
 * ⚠️ AND WITHOUT THIS, CLEARING A DATE LEFT THE PREFIX ON. The route only renamed when a date was being
 * SET, so an ended pre-order kept "[Pre-Order]" in the name on the storefront and the POS with nothing
 * anywhere saying it was still coming — the item reads as a pre-order and behaves as ordinary stock.
 */
export async function clearSquarePrefix(variationId, baseName) {
    // Prefer the name we recorded when the pre-order was set, exactly as arrival does — string surgery on
    // whatever the item is called by now is the fallback, not the plan. The caller is a phone that has no
    // reason to know the base name, so it is read here rather than trusted from the request.
    const stored = baseName || (await db
        .queryOne(`SELECT preorder_base_name FROM shop_item_rules WHERE variation_id = $1`, [String(variationId)])
        .then((r) => r?.preorder_base_name || null)
        .catch(() => null));
    return renameSquareItem(variationId, (current) => stored || plainName(current)).catch((e) => ({
        ok: false, error: e?.message || "square_failed",
    }));
}
