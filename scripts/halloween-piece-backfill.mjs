// ── PAYING BACK FOUR DAYS OF HALLOWE'EN COLLECTION PIECES ────────────────────────────────────────────────────
// On 12 Oct the three Hallowe'en sets stopped being items and became trophies. Two reward paths did not come
// with them, and both failed the same silent way — the pool they drew from became an empty array, nothing
// threw, and the reward fell through:
//
//   THE OFFERING (spin.js)          read ownership off the GEAR BAG, so everybody read as owning none of the
//                                   five; granted with grantItem, which cannot write a trophy row. 72 rounds
//                                   played, 0 pieces granted. The Unquiet was the wheel's only source, so
//                                   the set was unobtainable while the sets page showed it.
//   THE HALLOWE'EN CHEST (chests.js) built its pool as ITEMS.filter(isHalloweenItem) — 0 items after the
//                                   migration — so the top rung fell through to the pet and the candy. 235
//                                   chests opened, 0 pieces out of any of them.
//
// WHAT THIS PAYS, and why it is a REPLAY rather than a flat grant. Both paths are rolls, and the members did
// not lose a certainty, they lost a chance at one. So every round and every chest open in the window is run
// again under the FIXED rules, paid through the game's own functions (grantPiece / addChests) and off the
// game's own numbers (HW_GEAR_CHANCE, dupeChestForMember), so the payout cannot drift from what the wheel
// and the chest now do:
//
//   Offering, set incomplete   1/3 of the board was the empty pumpkin and THAT slot paid its gold correctly
//                              even while broken — grantPrize was never the broken half. So one round in
//                              three is skipped as already-settled, and the other two pay a missing piece.
//   Offering, set complete     the fixed board is three chests, so every round pays one — the wheel's own
//                              top chest (gold, or mythic on the Golden Wheel), read from spin.js.
//   Hallowe'en chest           the gear rung is re-rolled at its own tier chance (12/20/28/40%) and pays an
//                              unowned piece when it lands. The lower rungs already paid at the time, so a
//                              hit here is strictly on top — the generous side of a four-day outage.
//
// DETERMINISTIC: every die is seeded off the activity/open row's own id, so the dry run prints exactly what
// --commit will do, and a re-run makes the same decisions. Idempotent on top of that: grantPiece is ON
// CONFLICT DO NOTHING, and --commit records a marker row per settled event so a second run pays nothing twice.
//
// Usage: node --import ./scripts/lib/register-loader.mjs scripts/halloween-piece-backfill.mjs
//        node --import ./scripts/lib/register-loader.mjs scripts/halloween-piece-backfill.mjs --commit
import fs from "node:fs";

const COMMIT = process.argv.includes("--commit");
process.env.DATABASE_URL = process.env.DATABASE_URL
    || fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8").match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!process.env.DATABASE_URL) throw new Error("No DATABASE_URL");

const { db } = await import("@/lib/db");
const { piecesOfSource } = await import("@/lib/marketplace/collection-pieces.js");
const { getOwnedPieceIds, grantPiece } = await import("@/lib/marketplace/collection-owned.js");
const { addChests, CHEST_TIERS, HW_GEAR_CHANCE } = await import("@/lib/marketplace/chests.js");
const { dupeChestForMember } = await import("@/lib/marketplace/spin.js");

// The moment the migration landed — the first instant either path could pay nothing. Taken from the
// mkt_user_collection rows it wrote, which all carry it.
const BREAK = "2026-10-13T03:48:01.889Z";
const UNQUIET = piecesOfSource("offering").map((p) => p.id);
const HW_CHEST_PIECES = piecesOfSource("hw_chest").map((p) => p.id);

// A seeded die, so the dry run and the commit run agree. mulberry32 off the row id.
const dieFor = (seed) => {
    let a = (Number(seed) >>> 0) + 0x6d2b79f5;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

// ── THE SETTLED-EVENT MARKER ─────────────────────────────────────────────────────────────────────────────────
// Without it a second --commit would re-roll every round, and the rolls that came up "piece" would grant a
// piece the member now owns — which grantPiece refuses, so they would be paid nothing and the script would
// report a payout that did not happen. The marker makes the question "has this round been settled" rather
// than "does this member own the piece".
if (COMMIT) await db.query(`
    CREATE TABLE IF NOT EXISTS mkt_piece_backfill (
        kind      text        NOT NULL,
        event_id  bigint      NOT NULL,
        buyer_id  uuid        NOT NULL,
        paid      text,
        settled_at timestamptz NOT NULL DEFAULT NOW(),
        PRIMARY KEY (kind, event_id)
    )`).catch((e) => { throw e; });

const settledRows = await db.query(`SELECT kind, event_id FROM mkt_piece_backfill`).catch(() => []);
const settled = new Set((settledRows || []).map((r) => `${r.kind}:${r.event_id}`));

const name = new Map();
for (const r of await db.query(`SELECT id, display_name FROM mkt_buyer`).catch(() => [])) {
    name.set(r.id, r.display_name || `(unnamed ${String(r.id).slice(0, 8)})`);
}

// Ownership is tracked in memory as we go, because a replay of eleven rounds must not grant the same piece
// eleven times — each round sees what the ones before it paid.
const ownedCache = new Map();
const ownedOf = async (buyerId) => {
    if (!ownedCache.has(buyerId)) {
        ownedCache.set(buyerId, new Set(await getOwnedPieceIds(buyerId, { includeLoan: false }).catch(() => [])));
    }
    return ownedCache.get(buyerId);
};
const chestCache = new Map();
const chestFor = async (buyerId) => {
    if (!chestCache.has(buyerId)) chestCache.set(buyerId, await dupeChestForMember(buyerId).catch(() => "gold"));
    return chestCache.get(buyerId);
};

const ledger = [];   // one line per settled event, for the report
const record = async (kind, id, buyerId, type, paid) => {
    ledger.push({ who: name.get(buyerId) || buyerId, kind, type, paid });
    if (COMMIT) {
        await db.query(`INSERT INTO mkt_piece_backfill (kind, event_id, buyer_id, paid) VALUES ($1, $2, $3, $4)
                        ON CONFLICT (kind, event_id) DO NOTHING`, [kind, id, buyerId, paid]).catch(() => {});
    }
};

// ── 1. THE OFFERING ──────────────────────────────────────────────────────────────────────────────────────────
// The round left no record of its own — pickEmChoose logged nothing, which is why it is reconstructed from the
// WEDGE label on the daily_spin event. (The fix adds spin_offering_win / spin_offering_dupe so the next one
// does not have to be.) A member who spun the wedge and never opened a pumpkin is paid anyway: the round was
// theirs, and the board it offered was wrong before they touched it.
const rounds = await db.query(`
    SELECT id, buyer_id, created_at FROM mkt_activity_event
     WHERE event = 'daily_spin' AND meta->>'prize' = 'THE OFFERING' AND created_at >= $1::timestamptz
     ORDER BY created_at, id`, [BREAK]).catch(() => []);

for (const r of rounds) {
    if (settled.has(`offering:${r.id}`)) continue;
    const owned = await ownedOf(r.buyer_id);
    const missing = UNQUIET.filter((id) => !owned.has(id));
    const die = dieFor(r.id);
    if (!missing.length) {
        const tier = await chestFor(r.buyer_id);
        if (COMMIT) await addChests(r.buyer_id, { [tier]: 1 }, { source: "offering_backfill", meta: { round: r.id } }).catch(() => {});
        await record("offering", r.id, r.buyer_id, "chest", CHEST_TIERS[tier]?.label || tier);
        continue;
    }
    // One slot in three was the empty pumpkin, and it paid at the time. Nothing owed for those.
    if (die() < 1 / 3) { await record("offering", r.id, r.buyer_id, "skip", "empty pumpkin — its gold was paid"); continue; }
    const pick = missing[Math.floor(die() * missing.length)];
    if (COMMIT) await grantPiece(r.buyer_id, pick, "offering_backfill").catch(() => {});
    owned.add(pick);
    await record("offering", r.id, r.buyer_id, "piece", pick);
}

// ── 2. THE HALLOWE'EN CHEST ──────────────────────────────────────────────────────────────────────────────────
// The rung's own chance, the rung's own pool, and grantPiece — which is the write rollPieceDrop performs. It
// is NOT rollPieceDrop itself, for one reason: that function picks from the pool with Math.random, so the dry
// run would print a different piece than --commit granted. The dice here are seeded off the open's row id.
const opens = await db.query(`
    SELECT id, buyer_id, tier, created_at FROM mkt_chest_open
     WHERE tier LIKE 'hw_%' AND created_at >= $1::timestamptz
     ORDER BY created_at, id`, [BREAK]).catch(() => []);

for (const o of opens) {
    if (settled.has(`hw_chest:${o.id}`)) continue;
    const die = dieFor(o.id + 7919); // a different stream from the Offering's, so ids cannot collide
    if (die() >= (HW_GEAR_CHANCE[o.tier] || 0)) continue; // the rung did not land; nothing was owed
    const owned = await ownedOf(o.buyer_id);
    const missing = HW_CHEST_PIECES.filter((id) => !owned.has(id));
    if (!missing.length) continue; // a finished collection falls through to the pet and the candy, as it does now
    const pick = missing[Math.floor(die() * missing.length)];
    if (COMMIT) await grantPiece(o.buyer_id, pick, "hw_chest_backfill").catch(() => {});
    owned.add(pick);
    await record("hw_chest", o.id, o.buyer_id, "piece", `${pick} (${o.tier.replace("hw_", "")})`);
}

// ── THE REPORT ───────────────────────────────────────────────────────────────────────────────────────────────
const by = new Map();
for (const l of ledger) {
    const row = by.get(l.who) || { pieces: [], chests: 0, tier: null, skipped: 0 };
    if (l.type === "skip") row.skipped += 1;
    else if (l.type === "chest") { row.chests += 1; row.tier = l.paid; }
    else row.pieces.push(l.paid.replace(/^hw_/, ""));
    by.set(l.who, row);
}
console.log(`\n── ${COMMIT ? "PAID" : "WOULD PAY"} — ${rounds.length} Offering rounds, ${opens.length} Hallowe'en chest opens since ${BREAK}\n`);
const who = [...by.entries()].sort((a, b) => (b[1].pieces.length + b[1].chests) - (a[1].pieces.length + a[1].chests));
for (const [person, row] of who) {
    const bits = [];
    if (row.pieces.length) bits.push(`${row.pieces.length} piece${row.pieces.length === 1 ? "" : "s"}: ${row.pieces.join(", ")}`);
    if (row.chests) bits.push(`${row.chests} x ${row.tier || "chest"}`);
    if (row.skipped) bits.push(`${row.skipped} already settled`);
    console.log(`  ${person.padEnd(20)} ${bits.join("  ·  ")}`);
}
const pieces = ledger.filter((l) => l.type === "piece").length;
const chests = ledger.filter((l) => l.type === "chest").length;
console.log(`\n  ${pieces} pieces, ${chests} chests, across ${by.size} members.`);
if (!COMMIT) console.log(`\n  DRY RUN — nothing granted. Re-run with --commit.\n`);
