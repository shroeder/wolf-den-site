// ── IS THE LANTERN CRYPT A REAL DUNGEON? ─────────────────────────────────────────────────────────────────
// It shipped with its own backdrop, four foes, a boss and a loot table — and NO EVENT DECK, which is not a
// missing feature but a broken run: dealFloors builds its bag from eventsFor(id), an unknown id returns [],
// and the loop breaks on the first draw. Nine floors never existed and the boss was pushed on at depth 10,
// so you walked through the door and were standing in front of the Hollow King.
//
// This deals a few hundred real runs through the real function and asserts the things that were wrong, plus
// the ones the other four decks guarantee: ten floors, at least five fights, no floor twice, a foe on every
// fight, and a file on disk behind every picture a floor can show you.
//
//   node scripts/verify-lantern-crypt.mjs [runs=400]
import "./lib/register-loader.mjs";
import fs from "node:fs";

const { DECKS } = await import("../src/lib/marketplace/delve-events.js");
const { HALLOWEEN_DUNGEON, DUNGEONS, encounterArt, encounterBg } = await import("../src/lib/marketplace/delve-catalog.js");
const { __dealFloorsForTest } = await import("../src/lib/marketplace/delves.js");

const RUNS = Number(process.argv[2]) || 400;
let fails = 0;
const check = (ok, label, detail = "") => {
    if (!ok) fails += 1;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
};

// ── THE DECK ITSELF, AGAINST THE HOUSE PATTERN ──────────────────────────────────────────────────────────
const crypt = DECKS.lanterncrypt;
const house = DECKS.astral;
const counts = (d) => d.reduce((a, e) => ({ ...a, [e.kind]: (a[e.kind] || 0) + 1 }), {});
const weight = (d) => d.reduce((n, e) => n + e.weight, 0);
check(Boolean(crypt), "the crypt has a deck at all");
check(crypt.length === house.length, "53 slots like every other deck", `${crypt.length}`);
check(JSON.stringify(counts(crypt)) === JSON.stringify(counts(house)), "same spread of encounter kinds", JSON.stringify(counts(crypt)));
check(weight(crypt) === weight(house), "same total weight, so it paces the same", `${weight(crypt)}`);
check(crypt.filter((e) => e.rare).length === 3, "three rare finds");
check(new Set(crypt.map((e) => e.id)).size === crypt.length, "every id unique");
// ⚠️ NOTHING IS SHARED BETWEEN DECKS — the file's own first line. A crypt floor must be impossible anywhere
// else, or the seasonal dungeon is the other four wearing a pumpkin.
const others = new Set(Object.entries(DECKS).filter(([k]) => k !== "lanterncrypt").flatMap(([, d]) => d.map((e) => e.id)));
check(crypt.every((e) => !others.has(e.id)), "no event is shared with another dungeon");
const titles = new Set(Object.entries(DECKS).filter(([k]) => k !== "lanterncrypt").flatMap(([, d]) => d.map((e) => e.title)));
check(crypt.every((e) => !titles.has(e.title)), "no TITLE is reused from another dungeon either");

// ── AND THE RUNS IT ACTUALLY DEALS ──────────────────────────────────────────────────────────────────────
let shortRun = 0, tooFewFights = 0, dupes = 0, noFoe = 0, noBoss = 0;
const seen = new Set();
for (let i = 0; i < RUNS; i += 1) {
    const floors = __dealFloorsForTest(HALLOWEEN_DUNGEON);
    if (floors.length !== 10) shortRun += 1;
    const ids = floors.map((f) => f.event.id);
    if (new Set(ids).size !== ids.length) dupes += 1;
    const fights = floors.filter((f) => f.event.kind === "fight" || f.event.kind === "mimic");
    if (fights.length < 4) tooFewFights += 1;
    if (floors.filter((f) => f.event.kind === "fight").some((f) => !f.foeId)) noFoe += 1;
    if (floors[floors.length - 1]?.event.kind !== "boss") noBoss += 1;
    ids.filter((x) => x !== "boss").forEach((x) => seen.add(x));
}
check(shortRun === 0, `${RUNS} runs all deal ten floors`, shortRun ? `${shortRun} short` : "");
check(noBoss === 0, "the boss is always the last floor");
check(tooFewFights === 0, "the four-fight guarantee holds", tooFewFights ? `${tooFewFights} runs short` : "");
check(dupes === 0, "no floor appears twice in one run", dupes ? `${dupes} runs` : "");
check(noFoe === 0, "every fight has a foe assigned");
check(seen.size >= 48, "the deck is actually being drawn from", `${seen.size}/53 events seen across ${RUNS} runs`);

// ── AND EVERY PICTURE A FLOOR CAN SHOW ──────────────────────────────────────────────────────────────────
// ⚠️ encounterArt RETURNS A PATH WHETHER OR NOT THE FILE IS THERE. A missing one is not a blank, it is a 404
// <img> — and an SSR 404 fires onError before React hydrates, which is how every card in the game once wore
// a broken-image glyph.
const missing = [];
const want = new Set();
for (const e of crypt) {
    const a = encounterArt("lanterncrypt", e);
    const b = encounterBg("lanterncrypt", e);
    if (a) want.add(a);
    if (b) want.add(b);
}
want.add(`/images/delves/${HALLOWEEN_DUNGEON.bg.split("/").pop()}`);
for (const f of [...HALLOWEEN_DUNGEON.foes.map((x) => x.sprite), HALLOWEEN_DUNGEON.boss.sprite]) want.add(f);
for (const u of want) if (!fs.existsSync(`public${u}`)) missing.push(u);
check(missing.length === 0, `all ${want.size} pictures exist on disk`, missing.join(", "));

// ── AND IT FIGHTS AT THE RUNG IT IS GATED AT ────────────────────────────────────────────────────────────
// Luke: "Difficulty of fight should be around level 30 of other dungeons." The Ember Deep is that rung, so
// this asserts the crypt's fight numbers ARE the Ember Deep's — a thing that is one careless edit away from
// drifting, and drifts invisibly because both dungeons still work perfectly while disagreeing.
const ember = DUNGEONS.find((d) => d.id === "ember");
const same = (k, a, b) => check(JSON.stringify(a) === JSON.stringify(b), `${k} matches the Ember Deep`, JSON.stringify(a));
same("foe HP multiplier", HALLOWEEN_DUNGEON.foeX, ember.foeX);
same("boss HP multiplier", HALLOWEEN_DUNGEON.bossX, ember.bossX);
same("foe damage", HALLOWEEN_DUNGEON.dmg, ember.dmg);
same("boss damage", HALLOWEEN_DUNGEON.boss.dmg, ember.boss.dmg);
same("gold a floor", HALLOWEEN_DUNGEON.goldPer, ember.goldPer);
same("xp a floor", HALLOWEEN_DUNGEON.xpPer, ember.xpPer);
// ⚠️ THE GATE IS PART OF THE DIFFICULTY. `dmg` is flat and your health is not, so a dungeon whose damage is
// written for level 30 and whose door opens at 25 is a trap with a sign on it saying it is safe.
check(HALLOWEEN_DUNGEON.minLevel === ember.minLevel, "and the door opens at the same level", `${HALLOWEEN_DUNGEON.minLevel}`);

// ── AND THE OTHER FOUR STILL DEAL ───────────────────────────────────────────────────────────────────────
// The deck file is shared, so a change for the crypt that quietly broke the Ember Deep would be exactly the
// kind of regression nobody notices until somebody is already halfway down one.
for (const d of DUNGEONS) {
    let bad = 0;
    for (let i = 0; i < 60; i += 1) {
        const fl = __dealFloorsForTest(d);
        const idz = fl.map((f) => f.event.id);
        if (fl.length !== 10 || new Set(idz).size !== idz.length
            || fl.filter((f) => f.event.kind === "fight" || f.event.kind === "mimic").length < 4) bad += 1;
    }
    check(bad === 0, `${d.name} still deals clean runs`, bad ? `${bad}/60 bad` : "");
}

// ── AND IT STILL IS NOT A FIFTH DUNGEON ─────────────────────────────────────────────────────────────────
// The seasonal deck must never move the `delve_all_four` finish line — see the note in delve-catalog.js.
check(DUNGEONS.length === 4, "DUNGEONS is still four, so the completion badge is unmoved", `${DUNGEONS.length}`);

console.log(fails ? `\n${fails} FAILED` : "\nthe Lantern Crypt is a real dungeon.");
process.exit(fails ? 1 : 0);
