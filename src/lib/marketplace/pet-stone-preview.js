// ── WHAT EACH STONE WOULD ACTUALLY BUY, FOR THIS COLLECTION ──────────────────────────────────────────────────
// GrayKitsune, twice now:
//   "Lightstone Hydra and Signature ability Octopus conflict/count as the same boss strike? The text doesnt
//    mention cap 1 or I wouldn't have enshrined Hydra."
//   "I just enshrined my lion with a darkstone and saw no stat changes or increase in damage on boss page."
//
// ⚠️ HE WAS RIGHT BOTH TIMES AND NEITHER WAS A BUG. An ability takes the STRONGEST source it has, never the
// sum — that is deliberate, and it is what stops a duplicate pet being a penalty. But it means a stone can be
// bought, spent and permanent while changing no number in the game, and nothing said so beforehand. Measured
// against his real collection, the Lion Cub's Darkstone grafts Might while three pets he had already enshrined
// — Ironback, Bear Cub and Deep Golem — carry Might as their own ability and all beat it. The Lightstone would
// have given him First Blood, which nothing else of his supplies. He had no way to know.
//
// A warning that said "this might be covered" would be guesswork. The engine can simply be ASKED: run the real
// combinePetBonuses twice, once per stone, against the member's own pets and levels, and show the difference.
// Same function the boss fight uses, so the preview cannot drift from the payout.
import { COLLECTIBLES, collectibleById } from "@/lib/marketplace/collectibles.js";
import { combinePetBonuses } from "@/lib/marketplace/pet-perks.js";

// The handful of keys worth putting in front of somebody, with how to read them. Anything not named here is
// still counted as "something moved" — it just does not get a sentence.
const LABEL = {
    might: "Might", vitality: "Vitality", crit_chance: "Crit chance", crit_power: "Crit power",
    ferocity: "Ferocity", fortune: "Fortune", tenacity: "Tenacity", pierce: "Pierce",
    extra_strike: "Extra strike",
    firstHitMult: "First hit", firstBloodPct: "First blood", executePct: "Execute",
    bleedChance: "Bleed", bleedLeech: "Bleed leech", chainChance: "Chain strike",
    eruptChance: "Erupt", onslaughtPct: "Onslaught", extraStrikeChance: "Extra strike",
};

const round = (n) => Math.round(Number(n) * 100) / 100;

// ⚠️ A FALLBACK RATHER THAN A SECOND TABLE. There are system perk keys, economy keys and proc keys, and a
// hand-written label list for all of them is a copy that drifts the first time one is added — the raw key
// "farm_seed" showed up on the card the first time this rendered. Prettifying the key is always right and
// never goes stale; LABEL above is only for the ones whose key reads badly.
const pretty = (k) => String(k)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());

/** Flatten { stats, economy, proc, system } into one key→number map for comparison. */
function flatten(bonus) {
    const out = {};
    for (const group of ["stats", "economy", "proc", "system"]) {
        for (const [k, v] of Object.entries(bonus?.[group] || {})) out[k] = Number(v) || 0;
    }
    return out;
}

/**
 * What choosing each stone on `petId` changes, relative to choosing the other one.
 *
 * `enshrined` is the member's current list in getEnshrined's shape ({ petId, stone }); the pet object is
 * hydrated here so a caller cannot forget it — combinePetBonuses silently skips any entry without one, which
 * makes every enshrinement vanish and every comparison come back empty.
 *
 * Returns { light: [{ key, label, from, to, delta }], dark: [...] } — each list being what that stone gives
 * which the other does not. An empty list is the answer that matters: this stone changes nothing for you.
 */
export function compareStones({ petId, ownedIds = [], levelByPet = {}, enshrined = [], equippedId = null }) {
    const pet = collectibleById(petId);
    if (!pet) return { light: [], dark: [], ok: false };

    const ownedSet = new Set(ownedIds);
    const owned = COLLECTIBLES.filter((p) => ownedSet.has(p.id));
    const equipped = equippedId ? collectibleById(equippedId) : null;
    // Everything the member has enshrined EXCEPT this pet, hydrated the way the server hydrates it.
    const others = (enshrined || [])
        .filter((e) => e.petId !== petId)
        .map((e) => ({ petId: e.petId, stone: e.stone, pet: collectibleById(e.petId) }))
        .filter((e) => e.pet);

    const run = (stone) => flatten(combinePetBonuses(
        owned, equipped, levelByPet, [...others, { petId, stone, pet }], null, null,
    ));

    const light = run("light");
    const dark = run("dark");
    const keys = [...new Set([...Object.keys(light), ...Object.keys(dark)])];

    const gains = (a, b) => keys
        .filter((k) => round(a[k] ?? 0) > round(b[k] ?? 0))
        .map((k) => ({ key: k, label: LABEL[k] || pretty(k), from: round(b[k] ?? 0), to: round(a[k] ?? 0), delta: round((a[k] ?? 0) - (b[k] ?? 0)) }))
        .sort((x, y) => y.delta - x.delta);

    return { ok: true, light: gains(light, dark), dark: gains(dark, light) };
}
