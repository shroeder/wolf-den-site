// ── A PICTURE FOR EVERY MARK A FIGHTER CAN CARRY ───────────────────────────────────
// Luke, looking at a fight: "I hate the icons, use sprites."
//
// The statuses and the enemy's intent were drawn with react-icons glyphs — GiBiceps, GiCrackedShield,
// GiSwordWound. They are SVGs rather than emoji, but at eighteen pixels on a phone the distinction does not
// survive: a flat single-colour arm over a health bar reads as an emoji somebody dropped in, next to a game
// where every other object is painted. The board is the one screen in the game with no painted furniture on
// it at all.
//
// ⚠️ AND THEN HALF OF THEM CAME BACK INVISIBLE, WHICH IS A VALUE PROBLEM AND NOT A DRAWING ONE.
// Second pass. Luke, on the fishmonger with an attack mark over her head: "what is on her head? I hate that
// sprite. make sprites that are like icons." Then, precisely: "attack sprite looks good block does not,
// needs to be more iconic sprites."
//
// He is pointing at the one variable that separates them. Attack is two polished steel blades — a LIGHT
// object with a hard X for a silhouette. Block was "a small round riveted shield, dark steel with a cold
// blue rim light", so at eighteen pixels it is a dark disc on dark sand inside a dark pill: three values
// that are all nearly black, and the only thing you can see is that something is there. Strength was dark
// iron, Curse a black iron ring, Vulnerable a dull red, Weak a dull grey-green. Every emblem he could not
// read was a dark object; every one he could was a bright one.
//
// So the rule this file now writes down: THE EMBLEM MUST BE LIGHTER THAN THE BOARD. Colour tells you WHICH
// mark; value is what tells you there is a mark at all, and a mark you cannot see is worse than no mark
// because the row still takes the space. Each subject below names a bright object and puts the dark half of
// its idea in an accent — a hot crack, a sour wash, a violet glow — rather than in the body of the thing.
//
// ⚠️ ATTACK IS NOT IN THIS TABLE AND MUST NOT BE REDRAWN. It is the one Luke said was right, and the
// brief was written by looking at it. Regenerating it would roll the dice on the reference itself.
//
// ⚠️ THESE ARE JUDGED AT ~18px, WHICH IS SMALLER THAN ANYTHING ELSE IN THE GAME. A trinket gets 34-64px
// on a shelf; this sits inside a pill under a health bar. So the whole brief is SILHOUETTE, VALUE and one
// colour idea — a fist, a feather, a cracked disc — and any interior detail is thrown away by the
// downscale. Say the shape, and say it in a bright colour.
//
// Run:  node --experimental-loader ./scripts/lib/app-loader.mjs scripts/gen-card-status.mjs [--force] [--only weak,frail]
import fs from "node:fs";
import sharp from "sharp";
import { SMALL_ICON_EXTRA, housePrompt } from "../src/lib/marketplace/art-style.js";
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/cards/status";
fs.mkdirSync(OUT, { recursive: true });
const SIZE = "1024x1024";

// Read at a glance, and differ from each other in OUTLINE before they differ in colour — a player picks
// these apart on a lit board in a fraction of a second, and half of them sit side by side in the same pill row.
const SMALL = `${SMALL_ICON_EXTRA} Drawn as ONE single emblem seen straight on, centred, filling most of `
    + "the frame, with a bold unmistakable silhouette that stays readable shrunk to eighteen pixels. "
    // The half the first pass was missing, and the whole of what went wrong with it.
    + "CRITICAL: this is composited onto a DARK background, so the object itself must be BRIGHT and "
    + "high-key \u2014 its own body light enough to stand off near-black, lit strongly from the front, with a "
    + "hard bright rim along its upper edges. Never a dark object, never dark-on-dark, never a shape read "
    + "only by its outline. Any dark or sickly part of the idea belongs in a small accent, not in the body. "
    + "No text, no letters, no numbers, no border, no frame, no background scene \u2014 the object alone on "
    + "transparency.";

const ART = {
    // ── what you want ────────────────────────────────────────────────
    strength: "a clenched armoured gauntlet fist punching toward the viewer, POLISHED PALE GOLD plate with "
        + "bright highlights on every knuckle and hot orange light in the seams between them",
    dexterity: "a single long curved feather angled diagonally, bright silver-white with a pale blue edge, "
        + "catching a hard streak of light like something moving fast",
    block: "a round riveted shield seen face on, BRIGHT POLISHED SILVER-STEEL with a pale cold-blue sheen "
        + "across its face, a heavy gold rim and gold rivets, lit hard from the front",
    regen: "a fresh sprig with three leaves and one bead of dew, BRIGHT SPRING GREEN going almost white "
        + "where the light hits, glowing softly from within",
    artifact: "a floating faceted ward-stone cut with one hard geometric seal, BRIGHT PALE GOLD with white "
        + "highlights on its facets, ringed by a thin band of light",
    intangible: "a hooded figure's silhouette rendered in BRIGHT PALE WHITE-BLUE like frosted glass, solid "
        + "and clearly outlined, with a few drifting motes coming off its lower edge",

    // ── what you do not ────────────────────────────────────────────
    // Vulnerable and Block are the same object with different news in it, so they are told apart by COLOUR
    // and by the crack — which means both of them have to be bright enough for the colour to be visible.
    vulnerable: "a shield split by one deep jagged crack straight down its middle, BRIGHT WARM RED-ORANGE "
        + "with pale highlights along its edges, the crack glowing white-hot inside",
    weak: "a sword bent and drooping in the middle as though the metal had gone soft, BRIGHT PALE STEEL "
        + "with a sickly yellow-green wash over the blade and a strong highlight along its top edge",
    frail: "a cracked disc breaking into three pieces and beginning to fall apart, BRIGHT BONE-WHITE stone "
        + "lit hard from the front, with dark shadow only inside the cracks",
    poison: "a single thick droplet of BRIGHT LUMINOUS ACID-GREEN fluid, glowing, with a faint pale skull "
        + "shape showing inside it",
    curse: "a ring wound with thorns, BRIGHT VIOLET-WHITE and glowing along its whole length like lit "
        + "glass, with the darker purple only in the hollows between the thorns",

    // ── the enemy's next move ────────────────────────────────────────
    // ⚠️ attack is DELIBERATELY ABSENT — see the header. It is the reference, not a candidate.
    heal: "a BRIGHT WARM RED heart with pale highlights and a glowing golden cross of light over it",
    // ⚠️ THESE TWO EXIST BECAUSE THE PILL COULD NOT DRAW THEM. Three creatures open a fight with a move
    // that shuffles junk into your deck or calls in more of them, and the intent row had no mark for either
    // — so the act-one boss's first turn rendered an EMPTY pill and read as "the boss does nothing".
    // First draw came back as a plain grey rectangle — a blank card IS a blank rectangle, and at 22px on a
    // dark board it read as a missing image rather than as an emblem. Given something to be.
    status: "a tattered parchment card curling at its corners, BRIGHT CREAM-WHITE paper lit from the front "
        + "with scorched amber edges, and a heavy black X scrawled across its face",
    // Told apart from `strength` by being the SAME OBJECT COMING APART: a fist that is losing its plates
    // rather than a fist being thrown. Ashen where strength is gold, so the two never read as each other
    // in a pill row at 22 pixels.
    strengthDown: "a clenched armoured gauntlet fist cracking apart, its plates breaking off and drifting "
        + "away from the knuckles, BRIGHT ASHEN SILVER-GREY plate lit hard from the front with cold violet "
        + "light bleeding out of the seams where the gold has gone",
    summon: "a curved war-horn raised and blowing, BRIGHT POLISHED BRASS with strong white highlights "
        + "along its bell, with three pale sound rings coming off it",
};

const only = (() => { const i = process.argv.indexOf("--only"); return i > -1 ? new Set(process.argv[i + 1].split(",")) : null; })();
const FORCE = process.argv.includes("--force");

let made = 0, skipped = 0, spent = 0;
for (const [id, subject] of Object.entries(ART)) {
    if (only && !only.has(id)) continue;
    const dest = `${OUT}/${id}.png`;
    if (fs.existsSync(dest) && !FORCE) { skipped += 1; continue; }
    const prompt = housePrompt(subject, { framing: "sprite", extra: SMALL });
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
            model: "gpt-image-1", prompt, size: SIZE, background: "transparent",
            output_format: "png", quality: "medium", n: 1,
        }),
    });
    if (!resp.ok) { console.log(`  ${id}: OpenAI ${resp.status}`, (await resp.text()).slice(0, 140)); continue; }
    const json = await resp.json();
    const raw = Buffer.from(json.data[0].b64_json, "base64");
    // Stored at 128px: this is never drawn above about 26 CSS pixels and a 1024px badge in a pill row is
    // four hundred kilobytes of nothing. Twelve of them at 128 is smaller than one card illustration.
    const png = await sharp(raw).resize(128, 128, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(dest, png);
    made += 1; spent += 0.04;
    console.log(`  ${id.padEnd(11)} ${Math.round(png.length / 1024)}kb`);
}
console.log(`\ndrew ${made}, skipped ${skipped} — about $${spent.toFixed(2)}`);
