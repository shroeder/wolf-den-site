// ── A PICTURE FOR EVERY MARK A FIGHTER CAN CARRY ─────────────────────────────────────────────────────────
// Luke, looking at a fight: "I hate the icons, use sprites."
//
// The statuses and the enemy's intent were drawn with react-icons glyphs — GiBiceps, GiCrackedShield,
// GiSwordWound. They are SVGs rather than emoji, but at eighteen pixels on a phone the distinction does not
// survive: a flat single-colour arm over a health bar reads as an emoji somebody dropped in, next to a game
// where every other object is painted. The board is the one screen in the game with no painted furniture on
// it at all.
//
// ⚠️ THESE ARE JUDGED AT ~20px, WHICH IS SMALLER THAN ANYTHING ELSE IN THE GAME. A trinket gets 34-64px on a
// shelf; this sits inside a pill under a health bar. So the whole brief is SILHOUETTE and one colour idea —
// a fist, a feather, a cracked disc — and any interior detail is thrown away by the downscale. Say the shape.
//
// Run:  node --experimental-loader ./scripts/lib/app-loader.mjs scripts/gen-card-status.mjs [--force] [--only weak,frail]
import fs from "node:fs";
import sharp from "sharp";
import { housePrompt } from "../src/lib/marketplace/art-style.js";
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/cards/status";
fs.mkdirSync(OUT, { recursive: true });
const SIZE = "1024x1024";

// Read at a glance, and differ from each other in OUTLINE before they differ in colour — a player picks
// these apart on a lit board in a fraction of a second, and half of them sit side by side in the same pill row.
const SMALL = "Drawn as ONE single emblem seen straight on, centred, filling most of the frame, with a bold "
    + "unmistakable silhouette that stays readable shrunk to twenty pixels. No text, no letters, no numbers, "
    + "no border, no frame, no background scene — the object alone on transparency.";

const ART = {
    // ── what you want ────────────────────────────────────────────────────────────────────────────────
    strength: "a clenched armoured gauntlet fist punching toward the viewer, dark iron plate with hot orange "
        + "light in the knuckle seams",
    dexterity: "a single long curved feather angled diagonally, pale silver-blue, its edge catching a streak "
        + "of light like something moving fast",
    block: "a small round riveted shield seen face on, dark steel with a bright cold blue rim light",
    regen: "a fresh green sprig with three leaves and one bead of dew, lit softly from within",
    artifact: "a floating faceted ward-stone cut with one hard geometric seal, pale gold, ringed by a thin "
        + "band of light",
    intangible: "a hooded figure's silhouette going half transparent, pale white-blue, its lower edge "
        + "dissolving into drifting motes",

    // ── what you do not ──────────────────────────────────────────────────────────────────────────────
    vulnerable: "a shield split by one deep jagged crack straight down its middle, dull red, the crack "
        + "glowing hot along its edges",
    weak: "a heavy sword bent and drooping in the middle as though the metal had gone soft, dull grey-green",
    frail: "a cracked stone disc breaking into three pieces and beginning to fall apart, sandy grey",
    poison: "a single thick droplet of sickly luminous green fluid with a faint skull shape showing inside it",
    curse: "a black iron ring wound with thorns, a dull violet glow bleeding out from between them",

    // ── the enemy's next move ────────────────────────────────────────────────────────────────────────
    attack: "two crossed blades, bright polished steel with a hard highlight along each edge",
    heal: "a warm red heart with a soft golden cross of light over it",
    // ⚠️ THESE TWO EXIST BECAUSE THE PILL COULD NOT DRAW THEM. Three creatures open a fight with a move that
    // shuffles junk into your deck or calls in more of them, and the intent row had no mark for either — so
    // the act-one boss's first turn rendered an EMPTY pill and read as "the boss does nothing".
    // First draw came back as a plain grey rectangle — a blank card IS a blank rectangle, and at 22px on a
    // dark board it read as a missing image rather than as an emblem. Given something to be.
    status: "a tattered parchment card curling at its corners, scorched brown at the edges, with a heavy "
        + "black X scrawled across its face in dripping ink",
    summon: "a curved brass war-horn raised and blowing, with three faint sound rings coming off its bell",
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
