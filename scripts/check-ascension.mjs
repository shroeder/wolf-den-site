// ── ARE ALL 196 STONE EFFECTS REAL? ──────────────────────────────────────────────────────────────────────────
// The Den's most common bug is an effect printed on a card that no code consumes. This feature adds 196 of them
// in one commit, so it needs a gate rather than a spot check.
//
// Five things it proves, and every one of them has already caught something:
//   1. Every pet has both stones authored — no pet quietly falling through to the dull fallback.
//   2. Every effect's ability key is one the engine actually knows.
//   3. Every effect CHANGES THE OUTPUT. This is the one that matters: a x2 that lands above a cap, or a graft
//      of an ability the pet already has, produces a card that reads well and pays nothing.
//   4. The two stones on a pet differ from each other. Two identical options is the bug we just removed.
//   5. Enshrined-and-equipped still does not double.
//
// Run:  node --experimental-loader ./scripts/lib/alias-loader.mjs scripts/check-ascension.mjs
import { combinePetBonuses, PET_PERKS, PERK_META, ascensionEffectView } from "../src/lib/marketplace/pet-perks.js";
import { ASCENSION_EFFECTS, effectFor } from "../src/lib/marketplace/pet-ascension-effects.js";
import { COLLECTIBLES } from "../src/lib/marketplace/collectibles.js";

const PETS = COLLECTIBLES.filter((c) => PET_PERKS[c.id]);
const flat = (b) => JSON.stringify([b.stats, b.economy, b.proc, b.system]);
let bad = 0;
const fail = (msg) => { bad += 1; console.log(`  FAIL  ${msg}`); };

console.log(`${PETS.length} pets, ${Object.keys(ASCENSION_EFFECTS).length} authored pairs.\n`);

// 1 — everybody is written.
for (const p of PETS) {
    if (!ASCENSION_EFFECTS[p.id]) fail(`${p.id} has no authored stones — it would fall back to the dull pair`);
}
for (const id of Object.keys(ASCENSION_EFFECTS)) {
    if (!PETS.some((p) => p.id === id)) fail(`${id} has stones authored but is not a pet`);
}

// 2 & 3 & 4 — the effects are known keys, they move the numbers, and they are not the same option twice.
let grafts = 0, amps = 0;
for (const p of PETS) {
    const lv = { [p.id]: 6 };
    const base = combinePetBonuses([p], null, lv, []);
    const seen = {};
    for (const stone of ["light", "dark"]) {
        const eff = effectFor(p.id, stone);
        if (eff.kind === "graft") {
            grafts += 1;
            if (!PERK_META[eff.key]) fail(`${p.id} ${stone} grafts "${eff.key}", which the engine has never heard of`);
            if (eff.key === (PET_PERKS[p.id] || {}).key) fail(`${p.id} ${stone} grafts the ability it already has`);
        } else {
            amps += 1;
        }
        const out = combinePetBonuses([p], null, lv, [{ petId: p.id, stone, pet: p }]);
        seen[stone] = flat(out);
        if (seen[stone] === flat(base)) fail(`${p.id} ${stone} (${eff.name}) changes NOTHING — capped away or dead`);
        const view = ascensionEffectView(p, stone);
        if (!view?.desc) fail(`${p.id} ${stone} has no description — the card would be blank`);
    }
    if (seen.light === seen.dark) fail(`${p.id}: both stones do exactly the same thing — that is not a choice`);
}

// 5 — the old promise still holds.
const eagle = PETS.find((p) => p.id === "eagle");
const boxed = combinePetBonuses([eagle], null, { eagle: 6 }, [{ petId: "eagle", stone: "dark", pet: eagle }]);
const carried = combinePetBonuses([eagle], eagle, { eagle: 6 }, [{ petId: "eagle", stone: "dark", pet: eagle }]);
if (flat(boxed) !== flat(carried)) fail("enshrined AND equipped is not the same as enshrined — it doubles again");

// And the aura really is gone: enshrining pets must not lift an unrelated pet's passive.
const pack = PETS.slice(0, 12);
const lv12 = Object.fromEntries(pack.map((p) => [p.id, 5]));
const noStones = combinePetBonuses(pack, null, lv12, []);
const fourLights = combinePetBonuses(pack, null, lv12, pack.slice(0, 4).map((p) => ({ petId: p.id, stone: "light", pet: p })));
if ((fourLights.system.seedLuck || 0) > (noStones.system.seedLuck || 0) * 1.001
    && !pack.slice(0, 4).some((p) => effectFor(p.id, "light").key === "seedLuck")) {
    fail("a pack-wide aura is still lifting passives — the Lightstone aura was supposed to be deleted");
}

console.log(`  ${amps} amplify, ${grafts} graft.`);
console.log(bad ? `\n${bad} problem(s).` : "\nEvery stone on every pet is authored, unique, and actually pays.");
process.exit(bad ? 1 : 0);
