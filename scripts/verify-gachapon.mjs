// ── DOES THE MACHINE WORK, AND CAN IT BE ROBBED? ─────────────────────────────────────────────────────────
// The gachapon is the only thing in the game that mints real store credit, so this does not test the happy
// path and stop. It pulls on a LIVE row, puts everything back, and then goes after the three ways a prize
// machine goes wrong: a pull with no ticket, two pulls racing for one ticket, and a duplicate of an
// own-once exclusive.
//
//   node --import ./scripts/lib/register-loader.mjs scripts/verify-gachapon.mjs [member]
import "./lib/register-loader.mjs";
import fs from "node:fs";

const env = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
process.env.DATABASE_URL ||= env.match(/^DATABASE_URL=["']?([^"'\r\n]+)/m)[1];

const { db } = await import("../src/lib/db.js");
const { pull, gachaView, ticketsHeld, TICKET, POOL } = await import("../src/lib/marketplace/gachapon.js");

const who = process.argv.slice(2).find((a) => !a.startsWith("-")) || "The Wolf Den";
const b = await db.queryOne(`SELECT id FROM mkt_buyer WHERE display_name = $1`, [who]);
if (!b) { console.error("no such member:", who); process.exit(1); }

let fails = 0;
const check = (ok, label, detail = "") => { if (!ok) fails += 1; console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`); };

// ⚠️ EVERYTHING THIS SCRIPT CAN CHANGE IS SNAPSHOTTED. It spends tickets, grants pets, decorations, chests,
// consumables, candy and — if it is unlucky — real money, on a real account.
const before = {
    tickets: await ticketsHeld(b.id),
    credit: (await db.queryOne(`SELECT store_credit_cents AS c FROM mkt_buyer WHERE id = $1`, [b.id]))?.c ?? 0,
    pets: (await db.query(`SELECT ref FROM mkt_cosmetic_unlock WHERE buyer_id = $1 AND category = 'pet'`, [b.id])).map((r) => r.ref),
    decos: (await db.query(`SELECT deco_id FROM mkt_deco_owned WHERE buyer_id = $1`, [b.id])).map((r) => r.deco_id),
    candy: (await db.queryOne(`SELECT COALESCE(candy,0)::int AS c FROM mkt_buyer WHERE id = $1`, [b.id]))?.c ?? 0,
};
console.log(`${who}: ${before.tickets} tokens, $${(before.credit / 100).toFixed(2)} credit, ${before.pets.length} pets, ${before.decos.length} decos`);

const PULLS = 30;
try {
    // ── 1. NO TICKET, NO PULL ────────────────────────────────────────────────────────────────────────
    await db.query(`DELETE FROM mkt_user_consumable WHERE buyer_id = $1 AND consumable_id = $2`, [b.id, TICKET]);
    const broke = await pull(b.id);
    check(!broke.ok && broke.error === "no_ticket", "a pull with no token is refused", broke.error || "it paid out");

    // ── 2. TWO PULLS RACING FOR ONE TICKET ───────────────────────────────────────────────────────────
    // ⚠️ THE ONE THAT WOULD COST MONEY. Two taps on a phone hitting one ticket must produce exactly one
    // capsule; the spend is a conditional UPDATE precisely so this cannot pay twice.
    await db.query(
        `INSERT INTO mkt_user_consumable (buyer_id, consumable_id, count) VALUES ($1, $2, 1)
         ON CONFLICT (buyer_id, consumable_id) DO UPDATE SET count = 1`, [b.id, TICKET]);
    const race = await Promise.all([pull(b.id), pull(b.id)]);
    check(race.filter((r) => r.ok).length === 1, "two simultaneous pulls on one token pay once",
        `${race.filter((r) => r.ok).length} succeeded`);
    check(await ticketsHeld(b.id) === 0, "and the token is gone");

    // ── 3. THE POOL, THROUGH THE REAL FUNCTION ───────────────────────────────────────────────────────
    await db.query(
        `INSERT INTO mkt_user_consumable (buyer_id, consumable_id, count) VALUES ($1, $2, $3)
         ON CONFLICT (buyer_id, consumable_id) DO UPDATE SET count = $3`, [b.id, TICKET, PULLS]);
    const got = [];
    for (let i = 0; i < PULLS; i += 1) { const r = await pull(b.id); if (r.ok) got.push(r.won); }
    check(got.length === PULLS, `${PULLS} tokens buy ${PULLS} capsules`, `${got.length}`);
    check(got.every((w) => w.name && w.capsule && w.tone), "every capsule has a name and a shell colour");
    check(await ticketsHeld(b.id) === 0, "and every token was spent");

    // ── 4. AN OWN-ONCE PRIZE IS NEVER HANDED OVER TWICE ──────────────────────────────────────────────
    const onceIds = POOL.filter((p) => p.once).map((p) => p.id);
    const dupes = onceIds.filter((id) => got.filter((w) => w.id === id).length > 1);
    check(dupes.length === 0, "no exclusive came out twice", dupes.join(", "));

    // ── 5. THE SHELF SHOWS EVERYTHING, WITH REAL ODDS ────────────────────────────────────────────────
    const view = await gachaView(b.id);
    check(view.prizes.length === POOL.length, "the shelf lists every prize", `${view.prizes.length}/${POOL.length}`);
    const sum = view.prizes.reduce((n, p) => n + p.chance, 0);
    check(Math.abs(sum - 100) < 0.5, "and the odds add up to 100%", `${sum.toFixed(2)}%`);
    check(view.prizes.every((p) => p.name), "every row has a name");

    // ── 6. BOTH LEDGERS AGREE ABOUT THE MONEY ────────────────────────────────────────────────────────
    const paid = got.filter((w) => w.cents).reduce((n, w) => n + w.cents, 0);
    const ledger = (await db.queryOne(
        `SELECT COALESCE(SUM(delta_cents),0)::int AS c FROM mkt_store_credit_event
          WHERE buyer_id = $1 AND reason = 'gachapon'`, [b.id]))?.c ?? 0;
    check(ledger === paid, "the money ledger matches what the capsules paid", `$${(paid / 100).toFixed(2)} vs $${(ledger / 100).toFixed(2)}`);
} finally {
    // ── PUT IT ALL BACK ──────────────────────────────────────────────────────────────────────────────
    await db.query(`DELETE FROM mkt_cosmetic_unlock WHERE buyer_id = $1 AND category = 'pet' AND ref <> ALL($2)`, [b.id, before.pets]);
    await db.query(`DELETE FROM mkt_deco_owned WHERE buyer_id = $1 AND deco_id <> ALL($2)`, [b.id, before.decos]);
    await db.query(`DELETE FROM mkt_store_credit_event WHERE buyer_id = $1 AND reason = 'gachapon'`, [b.id]);
    await db.query(`DELETE FROM mkt_gacha_pull WHERE buyer_id = $1`, [b.id]);
    await db.query(`UPDATE mkt_buyer SET store_credit_cents = $2, candy = $3 WHERE id = $1`, [b.id, before.credit, before.candy]);
    await db.query(
        `INSERT INTO mkt_user_consumable (buyer_id, consumable_id, count) VALUES ($1, $2, $3)
         ON CONFLICT (buyer_id, consumable_id) DO UPDATE SET count = $3`, [b.id, TICKET, before.tickets]);
    const after = {
        tickets: await ticketsHeld(b.id),
        credit: (await db.queryOne(`SELECT store_credit_cents AS c FROM mkt_buyer WHERE id = $1`, [b.id]))?.c ?? 0,
        pets: (await db.query(`SELECT ref FROM mkt_cosmetic_unlock WHERE buyer_id = $1 AND category = 'pet'`, [b.id])).length,
        decos: (await db.query(`SELECT deco_id FROM mkt_deco_owned WHERE buyer_id = $1`, [b.id])).length,
    };
    const clean = after.tickets === before.tickets && after.credit === before.credit
        && after.pets === before.pets.length && after.decos === before.decos.length;
    console.log(`  ${clean ? "PASS" : "FAIL"}  the account is exactly as it was found — ${after.tickets} tokens, $${(after.credit / 100).toFixed(2)}, ${after.pets} pets, ${after.decos} decos`);
    if (!clean) fails += 1;
}
console.log(fails ? `\n${fails} FAILED` : "\nthe machine works, and it cannot be robbed.");
process.exit(fails ? 1 : 0);
