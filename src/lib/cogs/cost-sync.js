import "server-only";

import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { squareFetch, resolveVariationCategories } from "@/lib/consignment/square";
import { loadActiveConsignorsByCategory } from "@/lib/consignment/trade-sales";
import { createServerLogger } from "@/lib/server-logger";

// ── THE COST WE PAID, RECONCILED INTO SQUARE ────────────────────────────────────────────────────────────────
//
// The restock writes the cost to Square best-effort and forgets it. When that write fails — a stale custom
// attribute key, a version conflict, a 429 — nothing records the failure, so reporting quietly falls back to
// whatever stale number Square already held. That is how 78 SKUs stayed costed at a price we last paid in
// July and 199 more carried no cost at all.
//
// This module turns that write into RECONCILED state: every variation we know a cost for gets a cost_sync row
// saying what it SHOULD carry, whether Square confirms it, and what went wrong if not. A failure becomes a
// visible, retryable row instead of a silence.
//
// The one rule that makes it trustworthy: a write is never believed. Square accepts unknown keys inside
// item_variation_data and returns 200 — which is precisely how "Square unit cost isn't API-writable" became
// received wisdom for weeks while we wrote to three fields that do not exist. Nothing here is marked `ok`
// until a SEPARATE read shows the value actually stored.

const costSyncLogger = createServerLogger({ source: "api", subsystem: "cost-sync" });

// Both halves matter and they are read by different things: the custom attribute is what OUR reports and the
// restock's cost-recovery read; the vendor price_money is Square's own unit cost, the only one Square's
// built-in COGS reporting can see. A row is only `ok` when both hold the number.
const UNIT_COST_ATTRIBUTE_KEY = "wolfden_unit_cost";
// Stop grinding on a row that has refused a dozen times — it needs a person, not another attempt. It stays
// `failed` and visible, and "Retry failed" puts it back in the queue.
const MAX_ATTEMPTS = 12;
const DEFAULT_SWEEP_LIMIT = 40;

const toDollars = (cents) => Math.round(Number(cents) || 0) / 100;
const toCents = (dollars) => Math.round(Number(dollars || 0) * 100);
const errorText = (error) => String(error?.message || error || "unknown error").slice(0, 500);

// Square namespaces a custom attribute key as `{application_id}:{key}` for anyone but its owner, so the
// definition has to be looked up rather than assumed. Cached per process: it changes approximately never, and
// the restock's version of this lookup nulling out for a whole batch is one of the failures we are fixing.
let cachedAttributeKey;

export async function resolveUnitCostAttributeKey() {
    if (cachedAttributeKey !== undefined) {
        return cachedAttributeKey;
    }

    const payload = await squareFetch("/v2/catalog/list?types=CUSTOM_ATTRIBUTE_DEFINITION");
    for (const object of payload?.objects || []) {
        const key = String(object?.custom_attribute_definition_data?.key || "").trim();
        if (key === UNIT_COST_ATTRIBUTE_KEY || key.endsWith(`:${UNIT_COST_ATTRIBUTE_KEY}`)) {
            cachedAttributeKey = key;
            return cachedAttributeKey;
        }
    }

    cachedAttributeKey = null;
    return cachedAttributeKey;
}

function readVendorCostCents(variationData) {
    const amount = variationData?.item_variation_vendor_infos?.[0]?.item_variation_vendor_info_data?.price_money?.amount;
    return amount == null ? null : Math.round(Number(amount));
}

function readAttributeCostCents(object) {
    for (const value of Object.values(object?.custom_attribute_values || {})) {
        const key = String(value?.key || "").trim();
        if (key !== UNIT_COST_ATTRIBUTE_KEY && !key.endsWith(`:${UNIT_COST_ATTRIBUTE_KEY}`)) {
            continue;
        }
        const raw = value?.number_value;
        if (raw == null || raw === "") {
            continue;
        }
        return toCents(Number(raw));
    }
    return null;
}

// Update the vendor info IN PLACE when one exists. Writing a fresh `#temp` id every time — which the restock
// does — appends another vendor info rather than editing the one Square reads, so the cost appears to change
// and then reverts to the first entry's number.
function vendorCostInfos(existing, cents) {
    const current = existing?.[0];
    const data = {
        ...(current?.item_variation_vendor_info_data || {}),
        ordinal: current?.item_variation_vendor_info_data?.ordinal ?? 0,
        price_money: { amount: cents, currency: "USD" },
    };

    const info = {
        type: "ITEM_VARIATION_VENDOR_INFO",
        present_at_all_locations: current?.present_at_all_locations ?? true,
        item_variation_vendor_info_data: data,
    };

    if (current?.id && !String(current.id).startsWith("#")) {
        info.id = current.id;
        if (current.version != null) {
            info.version = current.version;
        }
    } else {
        info.id = `#COST_SYNC_VINFO_${randomUUID().slice(0, 8)}`;
    }

    return [info];
}

async function fetchVariation(variationId) {
    const payload = await squareFetch(`/v2/catalog/object/${encodeURIComponent(variationId)}?include_related_objects=false`);
    return payload?.object || null;
}

// Write both halves, then READ BACK. Returns { ok, syncedCents, error } — never throws for a Square refusal,
// because a refusal is the row's state, not an exception the caller has to remember to catch.
export async function writeCostToSquare(variationId, desiredCents) {
    const attributeKey = await resolveUnitCostAttributeKey();
    const object = await fetchVariation(variationId);

    if (!object || object.type !== "ITEM_VARIATION") {
        const error = new Error("Variation is not in the Square catalog (deleted?).");
        error.gone = true;
        throw error;
    }

    const variationData = { ...(object.item_variation_data || {}) };
    variationData.item_variation_vendor_infos = vendorCostInfos(variationData.item_variation_vendor_infos, desiredCents);

    const nextObject = {
        type: "ITEM_VARIATION",
        id: variationId,
        version: object.version,
        item_variation_data: variationData,
    };

    if (attributeKey) {
        nextObject.custom_attribute_values = {
            [attributeKey]: { key: attributeKey, number_value: toDollars(desiredCents).toFixed(2) },
        };
    }

    await squareFetch("/v2/catalog/object", {
        method: "POST",
        body: JSON.stringify({ idempotency_key: randomUUID(), object: nextObject }),
    });

    // The separate read. A 200 above proves Square parsed the request, nothing more.
    const stored = await fetchVariation(variationId);
    const vendorCents = readVendorCostCents(stored?.item_variation_data);
    const attributeCents = readAttributeCostCents(stored);

    const problems = [];
    if (vendorCents !== desiredCents) {
        problems.push(`Square's own unit cost reads ${vendorCents == null ? "empty" : `$${toDollars(vendorCents).toFixed(2)}`}`);
    }
    if (!attributeKey) {
        problems.push("no wolfden_unit_cost attribute definition in this Square account");
    } else if (attributeCents !== desiredCents) {
        problems.push(`${UNIT_COST_ATTRIBUTE_KEY} reads ${attributeCents == null ? "empty" : `$${toDollars(attributeCents).toFixed(2)}`}`);
    }

    if (problems.length) {
        return { ok: false, error: `Wrote $${toDollars(desiredCents).toFixed(2)} but ${problems.join("; ")}.` };
    }

    return { ok: true, syncedCents: desiredCents };
}

// ── The queue ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Record what a variation's cost SHOULD be. Called wherever we learn a real purchase cost — today that is
 * /api/admin/item-costs, the same call the restock already makes.
 *
 * A moved cost re-opens a settled row (a second restock at a new price must reach Square); an unchanged cost
 * leaves an `ok` row alone so a re-post does not re-write the whole catalog. `skipped` is never re-opened —
 * it was set deliberately.
 */
export async function enqueueCostSync(entries) {
    const list = (Array.isArray(entries) ? entries : [])
        .map((entry) => ({
            variationId: String(entry?.variationId || "").trim(),
            cents: Math.round(Number(entry?.unitCostCents) || 0),
            itemName: entry?.itemName ? String(entry.itemName).slice(0, 200) : null,
        }))
        .filter((entry) => entry.variationId && entry.cents > 0);

    let queued = 0;
    for (const entry of list) {
        const rows = await db.query(
            `INSERT INTO cost_sync (variation_id, item_name, desired_cost, state)
             VALUES ($1, $2, $3, 'pending')
             ON CONFLICT (variation_id) DO UPDATE
                SET item_name    = COALESCE(EXCLUDED.item_name, cost_sync.item_name),
                    desired_cost = EXCLUDED.desired_cost,
                    state        = CASE
                                       WHEN cost_sync.state = 'skipped' THEN 'skipped'
                                       WHEN cost_sync.state = 'ok'
                                            AND cost_sync.synced_cost IS NOT DISTINCT FROM EXCLUDED.desired_cost THEN 'ok'
                                       ELSE 'pending'
                                   END,
                    -- a genuinely new number starts its retry budget over; nothing else touches attempts
                    attempts     = CASE
                                       WHEN cost_sync.desired_cost IS DISTINCT FROM EXCLUDED.desired_cost THEN 0
                                       ELSE cost_sync.attempts
                                   END,
                    last_error   = CASE
                                       WHEN cost_sync.desired_cost IS DISTINCT FROM EXCLUDED.desired_cost THEN NULL
                                       ELSE cost_sync.last_error
                                   END,
                    updated_at   = NOW()
             RETURNING state`,
            [entry.variationId, entry.itemName, toDollars(entry.cents)],
        );
        if (rows[0]?.state === "pending") {
            queued += 1;
        }
    }

    costSyncLogger.info("cost_sync.enqueued", { received: list.length, queued });
    return { received: list.length, queued };
}

// The costs that are OURS — a price we actually paid, recorded at intake. `square_attr` and `square_vendor`
// are the other direction: numbers we READ OUT of the catalog. Pushing those back would reconcile Square
// against itself and dress a stale catalog reading up as a confirmed cost.
const OWN_COST_SOURCES = ["restock", "trade_intake", "trade_ledger", "cogs_export", "manual", "app"];

/**
 * Seed the queue from every cost we already hold. This is the one-off that closes today's gap: 419 variations
 * carry a cost we paid, and the catalog is only carrying some of them.
 */
export async function seedCostSyncFromItemCosts() {
    const rows = await db.query(
        `INSERT INTO cost_sync (variation_id, item_name, desired_cost, state)
         SELECT variation_id, item_name, ROUND(unit_cost_cents::numeric / 100, 2), 'pending'
           FROM wolfden_item_cost
          WHERE unit_cost_cents > 0
            AND source = ANY($1)
         ON CONFLICT (variation_id) DO NOTHING
         RETURNING variation_id`,
        [OWN_COST_SOURCES],
    );
    costSyncLogger.info("cost_sync.seeded", { inserted: rows.length });
    return { seeded: rows.length };
}

// Consigned stock is deliberately never synced: a consignor's item was never purchased, so a "unit cost" on it
// describes a payment that did not happen — and the report already costs it off the payout rate instead.
async function markConsignedAsSkipped(variationIds) {
    if (!variationIds.length) {
        return new Set();
    }

    const consignorsByCategory = await loadActiveConsignorsByCategory();
    if (!consignorsByCategory.size) {
        return new Set();
    }

    const categories = await resolveVariationCategories(variationIds);
    const consigned = variationIds.filter((id) => (categories.get(id) || []).some((category) => consignorsByCategory.has(category)));

    if (consigned.length) {
        await db.query(
            `UPDATE cost_sync
                SET state = 'skipped', last_error = 'Consigned stock — cost is the consignor payout, not a purchase.',
                    updated_at = NOW()
              WHERE variation_id = ANY($1)`,
            [consigned],
        );
        costSyncLogger.info("cost_sync.skipped_consigned", { count: consigned.length });
    }

    return new Set(consigned);
}

/**
 * Push everything that still owes Square a cost, oldest first, with an exponential back-off so a variation
 * that keeps refusing does not eat the whole sweep. Returns a per-row account of what happened.
 */
export async function sweepCostSync({ limit = DEFAULT_SWEEP_LIMIT } = {}) {
    const size = Math.max(1, Math.min(Number(limit) || DEFAULT_SWEEP_LIMIT, 200));

    const work = await db.query(
        `SELECT variation_id, item_name, desired_cost, attempts
           FROM cost_sync
          WHERE state IN ('pending', 'failed')
            AND attempts < $1
            AND (last_attempt_at IS NULL
                 OR last_attempt_at < NOW() - (INTERVAL '5 minutes' * POWER(2, LEAST(attempts, 6))))
          ORDER BY attempts ASC, updated_at ASC
          LIMIT $2`,
        [MAX_ATTEMPTS, size],
    );

    if (!work.length) {
        return { attempted: 0, synced: 0, failed: 0, skipped: 0, rows: [] };
    }

    const skipped = await markConsignedAsSkipped(work.map((row) => row.variation_id));

    const results = [];
    let synced = 0;
    let failed = 0;

    for (const row of work) {
        if (skipped.has(row.variation_id)) {
            results.push({ variationId: row.variation_id, itemName: row.item_name, state: "skipped" });
            continue;
        }

        const desiredCents = toCents(row.desired_cost);

        // Count the attempt BEFORE trying. A crash, a timeout or a killed function must not leave a row
        // looking untouched — that is how a poison row gets retried forever at full speed.
        await db.query(
            `UPDATE cost_sync SET attempts = attempts + 1, last_attempt_at = NOW(), updated_at = NOW()
              WHERE variation_id = $1`,
            [row.variation_id],
        );

        try {
            const outcome = await writeCostToSquare(row.variation_id, desiredCents);

            if (outcome.ok) {
                await db.query(
                    `UPDATE cost_sync
                        SET state = 'ok', synced_cost = $2, synced_at = NOW(), last_error = NULL, updated_at = NOW()
                      WHERE variation_id = $1`,
                    [row.variation_id, toDollars(outcome.syncedCents)],
                );
                synced += 1;
                results.push({ variationId: row.variation_id, itemName: row.item_name, state: "ok" });
            } else {
                await db.query(
                    `UPDATE cost_sync SET state = 'failed', last_error = $2, updated_at = NOW() WHERE variation_id = $1`,
                    [row.variation_id, outcome.error.slice(0, 500)],
                );
                failed += 1;
                results.push({ variationId: row.variation_id, itemName: row.item_name, state: "failed", error: outcome.error });
            }
        } catch (error) {
            // A variation Square no longer has cannot ever be written. That is a settled answer, not a
            // failure to retry — wolfden_item_cost still holds the cost, which is what reports read.
            const gone = error?.gone === true || error?.squareStatus === 404;
            await db.query(
                `UPDATE cost_sync SET state = $2, last_error = $3, updated_at = NOW() WHERE variation_id = $1`,
                [row.variation_id, gone ? "skipped" : "failed", errorText(error)],
            );
            failed += gone ? 0 : 1;
            results.push({
                variationId: row.variation_id,
                itemName: row.item_name,
                state: gone ? "skipped" : "failed",
                error: errorText(error),
            });
        }
    }

    costSyncLogger.info("cost_sync.sweep.finished", { attempted: work.length, synced, failed, skipped: skipped.size });
    return { attempted: work.length, synced, failed, skipped: skipped.size, rows: results };
}

// Put failed rows back in the queue — for after the cause is fixed (a permission, a definition, a rename).
export async function requeueFailedCostSync() {
    const rows = await db.query(
        `UPDATE cost_sync SET state = 'pending', attempts = 0, last_attempt_at = NULL, updated_at = NOW()
          WHERE state = 'failed' RETURNING variation_id`,
    );
    return { requeued: rows.length };
}

export async function costSyncSummary({ state = null, limit = 50 } = {}) {
    const counts = await db.query(`SELECT state, COUNT(*)::int AS n FROM cost_sync GROUP BY state`);
    const byState = { pending: 0, ok: 0, failed: 0, skipped: 0 };
    for (const row of counts) {
        byState[row.state] = row.n;
    }

    const size = Math.max(1, Math.min(Number(limit) || 50, 500));
    const rows = state
        ? await db.query(
            `SELECT variation_id, item_name, desired_cost, synced_cost, state, attempts, last_error, last_attempt_at, synced_at
               FROM cost_sync WHERE state = $1 ORDER BY updated_at DESC LIMIT $2`,
            [String(state), size],
        )
        : await db.query(
            `SELECT variation_id, item_name, desired_cost, synced_cost, state, attempts, last_error, last_attempt_at, synced_at
               FROM cost_sync WHERE state IN ('pending', 'failed') ORDER BY state DESC, updated_at DESC LIMIT $1`,
            [size],
        );

    return {
        counts: byState,
        // "Unreconciled" is the number that matters: costs we hold that Square is not carrying.
        unreconciled: byState.pending + byState.failed,
        rows: rows.map((row) => ({
            variationId: row.variation_id,
            itemName: row.item_name,
            desiredCost: Number(row.desired_cost),
            syncedCost: row.synced_cost == null ? null : Number(row.synced_cost),
            state: row.state,
            attempts: row.attempts,
            lastError: row.last_error,
            lastAttemptAt: row.last_attempt_at,
            syncedAt: row.synced_at,
        })),
    };
}
