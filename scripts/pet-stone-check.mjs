// ── EVERY STONE ON EVERY PET, AND WHETHER IT DOES ANYTHING ───────────────────────────────────────────────────
// Eric D, in the bugs channel: "the new pets that have come out in the last few weeks don't have sprites for
// their enshrinements. Also the abilities are the exact same with the darkstone usually being the more
// powerful." Seven pets had no authored pair at all and fell through to FALLBACK_EFFECT — light: amplify x1,
// which is nothing, and dark: amplify x1.5, which is the same ability slightly bigger. On the Doorward's Moth
// both stones printed the identical sentence, because chest_luck was already at its ceiling.
//
// Enshrining is IRREVERSIBLE and costs 4,000 doubloons, so a stone that does nothing is not a cosmetic fault.
// This is the sweep that says so in one line per pet:
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/pet-stone-check.mjs
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/pet-stone-check.mjs --all
//
// ⚠️ IT IS A REPORTER, NOT A GATE. There are four gates left on purpose and this is not a fifth — run it when
// a pet is added or a cap moves, which are the two things that can break a pair.
//
// FOUR FAULTS, and every one of them has shipped:
//   NOT AUTHORED   the pet is not in ASCENSION_EFFECTS, so it gets the fallback
//   SAME KEY       both stones move the same number, so the choice is "more" or "less" of one thing
//   DEAD STONE     the ability is already at its ceiling, so the stone changes no number in the game
//   BROKEN LINE    the generated sentence contains NaN or undefined (see the erupt object in petPerkAt)
//   NARROW LIGHT   the Lightstone pays in ONE feature while the Darkstone pays everywhere
//   THIN LIGHT     the Lightstone's graft gains less than the Darkstone's amplify does
//
// The last two are Luke's, off the Wolf Pup's card: "Feels like the light evolution is way worse." It was, on
// a third of the roster and in two separate ways — a narrower ability AND a smaller helping of it. Both are
// measured here rather than judged by eye, because "way worse" is a number.
import { COLLECTIBLES } from "@/lib/marketplace/collectibles.js";
import { ASCENSION_EFFECTS } from "@/lib/marketplace/pet-ascension-effects.js";
import { PET_PERKS, ascensionEffectView } from "@/lib/marketplace/pet-perks.js";

// An ability that pays in most of what you do, against one that pays inside a single feature.
const BROAD = new Set([
    "might", "crit_chance", "crit_power", "ferocity", "tenacity", "pierce", "fortune", "extra_strike",
    "first_hit", "erupt", "chain_strike", "execute", "onslaught", "first_blood", "xp_gain", "gold_find",
    "chest_luck",
]);

const ALL = process.argv.includes("--all");
const faults = [];

for (const pet of COLLECTIBLES) {
    const authored = ASCENSION_EFFECTS[pet.id] || null;
    const own = (PET_PERKS[pet.id] || {}).key || pet.activeStat || "fortune";
    const L = ascensionEffectView(pet, "light");
    const D = ascensionEffectView(pet, "dark");
    const bad = [];

    if (!authored) bad.push("NOT AUTHORED — falls through to the fallback pair");

    if (authored) {
        const keyOf = (e) => (e.kind === "graft" ? e.key : own);
        if (keyOf(authored.light) === keyOf(authored.dark)) {
            bad.push(`SAME KEY — both stones move ${keyOf(authored.light)}`);
        }
    }

    // A stone is DEAD when the sentence it produces is the sentence the pet already had. ascensionEffectView
    // generates from the real value after the real cap, so comparing the two strings is comparing the numbers.
    const base = ascensionEffectView(pet, null);
    for (const [name, view] of [["light", L], ["dark", D]]) {
        if (base && view && base.desc && view.desc === base.desc) bad.push(`DEAD ${name} — changes no number`);
        if (/NaN|undefined/.test(String(view?.desc || ""))) bad.push(`BROKEN ${name} — "${view.desc}"`);
    }
    if (L && D && L.desc === D.desc) bad.push("IDENTICAL — the two stones print the same sentence");

    // ── AND THE TWO STONES HAVE TO BE WORTH COMPARING ────────────────────────────────────────────────────
    // BROAD is an ability that pays in most of what you do; everything else is one feature's worth. A stone
    // that only helps at the plaza is not a real answer to one that helps everywhere, whatever the number on
    // it says — and it was the Lightstone every time, because light is a graft and dark an amplify on 77 of
    // the 130. There is not one pet where it is the other way round.
    if (authored) {
        const lk = authored.light.kind === "graft" ? authored.light.key : own;
        const dk = authored.dark.kind === "graft" ? authored.dark.key : own;
        if (!BROAD.has(lk) && BROAD.has(dk)) bad.push(`NARROW LIGHT — ${lk} is one feature, ${dk} is everywhere`);
        // An amplify of x2 adds one whole helping of the pet's own ability, so a graft offered against it has
        // to add one whole helping of the other one. Anything less is the same decision at a discount.
        if (authored.light.kind === "graft" && authored.dark.kind === "amplify") {
            const want = Math.round((authored.dark.mult - 1) * 10) / 10;
            if (authored.light.scale < want - 1e-9) {
                bad.push(`THIN LIGHT — grafts at ${authored.light.scale} against an amplify of x${authored.dark.mult} (wants ${want})`);
            }
        }
    }

    if (bad.length) faults.push({ pet, bad, L, D });
    if (ALL && !bad.length) console.log(`ok   ${pet.id.padEnd(18)} ${pet.rarity.padEnd(10)} L:${L?.name} · D:${D?.name}`);
}

console.log();
if (!faults.length) {
    console.log(`all ${COLLECTIBLES.length} pets: both stones authored, both move a different number,
  neither is dead, and neither Lightstone is narrower or thinner than the Darkstone it is offered against.`);
} else {
    for (const f of faults) {
        console.log(`⚠️  ${f.pet.id}  (${f.pet.rarity})`);
        for (const b of f.bad) console.log(`      ${b}`);
        console.log(`      light: ${f.L?.name} — ${f.L?.desc}`);
        console.log(`      dark : ${f.D?.name} — ${f.D?.desc}`);
    }
    console.log(`\n${faults.length} of ${COLLECTIBLES.length} pets have a stone problem.`);
}
process.exit(0);
