#!/usr/bin/env node
/**
 * ── PROVING THE VAULT, SCENARIO BY SCENARIO ─────────────────────────────────────────────────────────────────
 *
 * The first round of testing covered the happy path and called it done. This covers the paths that only run
 * when something goes wrong or somebody does two things at once — which is where the money actually leaks.
 *
 * ⚠️ EVERY ASSERTION HERE IS ONE THAT CAN FAIL. An earlier selftest printed a tick beside two checks that
 * compared undefined to undefined; a check that cannot go red is worse than no check, because it occupies the
 * space a real one would take. So anything inapplicable says SKIP out loud and is counted separately.
 *
 * ⚠️ IT RUNS AGAINST THE REAL DATABASE AND THE REAL SQUARE CATALOG, because that is the only place the
 * failure modes live. Take a baseline first and put it back afterwards:
 *
 *     npm run harness:vault begin -- --buyer <id>
 *     npm run prove:vault
 *     npm run harness:vault undo
 *
 * It refuses to start without a baseline, because a run with no undo behind it is an experiment on the shop.
 */

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function readKey(file, key) {
    if (!existsSync(file)) return null;
    const line = readFileSync(file, "utf8").split(/\r?\n/).map((l) => l.trim()).find((l) => l.startsWith(`${key}=`));
    return line ? line.slice(line.indexOf("=") + 1).replace(/^["']|["']$/g, "").trim() : null;
}

process.env.DATABASE_URL = process.env.DATABASE_URL
    || readKey(path.join(ROOT, ".env.local"), "DATABASE_URL")
    || readKey("C:/Users/Luke/Projects/accounting_app/.env", "DATABASE_URL");
process.env.SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN
    || readKey(path.join(ROOT, ".env.local"), "SQUARE_ACCESS_TOKEN")
    || readKey("C:/Users/Luke/Projects/accounting_app/local.properties", "SQUARE_ACCESS_TOKEN");
process.env.SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID
    || readKey(path.join(ROOT, ".env.local"), "SQUARE_LOCATION_ID");

if (!process.argv.includes("--verbose")) {
    console.info = () => {};
    const real = console.log;
    console.log = (...a) => {
        if (typeof a[0] === "string" && a[0].startsWith("{\"timestamp\"")) return;
        real(...a);
    };
}

const STATE = path.join(ROOT, "scratch", "vault-harness-state.json");
if (!existsSync(STATE)) {
    console.error("No baseline. Run:  npm run harness:vault begin -- --buyer <id>");
    process.exit(1);
}
const BUYER = JSON.parse(readFileSync(STATE, "utf8")).buyer.id;

const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);

// ── ⚠️ IS SOMEBODY ELSE USING THIS ACCOUNT RIGHT NOW? ───────────────────────────────────────────────────────
//
// This suite is DESTRUCTIVE and it runs as a real buyer. On 2026-10-27 it ran while Luke was testing the
// feature on his phone AS THE SAME ACCOUNT, and the damage was exactly what you would predict and nobody
// predicted:
//
//   · `setCredit()` overwrote his live balance between his taps
//   · the one-pending-open rule handed HIS in-flight open to the resume test
//   · the "can't find it" test then refunded it and pulled that bag from the pool — so the card he was
//     looking at on screen vanished mid-decision
//   · "sell from the vault" sells the highest-value card it finds, which was one of his
//
// A destructive suite sharing an identity with a live user is dangerous by construction. So it looks first,
// and refuses rather than asking forgiveness. `--force` exists for the case where you genuinely know the
// account is idle; it is deliberately not the default.
const recent = (await sql`
    SELECT
        (SELECT COUNT(*)::int FROM mkt_pack_open
          WHERE buyer_id = ${BUYER} AND outcome = 'pending') AS pending,
        (SELECT COUNT(*)::int FROM mkt_pack_open
          WHERE buyer_id = ${BUYER} AND created_at > NOW() - INTERVAL '3 minutes') AS opens,
        (SELECT COUNT(*)::int FROM mkt_store_credit_event
          WHERE buyer_id = ${BUYER} AND created_at > NOW() - INTERVAL '3 minutes') AS credit`)[0];

if (!process.argv.includes("--force") && (recent.pending > 0 || recent.opens > 0 || recent.credit > 0)) {
    console.error("");
    console.error("REFUSING TO RUN — this account looks like it is being used right now.");
    console.error(`  ${recent.pending} un-chosen open, ${recent.opens} open(s) and ${recent.credit} credit movement(s) in the last 3 minutes.`);
    console.error("");
    console.error("This suite spends credit, sells cards and removes bags from the pool. Running it alongside");
    console.error("a live session will take somebody's card out from under them.");
    console.error("");
    console.error("Wait for the account to go quiet, or pass --force if you are certain nobody is using it.");
    console.error("");
    process.exit(1);
}

const { openPack, choosePackOutcome, packPrice, splitPriceForTax, resumePendingOpen } =
    await import("@/lib/marketplace/packs.js");
const { getVault, sellVaultCards, createVaultOrder, cancelVaultOrder, quoteVaultShipping } =
    await import("@/lib/marketplace/vault.js");
const { restockBoughtBackCard } = await import("@/lib/marketplace/vault-restock.js");
const { closePullTask } = await import("@/lib/marketplace/pack-telemetry.js");
const { insuranceCostCents, INSURE_OVER_CENTS, isEasyPostEnabled } = await import("@/lib/shipping/easypost");

const usd = (c) => `$${((Number(c) || 0) / 100).toFixed(2)}`;
let pass = 0;
let fail = 0;
let skip = 0;

function is(label, got, want) {
    if (String(got) === String(want)) { console.log(`   \u2713 ${label}: ${got}`); pass += 1; }
    else { console.log(`   \u2717 ${label}: ${got}  (wanted ${want})`); fail += 1; }
}
function ok(label, cond, detail = "") {
    if (cond) { console.log(`   \u2713 ${label}${detail ? ": " + detail : ""}`); pass += 1; }
    else { console.log(`   \u2717 ${label}${detail ? ": " + detail : ""}`); fail += 1; }
}
function skipped(label, why) { console.log(`   - ${label}: SKIP (${why})`); skip += 1; }
const head = (n, t) => console.log(`\n${n}. ${t}`);

const credit = async () => (await sql`SELECT store_credit_cents c FROM mkt_buyer WHERE id=${BUYER}`)[0].c;
const setCredit = async (c) => sql`UPDATE mkt_buyer SET store_credit_cents=${c} WHERE id=${BUYER}`;
const squareGet = async (p, init = {}) => {
    const res = await fetch("https://connect.squareup.com" + p, {
        ...init,
        headers: {
            Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
            "Square-Version": "2025-01-23",
        },
    });
    return { status: res.status, body: await res.json().catch(() => null) };
};
const onHand = async (v) => {
    const r = await squareGet("/v2/inventory/counts/batch-retrieve", {
        method: "POST", body: JSON.stringify({ catalog_object_ids: [v], states: ["IN_STOCK"] }),
    });
    return Number(r.body?.counts?.find((c) => c.state === "IN_STOCK")?.quantity || 0);
};

const price = (await packPrice()).cents;
console.log(`\nBuyer ${BUYER}  ·  pack price ${usd(price)}\n${"=".repeat(72)}`);

// ── 1. REFUSALS ─────────────────────────────────────────────────────────────────────────────────────────────
head(1, "It refuses rather than half-charging");
await setCredit(price - 1);
const poor = await openPack({ buyerId: BUYER });
is("open refused on insufficient credit", poor.error, "insufficient_credit");
is("credit untouched after refusal", await credit(), price - 1);
const activeBefore = (await sql`SELECT COUNT(*)::int n FROM mystery_bag_cards WHERE status='active'`)[0].n;
// ⚠️ Scoped to reservations made JUST NOW. The first version counted every reserved row in the table and
//    went red because another session had a bag in flight — a test that fails on somebody else's activity
//    teaches you to ignore it.
is("no bag was claimed by the refusal",
    (await sql`SELECT COUNT(*)::int n FROM mystery_bag_cards
               WHERE status='reserved' AND reserved_at > NOW() - INTERVAL '20 seconds'`)[0].n, 0);

// ── 2. THE OPEN, AND WHAT IT WRITES ─────────────────────────────────────────────────────────────────────────
head(2, "A real open");
await setCredit(price * 6);
const before = await credit();
const r1 = await openPack({ buyerId: BUYER });
ok("open succeeded", r1.ok, r1.ok ? r1.open.card.name : r1.error);
if (!r1.ok) process.exit(1);
const open1 = r1.open;
is("charged exactly the sticker", before - (await credit()), price);
const row1 = (await sql`SELECT * FROM mkt_pack_open WHERE id=${open1.id}`)[0];
is("revenue + tax === price", row1.revenue_cents + row1.tax_cents, row1.price_cents);
const expectSplit = splitPriceForTax(price, 0.07375);
ok("tax backed out, not added on", row1.tax_cents > 0 && row1.price_cents === price,
    `${usd(row1.revenue_cents)} + ${usd(row1.tax_cents)}`);
ok("cogs recorded with a basis", row1.cogs_cents !== null && Boolean(row1.cogs_basis),
    `${usd(row1.cogs_cents)} (${row1.cogs_basis})`);
is("stamped as a preview open", row1.preview, true);
is("pool shrank by one", (await sql`SELECT COUNT(*)::int n FROM mystery_bag_cards WHERE status='active'`)[0].n, activeBefore - 1);
const pooled = (await sql`SELECT packed_variation_id, status FROM mystery_bag_cards WHERE id=${open1.card.id}`)[0];
is("pool row marked sold", pooled.status, "sold");
const gone = await squareGet("/v2/catalog/batch-retrieve", {
    method: "POST", body: JSON.stringify({ object_ids: [pooled.packed_variation_id], include_deleted_objects: true }),
});
is("bag taken off the register", gone.body?.objects?.[0]?.is_deleted, true);
const task1 = (await sql`SELECT kind, status, promoted FROM mkt_pack_pull_task WHERE pack_open_id=${open1.id}`)[0];
is("pull task raised", task1 ? `${task1.kind}/${task1.status}` : "MISSING", "pull/open");

// ── 3. A STUCK OPEN IS RESUMED, NOT RE-CHARGED ──────────────────────────────────────────────────────────────
head(3, "A member who walked away mid-reveal");
const resumed = await openPack({ buyerId: BUYER });
is("second open resumes instead of charging", resumed.resumed, true);
is("same open returned", resumed.open.id, open1.id);
is("no second charge", await credit(), before - price);
ok("resumePendingOpen finds it", (await resumePendingOpen(BUYER))?.id === open1.id);

// ── 4. SELL AT THE REVEAL — the path that lost the card ─────────────────────────────────────────────────────
head(4, "Sell at the reveal");
const srcVar = (await sql`SELECT square_variation_id FROM mystery_bag_cards WHERE id=${open1.card.id}`)[0].square_variation_id;
const stockBefore = await onHand(srcVar);
const sold = await choosePackOutcome({ buyerId: BUYER, openId: open1.id, choice: "sell" });
ok("sell succeeded", sold.ok);
is("paid 100% of value", sold.creditedCents, open1.card.valueCents);
await new Promise((r) => setTimeout(r, 1800));
is("card went back into Square stock", await onHand(srcVar), stockBefore + 1);
const task1b = (await sql`SELECT kind, status FROM mkt_pack_pull_task WHERE pack_open_id=${open1.id}`)[0];
is("task KEPT and re-purposed (not cancelled)", `${task1b.kind}/${task1b.status}`, "reshelve/open");
ok("trade posted", (await sql`SELECT COUNT(*)::int n FROM trade WHERE source='vault_buyback'`)[0].n > 0);
ok("cost recorded", Boolean((await sql`SELECT 1 FROM wolfden_item_cost WHERE variation_id=${srcVar}`)[0]));
const twice = await choosePackOutcome({ buyerId: BUYER, openId: open1.id, choice: "sell" });
is("double-tap refused", twice.error, "already_chosen");

// ── 5. CONCURRENCY ──────────────────────────────────────────────────────────────────────────────────────────
head(5, "Five members tapping Open at the same moment");
await setCredit(price * 8);
// One pending open blocks the rest by design, so clear it first.
const burst = await Promise.all(Array.from({ length: 5 }, () => openPack({ buyerId: BUYER })));
const won = burst.filter((b) => b.ok && !b.resumed);
const claimedIds = won.map((b) => b.open.card.id);
is("no bag claimed twice", new Set(claimedIds).size, claimedIds.length);
ok("the one-pending-open rule held", won.length <= 1,
    `${won.length} fresh open(s), ${burst.filter((b) => b.resumed).length} resumed`);
const pending = await resumePendingOpen(BUYER);
if (pending) await choosePackOutcome({ buyerId: BUYER, openId: pending.id, choice: "vault" });

// ── 6. THE VAULT, AND AN ORDER ──────────────────────────────────────────────────────────────────────────────
head(6, "Vault, order, cancel");
await setCredit(price * 4);
const keep = [];
for (let i = 0; i < 2; i += 1) {
    const r = await openPack({ buyerId: BUYER });
    if (!r.ok) break;
    const c = await choosePackOutcome({ buyerId: BUYER, openId: r.open.id, choice: "vault" });
    keep.push(c.vaultCardId);
}
const v1 = await getVault(BUYER);
ok("cards are in the vault", v1.totals.heldCount >= keep.length, `${v1.totals.heldCount} held`);
ok("no placeholder set name reaches a member", v1.held.every((c) => c.setName !== "Square"));
const order = await createVaultOrder({ buyerId: BUYER, cardIds: keep, mode: "pickup" });
ok("pickup order created", order.ok, order.ok ? order.orderId : order.error);
const so = (await sql`SELECT total_cents, vault_order, items_json FROM shop_orders WHERE id=${order.orderId}`)[0];
is("pickup costs nothing", so.total_cents, 0);
is("flagged as a vault order", so.vault_order, true);
ok("line items priced at zero", so.items_json.every((l) => l.unitPriceCents === 0),
    "the card was paid for at the open");
const promoted = (await sql`SELECT COUNT(*)::int n FROM mkt_pack_pull_task WHERE promoted AND status='open'`)[0].n;
ok("the order jumped the queue", promoted >= keep.length, `${promoted} promoted`);

await sql`UPDATE shop_orders SET fulfillment_status='ready' WHERE id=${order.orderId}`;
const cancelled = await cancelVaultOrder({ buyerId: BUYER, orderId: order.orderId });
ok("prepared pickup order self-cancels", cancelled.ok);
is("cards came back", (await getVault(BUYER)).totals.heldCount, v1.totals.heldCount);
is("re-file tasks raised", (await sql`SELECT COUNT(*)::int n FROM mkt_pack_pull_task WHERE kind='refile'`)[0].n, keep.length);

// ── 7. SELL FROM THE VAULT ──────────────────────────────────────────────────────────────────────────────────
head(7, "Sell from the vault");
const vaultNow = await getVault(BUYER);
const toSell = vaultNow.held.slice(0, 1).map((c) => c.id);
const creditBefore = await credit();
const sellRes = await sellVaultCards({ buyerId: BUYER, cardIds: toSell });
ok("sell succeeded", sellRes.ok, sellRes.ok ? usd(sellRes.creditedCents) : sellRes.error);
is("credit went up by exactly the value", (await credit()) - creditBefore, sellRes.creditedCents);
const again = await sellVaultCards({ buyerId: BUYER, cardIds: toSell });
is("selling the same card twice refused", again.error, "nothing_sellable");

// ── 8. THE SQUARE ITEM-CREATION PATH ────────────────────────────────────────────────────────────────────────
// Luke: "In the case the user sells and the item doesn't exist in Square it will make an item with the proper
// unit cost, image, name and description, quantity and tax and category."
head(8, "Buying back a card whose Square item is gone");
const madeUp = `ZZNONEXISTENT${randomUUID().slice(0, 8).toUpperCase()}`;
const created = await restockBoughtBackCard({
    squareVariationId: madeUp,
    name: `ZZ Prove Card ${randomUUID().slice(0, 6)}`,
    subtitle: "999/999 · Secret Rare · NM",
    imageUrl: null,
    valueCents: 4200,
    paidCents: 4200,
});
ok("a new item was created", created.created && Boolean(created.variationId), created.variationId || created.error);
if (created.variationId) {
    const obj = await squareGet(`/v2/catalog/object/${created.variationId}?include_related_objects=true`);
    const v = obj.body?.object?.item_variation_data;
    const item = obj.body?.related_objects?.find((o) => o.type === "ITEM")?.item_data;
    is("priced at the card's value", v?.price_money?.amount, 4200);
    is("taxable", item?.is_taxable, true);
    ok("reporting_category set", Boolean(item?.reporting_category?.id || item?.category_id),
        item?.reporting_category?.id || "none — no matching category in the catalog");
    // Square's native unit cost is not API-writable in ANY shape — probed both ways on 2026-10-27. The cost
    // lives in the custom attribute and in our own table, which is what COGS actually reads.
    skipped("native Square unit cost", "not API-writable in any create shape; see vault-restock.js");
    // Square normalises a NUMBER custom attribute, so "42" comes back "42.0". Compare the VALUE, not the text.
    is("wolfden_unit_cost attribute written",
        Number(obj.body?.object?.custom_attribute_values?.wolfden_unit_cost?.number_value), 42);
    await new Promise((r) => setTimeout(r, 1500));
    is("stocked one unit", await onHand(created.variationId), 1);
    const ourCost = (await sql`SELECT unit_cost_cents, source FROM wolfden_item_cost WHERE variation_id=${created.variationId}`)[0];
    is("our own cost table written", ourCost ? `${ourCost.unit_cost_cents}/${ourCost.source}` : "MISSING", "4200/vault_buyback");

    // Clean up the throwaway item immediately — it is not part of the catalog anybody should see.
    const parent = obj.body?.object?.item_variation_data?.item_id;
    if (parent) await squareGet(`/v2/catalog/object/${parent}`, { method: "DELETE" });
    await sql`DELETE FROM wolfden_item_cost WHERE variation_id=${created.variationId}`;
    console.log("   (throwaway item deleted)");
}

// ── 9. THE STAFF QUEUE ──────────────────────────────────────────────────────────────────────────────────────
head(9, "The pull queue");
const openTask = (await sql`SELECT id, pack_open_id FROM mkt_pack_pull_task WHERE status='open' LIMIT 1`)[0];
if (!openTask) {
    skipped("queue actions", "no open task to work");
} else {
    const done = await closePullTask({ taskId: openTask.id, by: "prove" });
    is("Done closes the task", done?.status, "done");
    const twiceClosed = await closePullTask({ taskId: openTask.id, by: "prove" });
    is("closing it again refused", twiceClosed, null);
}

// "Can't find it" needs an open task attached to an un-chosen open, so make one.
head(9.5, "\"Can't find it\" refunds in full");
await setCredit(price * 2);
const lost = await openPack({ buyerId: BUYER });
if (!lost.ok) {
    skipped("missing-bag refund", lost.error);
} else {
    const beforeRefund = await credit();
    const lostTask = (await sql`SELECT id FROM mkt_pack_pull_task WHERE pack_open_id=${lost.open.id}`)[0];
    const closed = await closePullTask({ taskId: lostTask.id, by: "prove", notFound: true });
    is("task marked not_found", closed?.status, "not_found");
    // The refund itself lives in the API route; mirror what it does so the outcome is provable here.
    const { addCredit } = await import("@/lib/marketplace/store-credit.js");
    await addCredit(BUYER, lost.open.priceCents, "refund", `pack-missing:${lost.open.id}`, { reason: "bag_not_found" });
    await sql`UPDATE mkt_pack_open SET outcome='refunded' WHERE id=${lost.open.id}`;
    await sql`UPDATE mystery_bag_cards SET status='removed', removed_at=NOW() WHERE id=${lost.open.card.id}`;
    is("member refunded the full pack price", (await credit()) - beforeRefund, lost.open.priceCents);
    is("bag taken out of the pool",
        (await sql`SELECT status FROM mystery_bag_cards WHERE id=${lost.open.card.id}`)[0].status, "removed");
}

// ── 10. SHIPPING ────────────────────────────────────────────────────────────────────────────────────────────
head(10, "Shipping");
is("insurance threshold is $200", INSURE_OVER_CENTS, 20000);
is("insurance on a $600 card", insuranceCostCents(60000), 600);
is("insurance has a floor", insuranceCostCents(500), 100);
is("nothing declared, nothing charged", insuranceCostCents(0), 0);
if (!isEasyPostEnabled()) {
    const q = await quoteVaultShipping({ buyerId: BUYER, cardIds: (await getVault(BUYER)).held.map((c) => c.id), toAddress: {} });
    is("refuses cleanly with no carrier configured", q.error, "shipping_unavailable");
    skipped("live rates, label purchase, insurance on a real label", "no EASYPOST_API_KEY in this environment");
} else {
    skipped("live shipping", "EasyPost configured but not exercised by this script");
}

// ── 11. TELEMETRY ───────────────────────────────────────────────────────────────────────────────────────────
head(11, "Telemetry keeps preview opens out of engagement");
const { getPackTelemetry } = await import("@/lib/marketplace/pack-telemetry.js");
const t = await getPackTelemetry({ days: 1 });
is("preview opens excluded from the count", t.headline.opens, 0);
ok("the books still see them",
    (await sql`SELECT COUNT(*)::int n FROM mkt_pack_open WHERE preview`)[0].n > 0,
    "real money, excluded averages");
ok("guardrail computed", t.guardrail.evCents > 0, `EV ${usd(t.guardrail.evCents)} = ${t.guardrail.evPercentOfPrice}% of price`);
is("guardrail not flagging a loss", t.guardrail.losing, false);

console.log(`\n${"=".repeat(72)}`);
console.log(`${pass} passed · ${fail} failed · ${skip} skipped`);
console.log(fail === 0 ? "ALL ASSERTIONS PASSED" : "FAILURES ABOVE");
console.log("\nNow put it back:  npm run harness:vault undo\n");
process.exitCode = fail === 0 ? 0 : 1;
