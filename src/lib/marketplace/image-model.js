import "server-only";

import fs from "node:fs";
import path from "node:path";

// ── WHICH MODEL DRAWS THE GAME ───────────────────────────────────────────────────────────────────────────────
// One constant, because the last migration had to find seven hardcoded copies of the old name in this file's
// neighbours and ~130 more in scripts/. See docs/art/house-style-decisions.md for how this one was chosen.
//
// ⚠️ gpt-image-1 WAS NOT RETIRED CLEANLY. Its `shutdown_date` was 2026-10-23 while the model stayed listed and
// resolvable, so requests kept being accepted and kept failing — 258 of them, 231 member hero redraws. There
// was no error that said "this model is gone". If art starts failing in bulk for no reason, check the model's
// shutdown_date FIRST.
//
// ⚠️ AND DO NOT GO BACK TO THE 1.x FAMILY TO "FIX" SOMETHING. gpt-image-1.5 and gpt-image-1-mini both shut down
// 2026-12-01. 1-mini measured flatter and cost $0.0100 a head against $0.0485 — it was still rejected, because
// a five-week runway is not a migration target.
export const IMAGE_MODEL = "gpt-image-2.5-sunburst";

/**
 * Does this model name denote an IMAGE model?
 *
 * ⚠️ THIS EXISTS BECAUSE `startsWith("gpt-image-1")` WAS THE TEST. The usage report split image spend from text
 * spend on that prefix, so the moment the house model stopped being a 1.x the entire art bill would have been
 * silently reported as TEXT spend — no error, just a cost report that quietly stopped being true. Any new model
 * name has to pass through here, never a literal prefix at the call site.
 */
export function isImageModel(name) {
    const n = String(name || "");
    return n.startsWith("gpt-image-") || n.startsWith("chatgpt-image-");
}

// ── THE HOUSE STYLE SHEET ────────────────────────────────────────────────────────────────────────────────────
// A contact sheet of 24 finished assets across 11 kinds, passed to the model as a REFERENCE alongside the
// subject. It is the single change that moved detail density when prose could not: four rounds of "keep it
// simple" and "use large shapes" moved it by 0.2 points, and the sheet moved it immediately.
//
// It is a style guide, not a subject — the prompt tail has to say so explicitly or the model draws things off
// the sheet into the picture.
const SHEET_PATH = path.join(process.cwd(), "public", "images", "art", "house-design-sheet.png");
let sheetCache;

/**
 * The style sheet as a PNG buffer, or null if it cannot be read.
 *
 * ⚠️ NULL IS A SUPPORTED ANSWER AND MUST STAY ONE. A missing file degrades the art; throwing here would take
 * out every sprite redraw, the boss art and the decoration pipeline at once. Read once per cold start — the
 * result is cached either way, so a failure does not re-stat the disk on every draw.
 */
export function houseStyleSheet() {
    if (sheetCache !== undefined) return sheetCache;
    try {
        sheetCache = fs.readFileSync(SHEET_PATH);
    } catch {
        sheetCache = null;
    }
    return sheetCache;
}

/** The sheet wrapped as the `styleRefs` array the edits endpoint wants. Empty when the sheet is unreadable. */
export function houseStyleRefs() {
    const sheet = houseStyleSheet();
    return sheet ? [sheet] : [];
}

// ── THE PROMPT TAIL ──────────────────────────────────────────────────────────────────────────────────────────
// docs/art/house-style-decisions.md §3. The finding worth remembering: ADJECTIVES DID NOT WORK AND COUNTS DID.
// "Keep it simple" and "a few large shapes read better than many small ones" were in the prompt for four
// rounds and moved detail density by 0.2 points. Replacing them with things the model can COUNT — three gems,
// two or three shapes per limb, gold as a thin edge, a named list of banned ornaments — took both candidate
// models from ~15,000 distinct colours to ~11,000 against a house target of 12,190, in one step.
//
// A model cannot count "simple". It can count three.
//
// ⚠️ THE BAN-LIST IS NOT DECORATION. Without it the model adds fur collars, feathered pauldrons, a dragon
// emblem on the cape and gold panelling to a prompt that asked for none of them, every single time. It is not
// being creative; it is filling in what it thinks "heroic" means.

/** Why the second image is attached. Without this sentence the model draws objects off the sheet. */
export const STYLE_SHEET_RULE = " THERE IS A SECOND IMAGE ATTACHED AND IT IS A STYLE GUIDE, NOT A SUBJECT. It is a "
    + "sheet of finished assets from this game, drawn in the exact house style you must match. Copy from it the "
    + "LINE WEIGHT (a thick dark outline around every form), the FLATNESS (large areas of solid colour, two or "
    + "three tone steps, no painterly blending or airbrushed gradients), and the SIMPLICITY (a few large shapes "
    + "per form, almost no small ornament). Do NOT copy any object, character, colour scheme or item from that "
    + "sheet — only how it is DRAWN. The first image is the subject whose identity you keep.";

/** The countable limits. Shared by every asset kind; the character/object wording differs only in the nouns. */
export const COUNTABLE_LIMITS = " COUNTABLE LIMITS, AND THEY ARE HARD LIMITS. Build each arm, each leg and the "
    + "torso from TWO OR THREE large shapes, not from a stack of overlapping plates. Put AT MOST THREE gems on "
    + "the entire figure. Gold appears only as a THIN EDGE along the border of a shape — never as a filled "
    + "panel, never as a second layer of trim on top of trim. THINGS THAT MUST NOT APPEAR UNLESS AN ITEM IS "
    + "NAMED FOR THEM: fur collars, feathered mantles, shoulder ruffs, animal heads, dragon emblems, crests, "
    + "heraldry, engraved patterns, scrollwork, filigree, studs, rivets, chains, tassels, or any emblem printed "
    + "on the cape. THE CAPE IS ONE FLAT COLOUR with a plain edge — no motif, no pattern, no gradient, no glow. "
    + "If you are deciding whether to add a detail, DO NOT ADD IT. The finished sprite must read clearly at 100 "
    + "pixels tall, and every extra ornament makes it read worse.";

/** House rendering rules for a CHARACTER. */
export const HOUSE_CHARACTER_RULES = " THE SINGLE MOST IMPORTANT RULE, CHECK IT BEFORE FINISHING: the image must "
    + "contain the character and ABSOLUTELY NOTHING ELSE on a fully transparent background. Do NOT draw a "
    + "shadow. Do NOT draw a shadow ellipse, oval, pool, puddle, disc or grey smudge on the ground under the "
    + "feet. There is no ground and no floor — the character is floating against empty transparency. A drop "
    + "shadow beneath the boots is the most common mistake made on this task and it RUINS the sprite, because "
    + "the art is cut out and placed on other backgrounds where a shadow appears as a grey stain. The pixels "
    + "around and below the character must be fully transparent and completely empty."
    + " HOUSE STYLE — THESE RULES OVERRIDE ANY CONTRARY INSTINCT ABOUT WHAT A HEROIC CHARACTER SHOULD LOOK LIKE. "
    + "PROPORTIONS: draw the hero as a STOCKY CHIBI — a large head about one third of the total body height, a "
    + "short sturdy torso, short legs, big hands and big boots, standing squarely on both feet with a wide "
    + "planted stance. This is deliberately NOT a realistically proportioned figure and NOT a tall slender "
    + "heroic one; a tall figure is wrong even if it looks more impressive. RENDERING: flat cel shading with "
    + "only two or three tone steps per colour, large simple areas of solid colour, and a bold dark outline "
    + "around the whole figure and around every major shape inside it. No airbrushed or soft gradients, no "
    + "painterly rendering, no photographic or cinematic lighting, no rim light tracing every edge, no fine "
    + "filigree and no hundreds of tiny marks — a few large shapes must read better than many small ones. "
    + "BACKGROUND: fully transparent, and draw NOTHING that is not the character itself — no ground, no floor, "
    + "no cast shadow, no contact shadow, no ellipse or smudge beneath the feet, no vignette, no background "
    + "glow. EFFECTS: the magical aura is a small number of discrete floating wisps and sparks near the gear, "
    + "never a full-body glow, and never an elemental effect that was not named — do not add fire, flames, "
    + "smoke, ice, or lightning unless an item is named for it. WEAPONS: draw each named weapon as the kind of "
    + "weapon its name states — a maul is a heavy blunt hammer and must never be drawn as an axe or a blade. "
    + "FACE: keep the reference's facial hair exactly as shown — if the reference has a beard, the hero has "
    + "that same beard, and the hair colour matches the reference rather than being changed.";

/**
 * The full character tail: house rules + why the sheet is attached + the countable limits.
 * This is `tail-r2-restrained.txt` in docs/art, the exact text behind the sprites Luke picked.
 */
export const HOUSE_CHARACTER_TAIL = HOUSE_CHARACTER_RULES + STYLE_SHEET_RULE + COUNTABLE_LIMITS;

/**
 * The same thing for an OBJECT — gear, an enemy, a decoration, a prop.
 *
 * Differs from the character tail only where the character tail talks about a BODY: proportions become "chunky
 * and solid" instead of chibi, there is no face or weapon-in-hand clause, and it adds a single-view rule
 * because an object prompt tempts the model into exploded views and labelled diagrams.
 */
export const HOUSE_OBJECT_TAIL = " THE SINGLE MOST IMPORTANT RULE, CHECK IT BEFORE FINISHING: the image must "
    + "contain the object and ABSOLUTELY NOTHING ELSE on a fully transparent background. Do NOT draw a shadow. "
    + "Do NOT draw a shadow ellipse, oval, pool, puddle, disc or grey smudge on the ground beneath the object. "
    + "There is no ground and no floor — the object is floating against empty transparency. A drop shadow "
    + "beneath it is the most common mistake made on this task and it RUINS the sprite, because the art is cut "
    + "out and placed on other backgrounds where a shadow appears as a grey stain. The pixels around and below "
    + "the object must be fully transparent and completely empty."
    + " HOUSE STYLE — THESE RULES OVERRIDE ANY CONTRARY INSTINCT ABOUT HOW IMPRESSIVE A GAME ASSET SHOULD LOOK. "
    + "FORM: draw the object CHUNKY and SOLID — generous thickness, broad simple masses, slightly exaggerated "
    + "and toylike rather than realistically proportioned. A delicate, finely detailed or realistically scaled "
    + "object is wrong even if it looks more impressive. It must read instantly as one clear silhouette. "
    + "RENDERING: flat cel shading with only two or three tone steps per colour, large simple areas of solid "
    + "colour, and a bold dark outline around the whole object and around every major shape inside it. No "
    + "airbrushed or soft gradients, no painterly rendering, no photographic or cinematic lighting, no rim "
    + "light tracing every edge, no fine filigree and no hundreds of tiny marks. BACKGROUND: fully transparent, "
    + "and draw NOTHING that is not the object itself — no ground, no floor, no cast shadow, no contact shadow, "
    + "no ellipse or smudge beneath it, no vignette, no background glow, no scenery, no base or plinth unless "
    + "the object is named for one. EFFECTS: any magical aura is a small number of discrete floating wisps and "
    + "sparks near the object, never a full-body glow, and never an elemental effect that was not named. VIEW: "
    + "a single three-quarter view, centred, filling most of the frame, with no second angle, no exploded view, "
    + "no inset, no label and no text anywhere in the image."
    + STYLE_SHEET_RULE
    + " COUNTABLE LIMITS, AND THEY ARE HARD LIMITS. Build the object from TWO OR THREE large shapes plus at "
    + "most a couple of smaller ones, not from a stack of overlapping plates or layered panels. Put AT MOST "
    + "THREE gems on the entire object. Gold appears only as a THIN EDGE along the border of a shape — never as "
    + "a filled panel, never as a second layer of trim on top of trim. THINGS THAT MUST NOT APPEAR UNLESS THE "
    + "OBJECT IS NAMED FOR THEM: fur, feathers, animal heads, dragon emblems, crests, heraldry, engraved "
    + "patterns, scrollwork, filigree, studs, rivets, chains, tassels, runes, or any emblem or motif printed on "
    + "a flat surface. Any flat surface is ONE FLAT COLOUR with a plain edge — no motif, no pattern, no "
    + "gradient, no glow. If you are deciding whether to add a detail, DO NOT ADD IT. The finished sprite must "
    + "read clearly at 100 pixels tall, and every extra ornament makes it read worse.";
