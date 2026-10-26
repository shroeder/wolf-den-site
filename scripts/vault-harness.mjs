#!/usr/bin/env node
/**
 * ── TESTING A PACK OPEN WITHOUT SPENDING THE SHOP'S STOCK ───────────────────────────────────────────────────
 *
 * Luke: "Store credit is a balance you have full control over as it's just a virtual ledger. And bags are also
 * effectively just virtual cards delineated by their presence in Square, and source cost linkage. All of which
 * you should be able to revert back to its not-destroyed state after testing."
 *
 * He is right, and this is the proof. A virtual pack open is irreversible-looking but not actually
 * irreversible: it moves a credit balance, flips a database row, and deletes a Square catalog object. Two of
 * those three are trivially undoable. The third is the interesting one.
 *
 * ── WHAT SQUARE WILL AND WILL NOT GIVE BACK (probed against the live catalog, 2026-10-26) ────────────────────
 *
 *   DELETE /v2/catalog/object/{id}          works, returns deleted_object_ids
 *   batch-retrieve include_deleted_objects  STILL RETURNS THE WHOLE OBJECT, sku and all
 *   upsert that same id with is_deleted:false   ❌ 400 "Received request to update nonexistent object"
 *   create a NEW variation with the SAME SKU    ✅ 200, new id
 *
 * So a deleted id is gone for good and **restore means re-creating the variation under its original SKU**.
 * That is a true restore of everything that matters, because THE SKU IS WHAT IS PRINTED ON THE BAG. Staff find
 * bag MP-0391 because it says MP-0391 on it; the catalog id is invisible to the physical world. The pool row
 * is then re-pointed at the new id, and `card_id`/`variation_sku` never change because they ARE the SKU.
 *
 * ⚠️ THE HARNESS RUNS THE REAL PATH. It does not mock the delete, stub the credit spend, or branch the code
 * under test on a flag. A harness that avoids the dangerous step tests everything except the dangerous step —
 * and the Square delete is precisely the step that takes a bag off the register (§1.1), so it is the one most
 * worth exercising. We break it for real and put it back for real.
 *
 * ⚠️ RESTORE ONLY EVER TOUCHES WHAT THE SNAPSHOT NAMED. It never "cleans up anything that looks like a test".
 * Every row it deletes is one whose id it wrote down beforehand. An undo that guesses its own scope is how a
 * test harness eats production data.
 *
 *   node scripts/vault-harness.mjs snapshot --bags 2     capture bags + the test buyer's balance
 *   node scripts/vault-harness.mjs status                what is currently snapshotted, and its live state
 *   node scripts/vault-harness.mjs selftest              break it and put it back, end to end
 *   node scripts/vault-harness.mjs restore               undo everything the snapshot named
 *
 * State lives in scratch/ (gitignored) so a snapshot survives between invocations.
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { neon } from "@neondatabase/serverless";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const STATE_DIR = path.join(ROOT, "scratch");
const STATE_FILE = path.join(STATE_DIR, "vault-harness-state.json");

// ── CREDENTIALS ─────────────────────────────────────────────────────────────────────────────────────────────
// The database url and the Square token live in two different places on this machine and neither is in this
// repo — see the note in the project memory. Read both rather than making the caller export them.
function readKey(file, key) {
    if (!existsSync(file)) return null;
    const line = readFileSync(file, "utf8")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l.startsWith(`${key}=`));
    return line ? line.slice(line.indexOf("=") + 1).replace(/^["']|["']$/g, "").trim() : null;
}

const DB_URL =
    process.env.DATABASE_URL ||
    readKey(path.join(ROOT, ".env.local"), "DATABASE_URL") ||
    readKey("C:/Users/Luke/Projects/accounting_app/.env", "DATABASE_URL");

const SQUARE_TOKEN =
    process.env.SQUARE_ACCESS_TOKEN ||
    readKey("C:/Users/Luke/Projects/accounting_app/local.properties", "SQUARE_ACCESS_TOKEN");

if (!DB_URL) throw new Error("No DATABASE_URL (checked env, .env.local, accounting_app/.env).");
if (!SQUARE_TOKEN) throw new Error("No SQUARE_ACCESS_TOKEN (checked env, accounting_app/local.properties).");

// ⚠️ EXPORT THEM, because `cycle` imports the APP'S OWN code and db.js / consignment/square.js read
// process.env directly — as they should. Reading the files into local constants is enough for the harness's
// own queries and silently useless for the thing it is actually testing: the first cycle run refused with
// "insufficient_credit" because openPack() could not reach the database to see the balance we had just
// granted. The harness must set up the same environment the server has, not a private one.
process.env.DATABASE_URL = DB_URL;
process.env.SQUARE_ACCESS_TOKEN = SQUARE_TOKEN;

// The app logs a JSON line per query and per Square call, which buries the assertions this script exists to
// show. `--verbose` puts them back.
if (!process.argv.includes("--verbose")) {
    const quiet = () => {};
    console.info = quiet;
    console.debug = quiet;
    const realLog = console.log;
    console.log = (...a) => {
        if (typeof a[0] === "string" && a[0].startsWith("{\"timestamp\"")) return;
        realLog(...a);
    };
}

const sql = neon(DB_URL);
const SQUARE_API = "https://connect.squareup.com";

async function square(pathname, init = {}) {
    const res = await fetch(SQUARE_API + pathname, {
        ...init,
        headers: {
            Authorization: `Bearer ${SQUARE_TOKEN}`,
            "Content-Type": "application/json",
            "Square-Version": process.env.SQUARE_API_VERSION || "2025-01-23",
        },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
        const detail = JSON.stringify(body?.errors || body || {}).slice(0, 300);
        throw new Error(`Square ${pathname} ${res.status}: ${detail}`);
    }
    return body;
}

const usd = (cents) => `$${((Number(cents) || 0) / 100).toFixed(2)}`;
const log = (...a) => console.log(...a);
const ok = (m) => log(`   \u2713 ${m}`);
const bad = (m) => log(`   \u2717 ${m}`);

function loadState() {
    if (!existsSync(STATE_FILE)) return null;
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
}

function saveState(state) {
    if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/** The whole catalog object, deleted or not — this is what restore rebuilds from. */
async function fetchVariation(variationId) {
    const payload = await square("/v2/catalog/batch-retrieve", {
        method: "POST",
        body: JSON.stringify({ object_ids: [variationId], include_deleted_objects: true }),
    });
    return payload?.objects?.[0] || null;
}

let cachedCostKey;
/** Square namespaces a custom attribute key per application, so it must be looked up, never assumed. */
async function unitCostAttributeKey() {
    if (cachedCostKey !== undefined) return cachedCostKey;
    const payload = await square("/v2/catalog/list?types=CUSTOM_ATTRIBUTE_DEFINITION").catch(() => null);
    cachedCostKey = null;
    for (const object of payload?.objects || []) {
        const key = String(object?.custom_attribute_definition_data?.key || "").trim();
        if (key === "wolfden_unit_cost" || key.endsWith(":wolfden_unit_cost")) cachedCostKey = key;
    }
    return cachedCostKey;
}

async function firstLocationId() {
    const payload = await square("/v2/locations");
    return payload?.locations?.find((l) => l.status === "ACTIVE")?.id || payload?.locations?.[0]?.id || null;
}

/** On-hand count for a variation, so restore can put the unit back rather than leaving a phantom bag. */
async function inventoryCount(variationId) {
    const payload = await square("/v2/inventory/counts/batch-retrieve", {
        method: "POST",
        body: JSON.stringify({ catalog_object_ids: [variationId], states: ["IN_STOCK"] }),
    }).catch(() => null);
    const row = (payload?.counts || []).find((c) => c.state === "IN_STOCK");
    return Math.round(Number(row?.quantity || 0));
}

async function setInventory(variationId, quantity, locationId) {
    if (!locationId) return false;
    await square("/v2/inventory/changes/batch-create", {
        method: "POST",
        body: JSON.stringify({
            idempotency_key: randomUUID(),
            changes: [{
                type: "PHYSICAL_COUNT",
                physical_count: {
                    catalog_object_id: variationId,
                    location_id: locationId,
                    state: "IN_STOCK",
                    quantity: String(quantity),
                    occurred_at: new Date().toISOString(),
                },
            }],
        }),
    });
    return true;
}

// ── SNAPSHOT ────────────────────────────────────────────────────────────────────────────────────────────────

async function cmdSnapshot(args) {
    const count = Number(args.bags || 1);
    const buyerId = args.buyer || (await sql`SELECT id FROM mkt_buyer ORDER BY created_at LIMIT 1`)[0]?.id;

    const owner = await sql`
        SELECT id, display_name, store_credit_cents FROM mkt_buyer WHERE id = ${buyerId}`;
    if (!owner.length) throw new Error(`No such buyer: ${buyerId}`);

    // Cheapest active bags first: a test that goes wrong should cost the least it possibly can.
    const bags = await sql`
        SELECT id, card_id, card_name, market_value, status, square_variation_id, packed_variation_id,
               variation_sku, channel, cost_cents, cost_basis
        FROM mystery_bag_cards
        WHERE status = 'active' AND packed_variation_id IS NOT NULL
        ORDER BY market_value ASC
        LIMIT ${count}`;
    if (bags.length < count) throw new Error(`Only ${bags.length} active bags available.`);

    const locationId = await firstLocationId();
    const captured = [];
    for (const bag of bags) {
        const object = await fetchVariation(bag.packed_variation_id);
        captured.push({
            row: bag,
            variationId: bag.packed_variation_id,
            parentItemId: object?.item_variation_data?.item_id || null,
            sku: object?.item_variation_data?.sku || bag.variation_sku,
            object,
            inStock: await inventoryCount(bag.packed_variation_id),
        });
        log(`   captured ${bag.card_name}  ${usd(Number(bag.market_value) * 100)}  sku=${captured.at(-1).sku}`);
    }

    const state = {
        takenAt: new Date().toISOString(),
        locationId,
        buyer: {
            id: owner[0].id,
            name: owner[0].display_name,
            creditCentsBefore: owner[0].store_credit_cents,
        },
        bags: captured,
        // Everything the test creates gets its id written here as it happens, so restore deletes exactly
        // what the test made and nothing that merely resembles it.
        created: { packOpenIds: [], vaultCardIds: [], pullTaskIds: [], creditEventIds: [], soldEventIds: [] },
    };
    saveState(state);
    log(`\n   snapshot saved: ${captured.length} bag(s), buyer ${owner[0].display_name} at ${usd(owner[0].store_credit_cents)}`);
    log(`   ${STATE_FILE}`);
}

// ── STATUS ──────────────────────────────────────────────────────────────────────────────────────────────────

async function cmdStatus() {
    const state = loadState();
    if (!state) return log("   no snapshot.");
    log(`   taken ${state.takenAt}`);
    log(`   buyer ${state.buyer.name}: snapshot ${usd(state.buyer.creditCentsBefore)}`);
    const now = await sql`SELECT store_credit_cents FROM mkt_buyer WHERE id = ${state.buyer.id}`;
    log(`                  live     ${usd(now[0]?.store_credit_cents)}`);
    for (const bag of state.bags) {
        const row = await sql`
            SELECT status, packed_variation_id FROM mystery_bag_cards WHERE id = ${bag.row.id}`;
        const live = await fetchVariation(row[0]?.packed_variation_id || bag.variationId);
        log(`   ${bag.row.card_name}`);
        log(`      status ${bag.row.status} -> ${row[0]?.status}`);
        log(`      variation ${bag.variationId} -> ${row[0]?.packed_variation_id}  deleted=${Boolean(live?.is_deleted)}`);
    }
    const c = state.created;
    log(`   created so far: ${c.packOpenIds.length} open(s), ${c.vaultCardIds.length} vault card(s), ${c.creditEventIds.length} credit event(s)`);
}

// ── RESTORE ─────────────────────────────────────────────────────────────────────────────────────────────────

async function cmdRestore() {
    const state = loadState();
    if (!state) return log("   no snapshot to restore.");
    const costKey = await unitCostAttributeKey();

    // 1 — rows the test created, newest dependency first.
    for (const id of state.created.pullTaskIds) await sql`DELETE FROM mkt_pack_pull_task WHERE id = ${id}`;
    for (const id of state.created.vaultCardIds) await sql`DELETE FROM mkt_vault_card WHERE id = ${id}`;
    await sql`DELETE FROM mkt_vault_event WHERE pack_open_id = ANY(${state.created.packOpenIds}::uuid[])`;
    for (const id of state.created.packOpenIds) await sql`DELETE FROM mkt_pack_open WHERE id = ${id}`;
    for (const id of state.created.soldEventIds) {
        await sql`DELETE FROM mystery_sold_assignments WHERE sold_event_id = ${id}`;
        await sql`DELETE FROM mystery_sold_events WHERE id = ${id}`;
    }
    ok(`removed ${state.created.packOpenIds.length} open(s), ${state.created.vaultCardIds.length} vault card(s)`);

    // 2 — the credit ledger. The balance is restored to the snapshot value outright and only the events the
    //     test wrote are deleted; the ledger stays append-only for everybody else.
    for (const id of state.created.creditEventIds) await sql`DELETE FROM mkt_store_credit_event WHERE id = ${id}`;
    await sql`
        UPDATE mkt_buyer SET store_credit_cents = ${state.buyer.creditCentsBefore}, updated_at = NOW()
        WHERE id = ${state.buyer.id}`;
    ok(`credit restored to ${usd(state.buyer.creditCentsBefore)}`);

    // 3 — the bags. The Square variation cannot be un-deleted, so it is rebuilt under its original SKU and
    //     the pool row re-pointed at the new id.
    for (const bag of state.bags) {
        const current = await sql`
            SELECT status, packed_variation_id FROM mystery_bag_cards WHERE id = ${bag.row.id}`;
        const liveId = current[0]?.packed_variation_id || bag.variationId;
        const live = await fetchVariation(liveId);

        let variationId = liveId;
        if (!live || live.is_deleted) {
            // ⚠️ HEAL A THIN SNAPSHOT RATHER THAN REFUSING. An entry adopted mid-cycle may have been captured
            //    without its parent item, and a restore that throws leaves a real bag sold with no variation —
            //    the worst possible failure mode for an undo. The deleted object is still retrievable, so the
            //    missing pieces are re-read here instead of giving up.
            if (!bag.object || !bag.parentItemId) {
                const recovered = live || (await fetchVariation(bag.variationId));
                bag.object = bag.object || recovered;
                bag.parentItemId = bag.parentItemId || recovered?.item_variation_data?.item_id || null;
                bag.sku = bag.sku || recovered?.item_variation_data?.sku || null;
            }
            if (!bag.parentItemId) {
                bad(`${bag.row.card_name}: no parent item recoverable — left sold, fix by hand`);
                continue;
            }
            const data = bag.object?.item_variation_data || {};
            const made = await square("/v2/catalog/object", {
                method: "POST",
                body: JSON.stringify({
                    idempotency_key: randomUUID(),
                    object: {
                        type: "ITEM_VARIATION",
                        id: "#restored",
                        item_variation_data: {
                            item_id: bag.parentItemId,
                            name: data.name || "Mystery Unit",
                            sku: bag.sku,
                            pricing_type: data.pricing_type || "FIXED_PRICING",
                            ...(data.price_money ? { price_money: data.price_money } : {}),
                            // Native unit cost is WRITE-AT-CREATE ONLY, so this is the one and only chance to
                            // put the bag's cost back. Echoing the captured vendor infos restores it exactly.
                            ...(data.item_variation_vendor_infos
                                ? { item_variation_vendor_infos: data.item_variation_vendor_infos.map((v) => ({
                                    type: "ITEM_VARIATION_VENDOR_INFO",
                                    id: "#vi",
                                    item_variation_vendor_info_data: v.item_variation_vendor_info_data,
                                })) }
                                : {}),
                        },
                        // The 65%-of-market stamp the COGS resolver reads. Restored alongside the native cost
                        // so the rebuilt bag is costed exactly as the original was.
                        ...(costKey && bag.object?.custom_attribute_values
                            ? { custom_attribute_values: bag.object.custom_attribute_values }
                            : {}),
                    },
                }),
            });
            variationId = made?.catalog_object?.id;
            ok(`${bag.row.card_name}: variation rebuilt ${bag.variationId} -> ${variationId} (sku ${bag.sku})`);
        } else {
            ok(`${bag.row.card_name}: variation still present, left alone`);
        }

        if (bag.inStock > 0) {
            await setInventory(variationId, bag.inStock, state.locationId).catch((e) => bad(`inventory: ${e.message}`));
        }

        await sql`
            UPDATE mystery_bag_cards
            SET status = ${bag.row.status},
                packed_variation_id = ${variationId},
                variation_sku = ${bag.row.variation_sku},
                reservation_key = NULL, reserved_at = NULL, sold_at = NULL, removed_at = NULL,
                updated_at = NOW()
            WHERE id = ${bag.row.id}`;
        await sql`
            DELETE FROM mystery_audit_log
            WHERE mystery_card_id = ${bag.row.id} AND created_at >= ${state.takenAt}::timestamptz`;
    }
    log("\n   restored.");
}

// ── SELFTEST ────────────────────────────────────────────────────────────────────────────────────────────────
// Proves the undo BEFORE anything depends on it. Breaks a bag exactly the way an open will — delete the
// variation, flip the row to sold, move credit — then restores and asserts the world matches the snapshot.
// A harness nobody has watched put something back is a harness, not a safety net.

async function cmdSelftest() {
    const state = loadState();
    if (!state) throw new Error("snapshot first: node scripts/vault-harness.mjs snapshot --bags 1");
    const bag = state.bags[0];
    const PRICE = 2500;

    // ⚠️ RE-READ THE VARIATION ID BEFORE BREAKING ANYTHING. A restore cannot give the old id back (Square will
    //    not un-delete), so it rebuilds under a NEW id — which means the second run of this selftest would
    //    otherwise try to delete the id from the first run and 404. The snapshot is the record of what to
    //    restore TO; the live row is the record of what exists NOW, and only the live row can be broken.
    const liveRow = (await sql`
        SELECT packed_variation_id FROM mystery_bag_cards WHERE id = ${bag.row.id}`)[0];
    bag.variationId = liveRow?.packed_variation_id || bag.variationId;
    const liveObject = await fetchVariation(bag.variationId);
    if (liveObject && !liveObject.is_deleted) {
        bag.object = liveObject;
        bag.parentItemId = liveObject.item_variation_data?.item_id || bag.parentItemId;
        bag.inStock = await inventoryCount(bag.variationId);
    }
    saveState(state);

    // ⚠️ THE CREDIT HALF MUST ACTUALLY RUN. The first selftest printed "credit restored to $9.00" while
    //    skipping the spend entirely, because the balance was under the pack price — a green line that could
    //    not have gone red. So the harness tops the balance up to afford the test, records the grant as one of
    //    its own events, and restore takes it back out with everything else.
    const before = (await sql`SELECT store_credit_cents FROM mkt_buyer WHERE id = ${state.buyer.id}`)[0];
    if (before.store_credit_cents < PRICE) {
        const topUp = PRICE - before.store_credit_cents + 500;
        const granted = await sql`
            UPDATE mkt_buyer SET store_credit_cents = store_credit_cents + ${topUp}, updated_at = NOW()
            WHERE id = ${state.buyer.id} RETURNING store_credit_cents`;
        const ev = await sql`
            INSERT INTO mkt_store_credit_event (buyer_id, delta_cents, balance_after_cents, reason, ref)
            VALUES (${state.buyer.id}, ${topUp}, ${granted[0].store_credit_cents}, 'adjust', 'harness:grant')
            RETURNING id`;
        state.created.creditEventIds.push(Number(ev[0].id));
        saveState(state);
        log(`\n0) granted ${usd(topUp)} of test credit, balance now ${usd(granted[0].store_credit_cents)}`);
    }

    log("\n1) break it, the way a real open does");
    await square(`/v2/catalog/object/${bag.variationId}`, { method: "DELETE" });
    await sql`UPDATE mystery_bag_cards SET status='sold', sold_at=NOW() WHERE id = ${bag.row.id}`;
    const spend = await sql`
        UPDATE mkt_buyer SET store_credit_cents = store_credit_cents - ${PRICE}
        WHERE id = ${state.buyer.id} AND store_credit_cents >= ${PRICE} RETURNING store_credit_cents`;
    if (!spend.length) throw new Error("credit spend did not happen — the test would prove nothing");
    const ev2 = await sql`
        INSERT INTO mkt_store_credit_event (buyer_id, delta_cents, balance_after_cents, reason, ref)
        VALUES (${state.buyer.id}, ${-PRICE}, ${spend[0].store_credit_cents}, 'pack_open', 'harness')
        RETURNING id`;
    state.created.creditEventIds.push(Number(ev2[0].id));
    saveState(state);
    ok(`credit spent, now ${usd(spend[0].store_credit_cents)}`);
    const gone = await fetchVariation(bag.variationId);
    ok(`variation deleted: is_deleted=${gone?.is_deleted}`);

    log("\n2) restore");
    await cmdRestore();

    log("\n3) assert the world matches the snapshot");
    let pass = true;
    const row = (await sql`
        SELECT status, packed_variation_id, variation_sku, card_id
        FROM mystery_bag_cards WHERE id = ${bag.row.id}`)[0];
    const rebuilt = await fetchVariation(row.packed_variation_id);
    const balance = (await sql`SELECT store_credit_cents FROM mkt_buyer WHERE id = ${state.buyer.id}`)[0];

    // ⚠️ A COMPARISON OF TWO ABSENT VALUES IS NOT A PASS. The first run of this printed a tick beside "native
    //    unit cost" because the bag had none and the rebuild had none either — undefined === undefined. That
    //    is a check that cannot fail, which is worse than no check, because it occupies the space where a real
    //    one would go. Those now say SKIP out loud and are counted separately.
    let skipped = 0;
    const check = (label, got, want) => {
        if (got === undefined && want === undefined) {
            log(`   - ${label}: SKIP (absent on both sides)`);
            skipped += 1;
            return;
        }
        if (String(got) === String(want)) ok(`${label}: ${got}`);
        else { bad(`${label}: got ${got}, wanted ${want}`); pass = false; }
    };
    check("pool status", row.status, bag.row.status);
    check("sku preserved", rebuilt?.item_variation_data?.sku, bag.sku);
    check("card_id (= sku) unchanged", row.card_id, bag.row.card_id);
    check("variation live again", rebuilt?.is_deleted ? "deleted" : "live", "live");
    check("price", rebuilt?.item_variation_data?.price_money?.amount,
        bag.object?.item_variation_data?.price_money?.amount);
    check("native unit cost",
        rebuilt?.item_variation_data?.item_variation_vendor_infos?.[0]?.item_variation_vendor_info_data?.price_money?.amount,
        bag.object?.item_variation_data?.item_variation_vendor_infos?.[0]?.item_variation_vendor_info_data?.price_money?.amount);
    check("credit balance", balance.store_credit_cents, state.buyer.creditCentsBefore);
    check("on hand", await inventoryCount(row.packed_variation_id), bag.inStock);

    // ⚠️ The cost the COGS resolver actually reads is the CUSTOM ATTRIBUTE, not Square's native field.
    //    Restoring a bag without it would quietly re-create it as a pack that cost nothing, and the margin on
    //    the next sale of that bag would be pure fiction.
    check("wolfden_unit_cost",
        rebuilt?.custom_attribute_values?.wolfden_unit_cost?.number_value,
        bag.object?.custom_attribute_values?.wolfden_unit_cost?.number_value);

    const strays = await sql`
        SELECT COUNT(*)::int AS n FROM mkt_store_credit_event
        WHERE buyer_id = ${state.buyer.id} AND ref LIKE 'harness%'`;
    check("harness ledger rows left behind", strays[0].n, 0);

    log(pass
        ? `\n   SELFTEST PASSED — the undo is real. (${skipped} check(s) skipped as inapplicable)\n`
        : "\n   SELFTEST FAILED — do not trust the undo.\n");
    if (!pass) process.exitCode = 1;
}

// ── MAIN ────────────────────────────────────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const cmd = argv[0];
const args = {};
for (let i = 1; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) { args[argv[i].slice(2)] = argv[i + 1]?.startsWith("--") ? true : argv[++i]; }
}

// ── CYCLE ───────────────────────────────────────────────────────────────────────────────────────────────────
// The real thing, end to end: openPack() → choose → assert the books → restore. It imports the app's OWN
// functions rather than reimplementing them, because a harness that reimplements the path under test proves
// only that two pieces of code agree with each other.
//
//   node --import ./scripts/lib/register-loader.mjs scripts/vault-harness.mjs cycle [--choice sell|vault]

async function cmdCycle(args) {
    const state = loadState();
    if (!state) throw new Error("snapshot first: node scripts/vault-harness.mjs snapshot --bags 1 --buyer <id>");
    const choice = args.choice === "vault" ? "vault" : "sell";

    const { openPack, choosePackOutcome, packPriceCents, splitPriceForTax } = await import("@/lib/marketplace/packs.js");
    const { getShopSalesTaxRate } = await import("@/lib/consignment/square");

    const price = await packPriceCents();
    log(`\n   pack price ${usd(price)}`);

    // Fund it. Recorded as one of ours so restore takes it back out.
    const before = (await sql`SELECT store_credit_cents FROM mkt_buyer WHERE id = ${state.buyer.id}`)[0];
    if (before.store_credit_cents < price) {
        const topUp = price - before.store_credit_cents + 500;
        const granted = await sql`
            UPDATE mkt_buyer SET store_credit_cents = store_credit_cents + ${topUp}, updated_at = NOW()
            WHERE id = ${state.buyer.id} RETURNING store_credit_cents`;
        const ev = await sql`
            INSERT INTO mkt_store_credit_event (buyer_id, delta_cents, balance_after_cents, reason, ref)
            VALUES (${state.buyer.id}, ${topUp}, ${granted[0].store_credit_cents}, 'adjust', 'harness:grant')
            RETURNING id`;
        state.created.creditEventIds.push(Number(ev[0].id));
        saveState(state);
        ok(`granted ${usd(topUp)}, balance ${usd(granted[0].store_credit_cents)}`);
    }

    log("\n1) openPack()");
    const result = await openPack({ buyerId: state.buyer.id });
    if (!result.ok) throw new Error(`open refused: ${result.error}`);
    const open = result.open;
    state.created.packOpenIds.push(open.id);
    saveState(state);
    ok(`pulled ${open.card.name} — ${usd(open.card.valueCents)} (${open.tier})`);
    ok(`balance now ${usd(open.balanceCents)}`);

    // ⚠️ THE BAG THAT WAS PULLED IS ALMOST CERTAINLY NOT THE ONE WE SNAPSHOTTED — the pool picks at random
    //    from all 79. So capture whatever it actually took, or restore puts back a bag nobody broke and
    //    leaves the real one sold.
    const pulled = (await sql`
        SELECT id, card_id, card_name, market_value, status, square_variation_id, packed_variation_id,
               variation_sku, channel, cost_cents, cost_basis
        FROM mystery_bag_cards WHERE id = ${open.card.id}`)[0];
    if (!state.bags.some((b) => b.row.id === pulled.id)) {
        // ⚠️ ADOPTION IS THE NORMAL PATH, NOT THE EXCEPTION — the pool picks at random from all 79, so the bag
        //    that gets opened is almost never the one we snapshotted. Which means the capture here has to be
        //    as complete as the one in `snapshot`, and the first version was not: it stored `object: null` and
        //    `parentItemId: null`, so restore tried to recreate a variation with no parent and Square refused
        //    with "Item Variation with id #restored has no item_id".
        //
        //    It is recoverable precisely because SQUARE STILL RETURNS DELETED OBJECTS. The open has already
        //    deleted this variation by the time we get here, and `include_deleted_objects` hands the whole
        //    thing back — parent item, price, SKU, custom attributes and all.
        const deleted = await fetchVariation(pulled.packed_variation_id);
        state.bags.push({
            row: { ...pulled, status: "active" },
            variationId: pulled.packed_variation_id,
            parentItemId: deleted?.item_variation_data?.item_id || null,
            sku: deleted?.item_variation_data?.sku || pulled.variation_sku,
            object: deleted,
            inStock: 1,
        });
        saveState(state);
        log(`   (adopted ${pulled.card_name} — the pool chose it, not us; recovered its deleted object)`);
        if (!deleted?.item_variation_data?.item_id) bad("could not recover the parent item — restore will fail");
    }

    log("\n2) the books");
    const row = (await sql`
        SELECT price_cents, revenue_cents, tax_cents, cogs_cents, cogs_basis, tier, preview, outcome
        FROM mkt_pack_open WHERE id = ${open.id}`)[0];
    const rate = await getShopSalesTaxRate().catch(() => 0);
    const expected = splitPriceForTax(row.price_cents, rate);
    let pass = true;
    const check = (label, got, want) => {
        if (String(got) === String(want)) ok(`${label}: ${got}`);
        else { bad(`${label}: got ${got}, wanted ${want}`); pass = false; }
    };
    log(`   tax rate ${(rate * 100).toFixed(3)}%`);
    check("revenue + tax === price", row.revenue_cents + row.tax_cents, row.price_cents);
    check("revenue", row.revenue_cents, expected.revenueCents);
    check("tax", row.tax_cents, expected.taxCents);
    check("preview stamped", row.preview, true);
    log(`   cogs ${usd(row.cogs_cents)} basis=${row.cogs_basis}`);
    if (row.cogs_cents === null) { bad("cogs is null"); pass = false; }

    const task = (await sql`
        SELECT bag_sku, status FROM mkt_pack_pull_task WHERE pack_open_id = ${open.id}`)[0];
    if (task) { ok(`pull task raised for bag ${task.bag_sku}`); state.created.pullTaskIds.push(task.id); }
    else { bad("no pull task raised"); pass = false; }

    const sold = (await sql`
        SELECT id FROM mystery_sold_events WHERE idempotency_key LIKE 'vpo:%' ORDER BY created_at DESC LIMIT 1`)[0];
    if (sold) state.created.soldEventIds.push(sold.id);
    saveState(state);

    log(`\n3) choose "${choice}"`);
    const chosen = await choosePackOutcome({ buyerId: state.buyer.id, openId: open.id, choice });
    if (!chosen.ok) throw new Error(`choose refused: ${chosen.error}`);
    if (choice === "sell") {
        ok(`credited ${usd(chosen.creditedCents)}, balance ${usd(chosen.balanceCents)}`);
        check("sell-back pays 100% of value", chosen.creditedCents, open.card.valueCents);
        const after = (await sql`SELECT status FROM mkt_pack_pull_task WHERE pack_open_id = ${open.id}`)[0];
        check("pull task cancelled (card never left)", after?.status, "done");
    } else {
        state.created.vaultCardIds.push(chosen.vaultCardId);
        saveState(state);
        const v = (await sql`
            SELECT card_name, set_name, card_number, condition, tier, current_value_cents, releasable_at
            FROM mkt_vault_card WHERE id = ${chosen.vaultCardId}`)[0];
        ok(`vaulted "${v.card_name}" ${[v.set_name, v.card_number, v.condition].filter(Boolean).join(" · ")}`);
        check("vault value matches the pull", v.current_value_cents, open.card.valueCents);
        check("never shows the placeholder set", v.set_name === "Square" ? "Square" : "real", "real");
    }

    // A second tap must not pay twice.
    const again = await choosePackOutcome({ buyerId: state.buyer.id, openId: open.id, choice });
    check("double-tap refused", again.ok === false && again.error, "already_chosen");

    log("\n4) restore");
    await cmdRestore();

    const finalBalance = (await sql`SELECT store_credit_cents FROM mkt_buyer WHERE id = ${state.buyer.id}`)[0];
    const activeNow = (await sql`SELECT COUNT(*)::int n FROM mystery_bag_cards WHERE status='active'`)[0];
    check("credit back to snapshot", finalBalance.store_credit_cents, state.buyer.creditCentsBefore);
    log(`   active pool: ${activeNow.n}`);

    log(pass ? "\n   CYCLE PASSED — the real path runs and reverts.\n" : "\n   CYCLE FAILED.\n");
    if (!pass) process.exitCode = 1;
}

// ── ADOPT ───────────────────────────────────────────────────────────────────────────────────────────────────
// Pull every pack open this buyer has made since the snapshot into the snapshot's undo list.
//
// ⚠️ THIS IS WHAT MAKES DRIVING THE REAL UI SAFE. `cycle` adopts the bag it opened because it called openPack()
// itself and knows the answer. A browser clicking the button does not tell the harness anything — so without
// this, filming the reveal leaves a real bag sold with its Square variation deleted and nothing recorded that
// could put it back.
//
// It is still scoped: only opens belonging to this buyer, only ones created after the snapshot was taken, and
// only ones not already adopted. It never sweeps "anything that looks like a test".

async function cmdAdopt() {
    const state = loadState();
    if (!state) throw new Error("snapshot first");

    const opens = await sql`
        SELECT o.id, o.outcome, o.created_at, c.id AS card_id, c.card_name, c.card_id AS card_sku,
               c.market_value, c.square_variation_id, c.packed_variation_id, c.variation_sku, c.channel,
               c.cost_cents, c.cost_basis
        FROM mkt_pack_open o
        JOIN mystery_bag_cards c ON c.id = o.mystery_card_id
        WHERE o.buyer_id = ${state.buyer.id} AND o.created_at >= ${state.takenAt}::timestamptz
        ORDER BY o.created_at`;

    let added = 0;
    for (const open of opens) {
        if (!state.created.packOpenIds.includes(open.id)) {
            state.created.packOpenIds.push(open.id);
            added += 1;
        }
        if (!state.bags.some((b) => b.row.id === open.card_id)) {
            const deleted = await fetchVariation(open.packed_variation_id);
            state.bags.push({
                row: {
                    id: open.card_id, card_id: open.card_sku, card_name: open.card_name,
                    market_value: open.market_value, status: "active",
                    square_variation_id: open.square_variation_id,
                    packed_variation_id: open.packed_variation_id,
                    variation_sku: open.variation_sku, channel: open.channel,
                    cost_cents: open.cost_cents, cost_basis: open.cost_basis,
                },
                variationId: open.packed_variation_id,
                parentItemId: deleted?.item_variation_data?.item_id || null,
                sku: deleted?.item_variation_data?.sku || open.variation_sku,
                object: deleted,
                inStock: 1,
            });
            log(`   adopted bag: ${open.card_name} (${open.outcome})`);
        }
    }

    const tasks = await sql`
        SELECT id FROM mkt_pack_pull_task WHERE pack_open_id = ANY(${state.created.packOpenIds}::uuid[])`;
    for (const t of tasks) if (!state.created.pullTaskIds.includes(t.id)) state.created.pullTaskIds.push(t.id);

    const vault = await sql`
        SELECT id FROM mkt_vault_card WHERE pack_open_id = ANY(${state.created.packOpenIds}::uuid[])`;
    for (const v of vault) if (!state.created.vaultCardIds.includes(v.id)) state.created.vaultCardIds.push(v.id);

    const sold = await sql`
        SELECT id FROM mystery_sold_events
        WHERE source = 'virtual_open' AND created_at >= ${state.takenAt}::timestamptz`;
    for (const s of sold) if (!state.created.soldEventIds.includes(s.id)) state.created.soldEventIds.push(s.id);

    // Credit movements the UI made. Scoped to this buyer and to reasons this feature owns.
    const credit = await sql`
        SELECT id FROM mkt_store_credit_event
        WHERE buyer_id = ${state.buyer.id} AND created_at >= ${state.takenAt}::timestamptz
          AND reason IN ('pack_open', 'vault_sellback')`;
    for (const c of credit) if (!state.created.creditEventIds.includes(Number(c.id))) state.created.creditEventIds.push(Number(c.id));

    saveState(state);
    ok(`adopted ${added} open(s); ${state.created.vaultCardIds.length} vault card(s), ${state.created.creditEventIds.length} credit event(s) tracked`);
}

const commands = {
    snapshot: cmdSnapshot, status: cmdStatus, restore: cmdRestore,
    selftest: cmdSelftest, cycle: cmdCycle, adopt: cmdAdopt,
};
if (!commands[cmd]) {
    log("usage: node scripts/vault-harness.mjs <snapshot|status|selftest|restore> [--bags N] [--buyer <id>]");
    process.exit(1);
}
await commands[cmd](args);
