// ──── HOW A PET SPRITE IS ASKED FOR, AND ONLY THAT ──────────────────────────────
// Pure and importable from ANYWHERE, which is the entire reason this file exists apart from
// pet-sprite.js. That module opens a database connection and is marked `server-only`, so a generator
// script outside Next cannot import it — and every generator that needed this wording therefore
// COPIED it. gen-fishing-pet-sprites.mjs still carries the pre-rewrite version: "a faint magical aura
// and a more confident stance", the exact vague line the rewrite replaced because it invited the model
// to reinterpret the whole creature. Twenty sprites were generated from wording nobody meant to use.
//
// So the prompt lives here, the server module re-exports it, and a script imports it directly. One
// wording, and it cannot drift again.
import { housePrompt } from "@/lib/marketplace/art-style.js";

// Each pet gets ONE shared 2D battle sprite (not per-member) so the member's active pet can fight beside
// them in the boss scene. Same art universe as the member/boss sprites (transparent, full-body).
// Pose/framing direction only — the LOOK comes from the shared house style, so pets, gear and decorations all
// read as one set. Facing right matters mechanically: the sprite fights beside you toward the enemy.
const POSE =
    "Full body, cute but fierce, facing and looking toward the RIGHT side of the image — a right-facing " +
    "three-quarter view, turned toward the enemy.";

export function buildPetSpritePrompt(pet) {
    return housePrompt(`${pet.spritePrompt} — a loyal battle companion.`, { extra: POSE });
}

// Per-LEVEL evolution (Lv1 = the plain base prompt above). Each tier makes the SAME creature read as more
// powerful, so a member watches their companion visibly evolve 1→5.
//
// ── WHY THESE WERE REWRITTEN ─────────────────────────────────────────────────────────────────────────────
// The Lv1 sprite was consistently the strongest and most on-style, Lv2 often came back WEAKER than the base,
// and the creature's identity drifted from there. Three causes, all in the prompt:
//
//   1. Every level was generated INDEPENDENTLY from the same text description. Five independent readings of
//      "a fluffy grey wolf pup" produce five different wolf pups, not one wolf pup at five ages. Nothing
//      carried the actual look forward. Fixed structurally below by anchoring levels to the Lv1 IMAGE.
//   2. Lv2's instruction was "a faint magical aura and a more confident stance" — so weak it gave the model
//      nothing to hold on to, and a vague instruction is an invitation to reinterpret the whole subject.
//      Every rung now names a CONCRETE, additive change.
//   3. The escalation was entirely VFX — aura, runes, energy, swirling. By Lv4 the creature was buried in
//      effects. The escalation now grows the CREATURE first and treats effects as trim.
const IDENTITY = "CRITICAL: it must remain unmistakably the same individual creature — identical species, "
    + "identical colour palette, identical markings, identical silhouette and proportions. This is the same "
    + "character at a later stage, NOT a different creature of the same type. Do not restyle it.";

export const PET_SPRITE_LEVELS = [2, 3, 4, 5];
const LEVEL_EVOLUTION = {
    // ⚠️ "fur/scales/feathers" IS A LIST OF THINGS A CREATURE MIGHT NOT HAVE. Rattle is a skeleton wolf pup;
    // asked for fuller fur at rung 2 the model gave him FLESH — a furry brown dog, which then reverted to
    // bone at rung 3. The rung has to say "more of whatever this one is made of", because the ladder has to
    // survive a skeleton, a slime, a candle and a lantern, not just animals with coats.
    2: "It has visibly matured: slightly larger and sturdier, and WHATEVER IT IS MADE OF — fur, scales, "
       + "feathers, bone, metal, stone, vapour, wax, flame — is fuller, cleaner and better formed. Do NOT "
       + "give it a material it does not already have: a skeleton stays bare bone and never grows flesh or "
       + "fur, a ghost stays vapour. Posture squared and alert, eyes sharper and more determined. No magical "
       + "effects yet — this rung is about the creature looking healthier and stronger, and it must NOT look "
       + "softer or younger than the base form.",
    3: "It is battle-hardened: noticeably bigger and more muscular, a few honest marks of experience (a nicked "
       + "ear, a scar, weathered plating), stance widened and braced. A faint warm glow at the eyes only.",
    4: "It has reached an EPIC evolved form: substantially larger and more imposing, with ONE dramatic new "
       + "physical feature that suits this species (heavier horns, a longer mane, spreading wings, armoured "
       + "plates). Any aura must hug the creature's own outline — no background, no scenery, no filled "
       + "backdrop. The background stays fully transparent.",
    5: "It has reached its ULTIMATE LEGENDARY form: the largest and most majestic version of itself, its "
       + "signature feature fully realised, bearing regal and awe-inspiring. Any glow or energy must CLING "
       + "TIGHTLY to the creature's own silhouette — absolutely no background, no scenery, no filled backdrop, "
       + "no glowing plate behind it. The background stays fully transparent.",
};
// ── THE GENTLE LADDER, FOR PETS THAT ARE MEANT TO BE CUTE ────────────────────────────────────────────────
// ⚠️ `cute: true` WAS READ BY EXACTLY ONE SCRIPT. gen-pet-level6.mjs has had a CUTE_GUARD since the Frost
// Caterpillar came back snarling — but rungs 2-5 come from THIS file, which never looked at the flag at all.
// The comment in collectibles.js says the flag "picks the gentle evolution ladder in both scripts". It did
// not. It picked it in one, and the note was the only thing holding the other half up.
//
// What that produced, every time: a pet sweet at level 1, sweet again at level 6, and a scowling muscular
// bruiser at 2, 3 and 4 — because the ladder above asks in as many words for "battle-hardened", "more
// muscular", "a nicked ear, a scar", "heavier horns". Sugar Sprite grew horns and a tail at rung 4. Boo
// spent rung 3 with biceps.
//
// So the flag picks a real second ladder now. Same SHAPE — each rung is a bigger, more realised version of
// the animal — expressed as growing splendour instead of growing menace, which is Luke's line on the
// caterpillar: "needs to be cute the whole way through."
const CUTE_EVOLUTION = {
    2: "It has visibly grown: a little bigger and rounder, its colours brighter and cleaner, posture perked "
       + "up and bright-eyed and pleased with itself. No magical effects yet — this rung is about the "
       + "creature looking healthier and happier, and it must NOT look younger or smaller than the base form.",
    3: "It is thriving: noticeably bigger and fuller, its markings richer and more defined, with the first "
       + "touch of magic about it — a soft warm light in its eyes and a few drifting sparkles. Still round, "
       + "still soft, still smiling.",
    4: "It has reached an ENCHANTED form: substantially bigger and more splendid, with ONE dramatic new "
       + "BEAUTIFUL feature that suits this creature (gossamer wings, a flowing ribbon-like tail, a ring of "
       + "floating petals or crystals, an ornate storybook collar). Any aura must hug its own outline — no "
       + "background, no scenery, no filled backdrop. The background stays fully transparent.",
    5: "It has reached its ULTIMATE STORYBOOK form: the largest and most magical version of itself, its "
       + "beautiful signature feature fully realised, radiant and wondrous and still utterly adorable. Any "
       + "glow must CLING TIGHTLY to its own silhouette — absolutely no background, no scenery, no filled "
       + "backdrop, no glowing plate behind it. The background stays fully transparent.",
};

// The same prohibition gen-pet-level6.mjs appends, because the ladder above is only half the job: the reason
// a cute pet turns into a bruiser is the model reaching for menace whenever it is asked for "more".
const CUTE_GUARD = "THIS PET IS A CUTE PET AND MUST STAY CUTE. Keep the face round, soft and friendly with "
    + "simple kind eyes and a gentle expression. NEVER give it a snarl, an open fanged mouth, bared teeth, an "
    + "angry brow, bulging muscles, claws or spikes turned into weapons, a predatory crouch or a menacing "
    + "expression. Express every step up as BEAUTY AND WONDER, never as ferocity. It should look magical and "
    + "adorable, like something you would want to hug. ";

// Which ladder this pet climbs, and the guard that goes with it.
const evolutionFor = (pet, level) => (pet?.cute ? CUTE_EVOLUTION : LEVEL_EVOLUTION)[level] || "";
const guardFor = (pet) => (pet?.cute ? CUTE_GUARD : "");

export function buildPetSpriteLevelPrompt(pet, level) {
    const evo = evolutionFor(pet, level);
    // The creature's own description is restated FIRST and the identity clause comes last, so the thing the
    // model reads going in and the thing it reads last are both "this exact creature" rather than the effects.
    return housePrompt(
        `${pet.spritePrompt} — a loyal battle companion at power level ${level} of 5. ${evo} ${guardFor(pet)}${IDENTITY}`,
        { extra: POSE }
    );
}

/**
 * The level prompt used when we can anchor on the Lv1 sprite as a reference image.
 *
 * This is the structural fix for identity drift: an edit carries the actual pixels of the base form forward,
 * so "the same creature, later" stops being something the model has to infer from a sentence.
 */
export function buildPetSpriteLevelEditPrompt(pet, level) {
    const evo = evolutionFor(pet, level);
    return `Evolve THIS EXACT creature to power level ${level} of 5. ${evo} ${guardFor(pet)}${IDENTITY} `
        + `Keep the same art style, the same transparent background, and the same right-facing three-quarter `
        + `full-body pose as the reference image.`;
}

