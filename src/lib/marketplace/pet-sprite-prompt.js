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
    2: "It has visibly matured: slightly larger and sturdier, fur/scales/feathers fuller and better groomed, "
       + "posture squared and alert, eyes sharper and more determined. No magical effects yet — this rung is "
       + "about the creature itself looking healthier and stronger, and it must NOT look softer or younger "
       + "than the base form.",
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
export function buildPetSpriteLevelPrompt(pet, level) {
    const evo = LEVEL_EVOLUTION[level] || "";
    // The creature's own description is restated FIRST and the identity clause comes last, so the thing the
    // model reads going in and the thing it reads last are both "this exact creature" rather than the effects.
    return housePrompt(
        `${pet.spritePrompt} — a loyal battle companion at power level ${level} of 5. ${evo} ${IDENTITY}`,
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
    const evo = LEVEL_EVOLUTION[level] || "";
    return `Evolve THIS EXACT creature to power level ${level} of 5. ${evo} ${IDENTITY} `
        + `Keep the same art style, the same transparent background, and the same right-facing three-quarter `
        + `full-body pose as the reference image.`;
}

