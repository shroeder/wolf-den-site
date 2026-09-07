// ── EVERY QUESTION-MARK ROOM, EVERY PLATE ON IT, RESOLVED ────────────────────────────────────────────────
// The event table is data, which is exactly why it needs a test: a room is written in one file, the verbs it
// uses are implemented in another, and the two only meet when a player walks in. A misspelled effect key does
// not throw — it does nothing at all, silently, and the room pays out an empty sentence. A `fight` pointing at
// an encounter id that does not exist hands the fight screen a null and ends the run.
//
// So this walks in, presses every plate, and says what happened. It is the only thing standing between "the
// room is written" and "the room works".
//
//   node scripts/cards-rooms.mjs            every room, every choice
//   node scripts/cards-rooms.mjs --say      ...and print the sentences each one produced
import { EVENTS, applyEventChoice } from "../src/lib/marketplace/cards-events.js";
import { ENCOUNTERS, STARTER_DECK, cardById } from "../src/lib/marketplace/cards-kit.js";

const SAY = process.argv.includes("--say");
const encIds = new Set(Array.isArray(ENCOUNTERS) ? ENCOUNTERS.map((e) => e.id) : Object.keys(ENCOUNTERS));

// A hero with room to be healed, hurt, paid and robbed, and a deck long enough that burning is legal.
const fresh = () => ({
    seed: 12345, hp: 60, hpMax: 80, embers: 400,
    deck: [...STARTER_DECK, "wound", "bite", "hop"],
    perks: [], potions: [],
    at: { kind: "event", row: 3, used: [], said: [] },
});

let checked = 0;
const problems = [];
const note = (id, i, msg) => problems.push(`${id} [${i}] ${msg}`);

for (const ev of EVENTS) {
    if (!ev.id || !ev.name || !ev.say) { note(ev.id || "?", -1, "missing id, name or say"); continue; }
    if (!ev.choices?.length) { note(ev.id, -1, "no choices"); continue; }

    ev.choices.forEach((ch, i) => {
        checked += 1;
        if (!ch.label || !ch.detail) note(ev.id, i, "a plate with no label or no detail");
        const eff = ch.effect || {};

        // A fight has to point at a real encounter, or the room ends the run.
        if (eff.fight && !encIds.has(eff.fight)) note(ev.id, i, `fight "${eff.fight}" is not an encounter`);
        // A card has to be a real card, or the deck gets a hole in it.
        if (eff.card && !cardById(eff.card)) note(ev.id, i, `card "${eff.card}" does not exist`);
        for (const g of (eff.gamble || [])) {
            if (g.card && !cardById(g.card)) note(ev.id, i, `gamble card "${g.card}" does not exist`);
        }
        // Every key on the effect has to be one the applier reads. A typo is silent otherwise.
        const KNOWN = new Set(["hp", "hpPct", "maxHp", "embers", "potion", "perk", "maybePerk", "card",
            "upgrade", "upgradeAll", "remove", "copy", "transform", "cleanse", "fight", "wake", "gamble"]);
        for (const k of Object.keys(eff)) if (!KNOWN.has(k)) note(ev.id, i, `effect key "${k}" is not a verb`);

        // ── AND NOW ACTUALLY WALK IN ─────────────────────────────────────────────────────────────────
        const run = fresh();
        let out = applyEventChoice(run, ev, i, null);
        if (out?.error) { note(ev.id, i, `refused: ${out.error}`); return; }
        // The four that ask get answered with a card the deck really holds.
        if (out?.pending) {
            const pick = out.pending === "upgrade" ? "bite" : "wound";
            out = applyEventChoice(run, ev, i, pick);
            if (out?.error) note(ev.id, i, `refused after picking ${pick}: ${out.error}`);
        }
        if (!out?.error && !out?.fight && !(out?.said?.length) && Object.keys(eff).length) {
            note(ev.id, i, "did something and said nothing");
        }
        if (run.hp < 1) note(ev.id, i, `left the hero on ${run.hp} health`);
        if (run.hpMax < 10) note(ev.id, i, `left max health at ${run.hpMax}`);
        if ((run.embers || 0) < 0) note(ev.id, i, "left the purse negative");
        if (SAY) console.log(`  ${ev.id} [${i}] ${ch.label} -> ${(out?.said || []).join(" ") || (out?.fight ? "FIGHT" : "-")}`);
    });
}

const byAct = {};
for (const e of EVENTS) { const a = e.act || 0; byAct[a] = (byAct[a] || 0) + 1; }
console.log(`\n${EVENTS.length} rooms, ${checked} plates pressed.`);
console.log(`  anywhere ${byAct[0] || 0} · act one ${byAct[1] || 0} · act two ${byAct[2] || 0} · act three ${byAct[3] || 0}`);
for (const a of [1, 2, 3]) {
    console.log(`  an act ${a} question mark draws from ${EVENTS.filter((e) => !e.act || e.act === a).length}`);
}
if (problems.length) {
    console.log(`\n${problems.length} PROBLEMS:`);
    for (const p of problems) console.log("  " + p);
    process.exit(1);
}
console.log("\nevery plate in every room resolves.");
