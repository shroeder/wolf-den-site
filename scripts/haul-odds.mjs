// ── WHAT A RECEIPT ACTUALLY PAYS ─────────────────────────────────────────────────────────────────────────────
// Luke, looking at a real $180 scan that handed over gold, forge parts, doubloons and one chest: "a 190 dollar
// purchase should give multiple chests, a few generation tokens, a recipe, a couple pieces of gear, etc. Thats
// my expectation. You should make it random but what im describing should be the average."
//
// That is a statement about an AVERAGE, and an average is not something to argue about — it is something to
// measure. rollHaul takes an injectable rng for exactly this reason, so this runs the real table ten thousand
// times per receipt size and prints what a member gets per scan.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/haul-odds.mjs
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/haul-odds.mjs --at 180 --runs 40000
//
// ⚠️ IT REPORTS THE EMPTY-HANDED RATE TOO. The failure this table has actually shipped twice is not "too
// little on average" — it is a scan whose whole hand was currency, which reads as nothing because the purchase
// XP already paid gold. That number is the one to watch when the weights move.
import { readFileSync } from "node:fs";

import { POOL, SIZE, bandFor, rollHaul, rollsFor } from "@/lib/marketplace/patronage.js";

// ── --cards: THE OTHER HALF OF THE QUESTION ──────────────────────────────────────────────────────────────────
// The averages say WHAT a receipt pays. They say nothing about whether the screen can draw it, and the whole
// point of this pass was that it could not: nine kinds arriving as the same grey glyph. This mode rolls one
// real hand, runs it through dressHaul — the same resolver the live screen uses, no second copy of the rule —
// and prints the card each line would become, flagging any that fell back to a generic sprite.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/haul-odds.mjs --cards --at 180
//
// READ-ONLY. It dresses a hand that was never granted, so nothing is written and nobody is paid.
if (process.argv.includes("--cards")) {
    const env = readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
    for (const l of env.split(/\r?\n/)) {
        const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    const at = process.argv.includes("--at") ? Number(process.argv[process.argv.indexOf("--at") + 1]) : 180;
    const { dressHaul } = await import("@/lib/marketplace/patronage-store.js");
    const { ITEMS } = await import("@/lib/marketplace/items.js");
    const { RECIPES } = await import("@/lib/marketplace/cooking.js");
    const { SEEDS } = await import("@/lib/marketplace/farm-crops.js");
    const { hand } = rollHaul(at);
    // payHaul's shape, without granting: the fields dressHaul reads are the ones the grants fill in.
    const paid = hand.map((x) => {
        if (x.kind === "gear") {
            const it = ITEMS.find((i) => i.rarity === x.rarity && !i.charged) || {};
            return { ...x, id: it.id, name: it.name, slot: it.slot || null, icon: it.icon || null, isNew: true };
        }
        if (x.kind === "recipe") {
            const r = RECIPES.find((v) => v.tier >= 2) || {};
            return { kind: "recipe", id: r.id, name: r.name, tier: r.tier || 2 };
        }
        if (x.kind === "seed" || x.kind === "crop") {
            const ids = Object.keys(SEEDS);
            const id = ids[Math.floor(Math.random() * ids.length)];
            return { ...x, id, name: SEEDS[id].name, rarity: SEEDS[id].rarity };
        }
        return x;
    });
    const cards = await dressHaul(paid);
    console.log(`
one rolled $${at} hand, as the screen would draw it:
`);
    let generic = 0;
    for (const c of cards) {
        const art = c.sprite ? "art" : (c.kind === "chest" ? "ChestIcon" : "GENERIC");
        if (!c.sprite && c.kind !== "chest") generic += 1;
        console.log(`  ${String(c.n && c.n > 1 ? "x" + c.n : "").padStart(5)} ${String(c.name).padEnd(26)} ${String(c.rarity).padEnd(10)} ${art.padEnd(10)} ${String(c.sprite || c.fallback || "").slice(0, 72)}`);
    }
    console.log(generic ? `
⚠️  ${generic} card(s) fell back to a generic sprite.` : "\nevery card has its own artwork.");
    process.exit(0);
}

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? Number(process.argv[i + 1]) : d; };
const RUNS = arg("--runs", 20000);
const ONE = process.argv.includes("--at") ? arg("--at", 180) : null;
const SIZES = ONE ? [ONE] : [11, 30, 60, 100, 180, 250, 400, 1000];

// Every kind the table can pay, in the order a member reads them.
const KINDS = ["chest", "gear", "token", "recipe", "seed", "crop", "parts", "doubloons", "gold"];

function run(dollars) {
    const tally = Object.fromEntries(KINDS.map((k) => [k, 0]));
    const amount = Object.fromEntries(KINDS.map((k) => [k, 0]));
    let currencyOnly = 0, lines = 0;
    for (let i = 0; i < RUNS; i += 1) {
        const { hand } = rollHaul(dollars);
        lines += hand.length;
        let named = 0;
        for (const x of hand) {
            // A merged line carries its own count for currency; a named thing is one line per pull, except
            // seeds and crops which stack. Count PULLS, not lines, or a 10-roll hand reads as four things.
            const pulls = (x.kind === "gold" || x.kind === "doubloons" || x.kind === "parts") ? 1 : 1;
            tally[x.kind] = (tally[x.kind] || 0) + pulls;
            amount[x.kind] = (amount[x.kind] || 0) + (x.n || 1);
            if (!["gold", "doubloons", "parts"].includes(x.kind)) named += 1;
        }
        if (named === 0) currencyOnly += 1;
    }
    return { tally, amount, currencyOnly: currencyOnly / RUNS, lines: lines / RUNS };
}

const pad = (s, n) => String(s).padStart(n);
console.log(`\n${RUNS.toLocaleString()} simulated scans per receipt size\n`);
console.log(pad("$", 6), pad("band", 7), pad("rolls", 6), "  ", KINDS.map((k) => pad(k, 9)).join(""), pad("nothing-but-coin", 18));
console.log("-".repeat(6 + 7 + 6 + 2 + KINDS.length * 9 + 18));
for (const d of SIZES) {
    const r = run(d);
    const cells = KINDS.map((k) => {
        const per = r.tally[k] / RUNS;
        // For currency the interesting number is the pile, not how many times it was rolled.
        if (k === "gold" || k === "doubloons") return pad(Math.round(r.amount[k] / RUNS), 9);
        if (k === "parts") return pad((r.amount[k] / RUNS).toFixed(1), 9);
        // ⚠️ CHESTS AND CREATIONS MERGE BY TIER, so a hand holding three gold chests is ONE line with n=3.
        // Counting lines here reported 1.7 chests for a receipt that pays 3.4 of them — the simulator was
        // measuring the screen rather than the payout.
        if (k === "chest" || k === "token") return pad((r.amount[k] / RUNS).toFixed(2), 9);
        return pad(per.toFixed(2), 9);
    });
    console.log(pad(d, 6), pad(bandFor(d), 7), pad(rollsFor(d), 6), "  ", cells.join(""), pad(`${(r.currencyOnly * 100).toFixed(1)}%`, 18));
}

console.log("\ngold and doubloons are the PILE per scan; parts is parts per scan; everything else is how many.");
console.log("the weights being measured:");
for (const b of Object.keys(POOL)) {
    console.log(" ", pad(b, 7), Object.entries(POOL[b]).map(([k, v]) => `${k} ${v}`).join("  "));
}
console.log("\nsizes:");
for (const b of Object.keys(SIZE)) console.log(" ", pad(b, 7), JSON.stringify(SIZE[b]));
