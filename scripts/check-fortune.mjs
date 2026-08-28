// ── CHECK:FORTUNE ────────────────────────────────────────────────────────────────────────────────────────────
// Fortune spent its whole existence describing something the code did not do. It was raffle tickets on sixteen
// item cards, on the pet cards, in the farm recap and in the stat glossary — and `boss.js` read the stat from
// the pet pack alone, so gear Fortune bought nothing, entered no draw and moved no number. Nobody noticed for
// as long as the stat existed, because there was nothing to notice: a wrong drop rate looks exactly like an
// unlucky week.
//
// That is the failure this gate is written against. It cannot prove a member got luckier, so it checks the two
// things that CAN be checked mechanically:
//
//   1. the curve keeps its promises   — bounded, monotonic, and worth nothing at zero
//   2. every feature is still wired   — the list below is the whole surface of "drop rates everywhere", and a
//                                       feature dropping off it is silent in every other way
//
//   node scripts/check-fortune.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FORTUNE_CEILING, FORTUNE_HALF, fortuneLuck, luckyChance, luckyRoll } from "../src/lib/marketplace/fortune.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fail = [];
const ok = (msg) => console.log(`  ok    ${msg}`);
const bad = (msg) => { fail.push(msg); console.log(`  FAIL  ${msg}`); };

// ── 1. THE CURVE ─────────────────────────────────────────────────────────────────────────────────────────────
console.log("the curve");
if (fortuneLuck(0) === 0) ok("no Fortune is worth no luck"); else bad(`fortuneLuck(0) = ${fortuneLuck(0)}, must be 0`);
if (Math.abs(fortuneLuck(FORTUNE_HALF) - FORTUNE_CEILING / 2) < 1e-9) ok(`FORTUNE_HALF (${FORTUNE_HALF}) is worth half the ceiling`);
else bad(`fortuneLuck(FORTUNE_HALF) = ${fortuneLuck(FORTUNE_HALF)}, expected ${FORTUNE_CEILING / 2}`);

let monotonic = true;
for (let f = 0; f < 2000; f += 1) if (fortuneLuck(f + 1) < fortuneLuck(f)) monotonic = false;
if (monotonic) ok("more Fortune is never worth less luck"); else bad("fortuneLuck is not monotonic");

// The ceiling is the whole safety argument: no build, at any total, is ever twice as lucky as a bare one.
if (fortuneLuck(1e9) < FORTUNE_CEILING) ok(`saturates below the ceiling (${FORTUNE_CEILING}) — no total ever reaches it`);
else bad("fortuneLuck reaches or passes its ceiling");
if (fortuneLuck(-50) === 0) ok("a negative total is worth nothing, not a penalty"); else bad("negative Fortune is not clamped");

// ── 2. DROP CHANCES ──────────────────────────────────────────────────────────────────────────────────────────
console.log("\ndrop chances");
if (luckyChance(0.05, 0) === 0.05) ok("no Fortune leaves a chance exactly as it was"); else bad("luckyChance moves a chance at 0 Fortune");
if (luckyChance(0, 500) === 0) ok("luck cannot conjure a drop from a zero chance"); else bad("luckyChance pays out on an impossible roll");
if (luckyChance(1, 500) === 1) ok("a certainty stays a certainty"); else bad("luckyChance pushes a certainty past 1");
let capped = true;
for (const p of [0.7, 0.8, 0.9, 0.99]) if (luckyChance(p, 1e9) > 1) capped = false;
if (capped) ok("no chance is ever pushed above 1"); else bad("luckyChance returns a probability above 1");
// The proportion is the point — it is why one line of code works on a 0.05% pet and a 35% curio alike.
const prop = luckyChance(0.0011, 120) / 0.0011;
if (Math.abs(prop - luckyChance(0.35, 120) / 0.35) < 1e-9) ok(`worth the same proportion at every rate (x${prop.toFixed(3)} at 120 Fortune)`);
else bad("luckyChance is worth a different proportion to rare and common rolls");

// ── 3. DAMAGE ROLLS ──────────────────────────────────────────────────────────────────────────────────────────
// The one rule that matters here: luck must never raise the CEILING. A stat that quietly lifted the top of the
// band would be a damage bonus wearing a luck label, and every number balanced against the top of that band
// would be wrong by an amount nobody could see.
console.log("\ndamage rolls");
const SPREAD = 0.15;
const sample = (fortune, n = 200000) => {
    let lo = Infinity, hi = -Infinity, sum = 0;
    for (let i = 0; i < n; i += 1) { const r = luckyRoll(Math.random, SPREAD, fortune); lo = Math.min(lo, r); hi = Math.max(hi, r); sum += r; }
    return { lo, hi, mean: sum / n };
};
const bare = sample(0);
const lucky = sample(120);
if (bare.hi <= 1 + SPREAD + 1e-6 && lucky.hi <= 1 + SPREAD + 1e-6) ok(`the ceiling is ${(1 + SPREAD).toFixed(2)} at 0 Fortune and at 120`);
else bad(`luck raised the ceiling: ${bare.hi.toFixed(4)} -> ${lucky.hi.toFixed(4)}`);
if (lucky.lo > bare.lo) ok(`the floor comes up: ${bare.lo.toFixed(3)} -> ${lucky.lo.toFixed(3)}`);
else bad("luck did not lift the floor of the damage roll");
if (Math.abs(bare.mean - 1) < 0.005) ok("a fighter with no Fortune still averages exactly their damage");
else bad(`0 Fortune skews the average to ${bare.mean.toFixed(4)}`);
const gain = (lucky.mean - 1) * 100;
if (gain > 0 && gain < 5) ok(`120 Fortune is worth +${gain.toFixed(2)}% average damage — texture, not a stat check`);
else bad(`120 Fortune moves average damage by ${gain.toFixed(2)}%, which is out of the intended band`);
if (luckyRoll(Math.random, 0, 500) === 1) ok("a spread of 0 draws no roll at all"); else bad("luckyRoll varies when the spread is 0");

// ── 4. EVERY FEATURE IS STILL WIRED ──────────────────────────────────────────────────────────────────────────
// "Better drop rates everywhere" is a promise printed on every item that rolls the stat, and the only way it
// stays true is if this list does. A feature that stops importing the module has stopped paying Fortune, and
// nothing else in the build will say so.
console.log("\nthe features Fortune reaches");
const WIRED = {
    "chests.js": "chest contents — recipe, seed, pet, gem, scroll, relic",
    "delves.js": "the kill table, dungeon gear, and the chest room",
    "pet-drops.js": "pets off a chest, a boss, a raid and a sea fight",
    "fishing.js": "treasure on the line",
    "mining.js": "the seam bonus and the smelter's curios",
    "sailing.js": "the gold merchant, and the lure's second chest",
    "farm.js": "what the Loot Pig is carrying",
    "crafting.js": "a Regalia piece off a salvage",
    "boss.js": "the damage roll on your daily strike",
    "arena-engine.js": "the damage roll on every swing in the ring",
};
for (const [file, what] of Object.entries(WIRED)) {
    const src = fs.readFileSync(path.join(ROOT, "src/lib/marketplace", file), "utf8");
    if (/from "@\/lib\/marketplace\/fortune(-server)?\.js"/.test(src)) ok(`${file.padEnd(18)} ${what}`);
    else bad(`${file} no longer reads Fortune — ${what} has stopped paying it`);
}

// ── 5. AND NOTHING STILL SELLS THE OLD MEANING ───────────────────────────────────────────────────────────────
// The stat was raffle tickets for its whole life and the copy outlived the code once already. Any surface that
// still says so is a card lying about a rule, which is the defect this whole rewire exists to end.
console.log("\nthe old promise is gone");
const walk = (dir, out = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.jsx?$/.test(e.name)) out.push(p);
    }
    return out;
};
const offenders = [];
for (const file of walk(path.join(ROOT, "src"))) {
    if (/fortune\.js$|fortune-server\.js$/.test(file)) continue;
    const src = fs.readFileSync(file, "utf8");
    for (const [i, line] of src.split(/\r?\n/).entries()) {
        if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) continue; // history, not copy
        if (/fortune/i.test(line) && /raffle|ticket/i.test(line)) offenders.push(`${path.relative(ROOT, file)}:${i + 1}`);
    }
}
if (!offenders.length) ok("no screen still tells a member Fortune buys raffle tickets");
else bad(`Fortune still sold as raffle tickets in: ${offenders.join(", ")}`);

console.log("");
if (fail.length) { console.log(`check:fortune — ${fail.length} FAILED`); process.exit(1); }
console.log("check:fortune — the curve is bounded, the ceiling is untouched, and all ten features still pay it.");
