// ── A PICTURE FOR EVERY POTION AND EVERY TRINKET ─────────────────────────────────────────────────────────────
// Both lists were drawn with ONE shared glyph: every potion in the game was `ui-potion.png` and every trinket
// was `ui-heart.png`, which is fine as a placeholder in the map's top bar and fatal on the merchant's shelf —
// a shop is a row of things you are choosing BETWEEN, and three identical bottles is not a choice, it is a
// list with pictures on it. Luke, on the merchant: "it doesn't Slay the Spire." Theirs draws every potion and
// every relic as its own object, and that is most of what a shop screen IS.
//
// Driven off PERKS and POTIONS in cards-kit rather than off a list here, so a new one authored in the rules
// gets its art by re-running this — the same reason the chrome generator reads RARITY_META instead of naming
// colours. A perk with no file falls back to the old glyph, so the rules are never blocked on the art.
//
// Run:  node scripts/gen-card-items.mjs [--force] [--only whetstone,blood]
import fs from "node:fs";
import sharp from "sharp";
import { housePrompt } from "../src/lib/marketplace/art-style.js";
import { PERKS, POTIONS } from "../src/lib/marketplace/cards-kit.js";
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

// ⚠️ DRAWN AT 34-64px ON A SHELF. Everything here is judged at thumbnail size beside two others, so what it
// needs is a SILHOUETTE that differs from its neighbours — a squat round flask next to a tall thin phial next
// to a horn — not interior detail that the downscale eats. Say the shape, not the filigree.
const SMALL = "Drawn as ONE single object seen straight on from the front, filling most of the frame, with a "
    + "bold unmistakable silhouette that stays readable shrunk to the size of a thumbnail. No hand holding it, "
    + "no table under it, no scene, no second object beside it.";

// ── THE BOTTLES ──────────────────────────────────────────────────────────────────────────────────────────────
// Shape says what it does before the colour does: the healing one is a fat round belly, the energy one is a
// spark in a jar. Colour is the second read and it matches the number the potion moves.
const POTION_ART = {
    swift: "A tall slender glass phial with a long narrow neck and a waxed cork, filled with swirling pale "
        + "silver-blue liquid that streams upward inside the glass like wind caught in a bottle.",
    blood: "A fat round-bellied glass flask with a short neck and a cork stopper, filled to the shoulder with "
        + "thick glowing crimson liquid, a soft red light coming from inside it.",
    bark: "A squat heavy stoppered jar of thick green-brown liquid, its glass wrapped in a collar of birch "
        + "bark and bound with twine, with a knot of dark wood grain visible through the murk.",
    fury: "A stout glass bottle shaped like a clenched fist, filled with churning molten orange liquid that "
        + "throws sparks against the glass, its neck bound in a strip of red leather.",
    spark: "A small round jar of clear glass sealed with a brass cap, with a bright crackling arc of yellow "
        + "white lightning caught and turning inside it, lighting the glass from within.",
};

// ── THE TRINKETS ─────────────────────────────────────────────────────────────────────────────────────────────
// A relic is a KEPT OBJECT — it sits in the strip along the top of the screen for the rest of the run — so
// every one of these is drawn as a worn thing somebody carried, not as an icon of the effect it has.
const PERK_ART = {
    ember_heart: "A fist-sized heart carved from dark volcanic stone, cracked open down its middle with hot "
        + "orange embers glowing in the fissure, bound in a cradle of blackened iron wire.",
    whetstone: "A worn rectangular sharpening stone of grey grit, one long face rubbed into a shallow hollow "
        + "from years of use, resting against a small leather strop tied around it.",
    tin_shield: "A small battered round buckler of dull tin, dented across its face, with a domed rivet at its "
        + "centre and a leather strap curling behind it.",
    lucky_paw: "A dried rabbit's-foot charm on a knotted leather thong, its fur pale and worn smooth, capped "
        + "at the top with a tarnished silver band.",
    old_lantern: "A small dented brass hand lantern with cracked glass panes and a ring handle, one stub of "
        + "candle burning low inside it, throwing warm light through the cracks.",
    iron_ration: "A hard dark travel biscuit and a strip of dried meat bound together with twine in a scrap of "
        + "waxed cloth, plain and dense.",
    // ⚠️ THE ONE EVERY RUN OPENS HOLDING, AND IT HAD NO PICTURE. Warm Blood is the starter trinket — theirs is
    // Burning Blood, the relic the Ironclad never plays without — so it is on the strip at the top-left of the
    // map for the whole of every run, and it was rendering as a browser's torn-page glyph with the words
    // "Warm Blood" beside it. Nobody wrote its prompt, and the generator skips what it has no prompt for
    // SILENTLY, which is why a missing picture on the most-seen object in the game survived this long.
    warm_blood: "A small stoppered glass vial of dark red blood held in a cage of blackened iron straps, the "
        + "liquid inside lit from within by a slow ember glow, warm and alive rather than gory.",
};

const JOBS = [
    ...Object.values(POTIONS).map((p) => ({
        id: p.id, dir: "public/images/cards/potions", subject: POTION_ART[p.id],
        store: 256,
    })),
    ...Object.values(PERKS).map((k) => ({
        id: k.id, dir: "public/images/cards/items", subject: PERK_ART[k.id],
        store: 256,
    })),
];

const FORCE = process.argv.includes("--force");
const only = (() => { const i = process.argv.indexOf("--only"); return i > -1 ? new Set(process.argv[i + 1].split(",")) : null; })();

// ⚠️ AND IT SAYS SO, LOUDLY. A rule authored without art used to fall through this loop with one quiet line
// in the middle of the output; the thing it produces is a broken-image glyph on a live screen, which is worth
// a line at the END where the count is read.
const noPrompt = JOBS.filter((j) => !j.subject).map((j) => j.id);

let made = 0, skipped = 0, spent = 0;
for (const job of JOBS) {
    if (only && !only.has(job.id)) continue;
    if (!job.subject) { console.log(`  ${job.id.padEnd(12)} no prompt written — skipped`); continue; }
    fs.mkdirSync(job.dir, { recursive: true });
    const out = `${job.dir}/${job.id}.png`;
    if (fs.existsSync(out) && !FORCE) { skipped += 1; continue; }

    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
            model: "gpt-image-1", prompt: housePrompt(job.subject, { extra: SMALL }),
            size: "1024x1024", background: "transparent", output_format: "png", quality: "medium", n: 1,
        }),
    });
    if (!resp.ok) { console.log(`  ${job.id}: OpenAI ${resp.status} ${(await resp.text()).slice(0, 160)}`); continue; }
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) { console.log(`  ${job.id}: no image returned`); continue; }

    // Trimmed to the object, then stored at four times the size it is drawn — a 1MB flask behind a 64px
    // picture is bytes a phone fetches and nobody sees. `fit: inside` NOT `fill`: these are not all the same
    // proportion (a tall phial is not a round buckler) and stretching each one into a square is exactly how a
    // set of objects stops looking like a set of objects.
    const small = await sharp(Buffer.from(b64, "base64"))
        .trim({ threshold: 8 })
        .resize(job.store, job.store, { fit: "inside", withoutEnlargement: false })
        .png({ compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(out, small);
    made += 1;
    spent += 0.042;
    console.log(`  ${job.id.padEnd(12)} ${(small.length / 1024).toFixed(0)}kb`);
}

console.log(`\ndrew ${made}, skipped ${skipped} — about $${spent.toFixed(2)}`);
if (noPrompt.length) {
    console.log(`
⚠️  NO PROMPT WRITTEN, SO NO PICTURE DRAWN: ${noPrompt.join(", ")}`);
    console.log("   Each of these renders as a broken image wherever the game shows it. Add them to PERK_ART / POTION_ART.");
}
