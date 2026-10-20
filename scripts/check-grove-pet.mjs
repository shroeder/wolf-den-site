// ── THE PET'S BITE, ASSERTED IN BARE NODE ────────────────────────────────────────────────────────────────────
// Luke: "I want the pet that you have equipped to matter in the grove, like its level, its rarity. I want it
// to attack, and I want it to do like the associated kind of damage that reflects its rarity and level."
//
// Everything that decides HOW HARD is pure arithmetic over two inputs, and none of it is visible in a
// screenshot: a pet biting for 4% instead of 39% films exactly like a pet biting correctly, just with smaller
// green numbers nobody has a reference for. The failure mode this file exists for is the one this repo keeps
// paying for — a rarity lookup that falls back DOWNWARD and silently pays a top-tier companion common rates
// (see [[rarity-tables-stop-at-eternal]], [[ladder-lookups-must-fail-upward]]).
//
//   node scripts/check-grove-pet.mjs        (or npm run check:grove-pet)
import {
    petBiteShare, petBite, petBiteCd, PET_BITE_BY_RARITY, PET_BITE_MIN_MS, PET_BITE_EVERY,
    PET_BITE_MAX_LEVEL, swing,
} from "../src/lib/marketplace/grove-world.js";
import { pouncePose, POUNCE, POUNCE_TOTAL_MS, SWING_TOTAL_MS } from "../src/lib/marketplace/grove-juice.js";
import { COLLECTIBLES } from "../src/lib/marketplace/collectibles.js";
import { GROVE_ZONES, GROVE_ENEMIES, scaledFoe } from "../src/lib/marketplace/grove-catalog.js";

let fails = 0;
const ok = (name, cond, extra = "") => {
    if (cond) console.log(`  ok   ${name}`);
    else { console.log(`  FAIL ${name} ${extra}`); fails += 1; }
};
const mulberry = (s) => () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const TIERS = ["common", "rare", "epic", "legendary", "mythic", "ascendant", "eternal", "celestial", "primordial"];

console.log("\nTHE RARITY TABLE");
// ⚠️ THE ONE THAT MATTERS. Every rarity the game can mint must be in the table, including the two no pet
// carries yet — a table that stops at the highest rarity currently in use is the bug, every time.
for (const t of TIERS) ok(`${t} is in the table`, typeof PET_BITE_BY_RARITY[t] === "number");
// And nothing in the actual pet roster may be missing from it, which is the live version of the same check.
const used = [...new Set(COLLECTIBLES.map((p) => p.rarity).filter(Boolean))];
for (const r of used) ok(`a pet of rarity "${r}" exists and the table knows it`, typeof PET_BITE_BY_RARITY[r] === "number");

console.log("\nIT FAILS UPWARD");
// A rarity this file has never heard of is far likelier to be a tier added ABOVE the top than a new kind of
// common, so an unknown must never pay less than the highest known tier.
ok("an unknown rarity pays the top of the ladder",
    petBiteShare("transcendent", 1) === PET_BITE_BY_RARITY.primordial,
    `got ${petBiteShare("transcendent", 1)}`);
ok("an unknown rarity never pays common", petBiteShare("transcendent", 1) > petBiteShare("common", 6));
ok("rarity is case-insensitive", petBiteShare("Eternal", 1) === petBiteShare("eternal", 1));

console.log("\nIT CLIMBS, AND IT CLIMBS BOTH WAYS");
for (let i = 1; i < TIERS.length; i += 1) {
    ok(`${TIERS[i]} bites harder than ${TIERS[i - 1]}`, petBiteShare(TIERS[i], 1) > petBiteShare(TIERS[i - 1], 1));
}
for (let lv = 2; lv <= PET_BITE_MAX_LEVEL; lv += 1) {
    ok(`Lv${lv} bites harder than Lv${lv - 1}`, petBiteShare("epic", lv) > petBiteShare("epic", lv - 1));
}
ok("level is clamped at the top", petBiteShare("epic", 99) === petBiteShare("epic", PET_BITE_MAX_LEVEL));
ok("level is clamped at the bottom", petBiteShare("epic", 0) === petBiteShare("epic", 1));
ok("a junk level does not zero the bite", petBiteShare("epic", NaN) === petBiteShare("epic", 1));

console.log("\nTHE CEILING AND THE FLOOR");
// The design the comments in grove-world.js promise: a companion, never a second hero. If either of these
// two ever fails, the balance note above it has become a lie.
const top = petBiteShare("eternal", PET_BITE_MAX_LEVEL);
const bottom = petBiteShare("common", 1);
ok(`the best pet in the game bites for under 40% of a swing (${(top * 100).toFixed(1)}%)`, top < 0.40, `got ${top}`);
ok(`...and for more than a quarter of one (${(top * 100).toFixed(1)}%)`, top > 0.25, `got ${top}`);
ok(`a starter pet is noticeable but small (${(bottom * 100).toFixed(1)}%)`, bottom >= 0.04 && bottom <= 0.07, `got ${bottom}`);
// Even the unminted tiers must not break the promise that the pet is support.
ok("even a maxed primordial stays under two thirds of a swing",
    petBiteShare("primordial", PET_BITE_MAX_LEVEL) < 0.66, `got ${petBiteShare("primordial", PET_BITE_MAX_LEVEL)}`);

console.log("\nTHE CADENCE");
const heroCd1 = SWING_TOTAL_MS;              // tempo 1
const heroCd4 = SWING_TOTAL_MS / 4;          // tempo 4
ok("at tempo 1 the pet bites half as often as the hero swings",
    petBiteCd(heroCd1) === heroCd1 * PET_BITE_EVERY, `got ${petBiteCd(heroCd1)}`);
ok("the pet is always slower than the hero", petBiteCd(heroCd1) > heroCd1 && petBiteCd(heroCd4) > heroCd4);
ok("a tempo build speeds the pet up too", petBiteCd(heroCd4) < petBiteCd(heroCd1));
ok("...but never past the floor that keeps it readable",
    petBiteCd(heroCd4) >= PET_BITE_MIN_MS && petBiteCd(1) === PET_BITE_MIN_MS);

console.log("\nTHE BLOW ITSELF");
// A fighter with every proc turned on, so anything the pet is NOT supposed to inherit shows up.
const f = {
    damage: 1000, dmgPct: 0, critChance: 0, critMult: 2, lifesteal: 400,
    bleedChance: 1, bleedDamage: 0, bleedLeech: 0.5,
};
const share = petBiteShare("mythic", 3);
const bite = petBite(f, share, 0, mulberry(11));
const hero = swing(f, 0, mulberry(11));
ok("the bite is a share of the hero's own blow",
    Math.abs(bite.dealt - Math.round(hero.dealt * share)) <= 1, `pet ${bite.dealt} vs hero ${hero.dealt} x ${share}`);
// ⚠️ THESE TWO ARE THE "one investment paying twice" GUARDS. Lifesteal is the hero's weapon drinking and
// bleed is his blade cutting; a second body applying either doubles a stat the player bought once, and
// bleed REFRESHES rather than stacks, so a pet's weaker wound would overwrite the hero's stronger one.
ok("no lifesteal off a bite, even at 400 points", bite.healed === 0, `got ${bite.healed}`);
ok("no bleed off a bite, even at 100% chance", bite.bleed === null, `got ${JSON.stringify(bite.bleed)}`);
ok("the hero's own blow still bleeds and drinks", hero.bleed !== null && hero.healed > 0);
// Crit is kept in full: "every stat should be important" includes seeing your pet crit.
const critting = petBite({ ...f, critChance: 1 }, share, 0, mulberry(5));
ok("a crit build crits with its pet too", critting.crit === true);
ok("a pet crit is bigger than a pet hit", critting.dealt > bite.dealt);
// Armour still mitigates, because it is the same function.
ok("armour mitigates a bite", petBite(f, share, 400, mulberry(11)).dealt < bite.dealt);
ok("a bite never rounds away to nothing",
    petBite({ ...f, damage: 1 }, petBiteShare("common", 1), 9999, mulberry(3)).dealt >= 1);
ok("no pet equipped is no bite at all", petBite(f, 0, 0, mulberry(1)).dealt === 0);

console.log("\nTHE POUNCE");
ok("it is quicker than the hero's swing", POUNCE_TOTAL_MS < SWING_TOTAL_MS,
    `${POUNCE_TOTAL_MS} vs ${SWING_TOTAL_MS}`);
// ⚠️ THE BITE LANDS ON THE LEAP, so the coil has to be over before the resolver fires or the damage
// arrives while the pet is still crouching and the animation is mimed. GroveScene resolves at POUNCE.coilMs.
ok("the coil is the anticipation and ends before the bite lands",
    pouncePose(POUNCE.coilMs - 1, 1).t === "coil" && pouncePose(POUNCE.coilMs + 1, 1).t === "leap");
ok("the crossing is the shortest beat", POUNCE.leapMs < POUNCE.coilMs && POUNCE.leapMs < POUNCE.backMs);
ok("nothing before it starts", pouncePose(null, 1).t === null && pouncePose(-5, 1).dx === 0);
ok("nothing after it ends", pouncePose(POUNCE_TOTAL_MS + 1, 1).t === null);
ok("it comes home", Math.abs(pouncePose(POUNCE_TOTAL_MS, 1).dx) < 0.01
    && pouncePose(POUNCE_TOTAL_MS, 1).dy === 0);
ok("it leaves the ground on the crossing and only there",
    pouncePose(POUNCE.coilMs + POUNCE.leapMs / 2, 1).dy > 0.5
    && pouncePose(POUNCE.coilMs / 2, 1).dy === 0);
ok("it mirrors with facing",
    pouncePose(POUNCE.coilMs + 10, -1).dx === -pouncePose(POUNCE.coilMs + 10, 1).dx);
// Bounded: an unbounded render offset is how a body ends up photographed off the side of the frame.
let worst = 0;
for (let t = 0; t <= POUNCE_TOTAL_MS; t += 1) {
    const q = pouncePose(t, 1);
    worst = Math.max(worst, Math.abs(q.dx), Math.abs(q.dy));
    if (!(q.sx > 0.5 && q.sx < 1.6 && q.sy > 0.5 && q.sy < 1.6)) { worst = 1e9; break; }
}
ok("every frame of it is bounded and on-stage", worst < 8, `worst offset ${worst}`);

// ── ⚠️ CAN THE PET ACTUALLY REACH A FIGHT BEFORE IT IS OVER? ────────────────────────────────────────────────
// The one thing every other check passed while the feature was, in ordinary play, doing nothing at all.
//
// The cadence was gating the OPENING bite as well as the repeat ones. A member hitting for 413 (measured in
// the live game, not invented) kills a zone-one-to-six creature in 410-820ms; the first bite could not land
// before petBiteCd + coil = 915ms. So across half the forest the pet crossed to the flank, arrived, and the
// creature was already dead. On a boss it bit a hundred times and looked perfect, which is precisely why the
// bench -- whose creature has 6,000 health so it can be filmed -- never showed it.
//
// This asserts the SHAPE of that trap rather than the fix: if an ordinary creature dies faster than one
// cadence, then the opening bite must not be on the cadence. GroveScene clears petAt on a new target to
// honour that; if someone re-gates it, this is the note that says why they must not.
console.log("\nCAN IT REACH THE FIGHT IN TIME");
const REF_BLOW = 413;        // one blow from a mid-game member, measured in The Old Stand
const heroCd = SWING_TOTAL_MS;
const openIfGated = petBiteCd(heroCd) + POUNCE.coilMs;
const quick = [];
for (const z of GROVE_ZONES.slice(0, 12)) {
    const id = Array.isArray(z.enemies) ? z.enemies[0] : z.enemy;
    const base = GROVE_ENEMIES[id];
    if (!base) continue;
    const hp = (typeof scaledFoe === "function" ? scaledFoe(id, z.n)?.hp : null) ?? base.hp;
    const ttk = (Math.ceil(hp / REF_BLOW) - 1) * heroCd;
    if (ttk < openIfGated) quick.push(`${z.name} (${ttk}ms)`);
}
ok(`ordinary creatures die faster than one pet cadence (${quick.length} of 12 zones), so the opening bite cannot be gated on it`,
    quick.length > 0, "if this ever fails the trap is gone and the note above can go with it");
console.log(`     dies inside ${openIfGated}ms: ${quick.join(", ") || "none"}`);
ok("the pounce's coil is short enough to fit inside the quickest kill",
    POUNCE.coilMs < 410, `coil ${POUNCE.coilMs}ms vs a 410ms one-blow kill`);

console.log(fails ? `\ncheck:grove-pet — ${fails} FAILED\n` : "\nOK — the pet's bite climbs with rarity and level, fails upward, stays support, reaches the fight, and its pounce comes home.\n");
process.exit(fails ? 1 : 0);
