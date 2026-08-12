// The Long Road's faces — one plate per house, plus a champion for the tenth of each. Twenty in total.
//
// The Road shipped with `sprite: /images/arena/ladder/<house>.webp` on every rung and nothing at that path, so
// a hundred opponents rendered as a hundred identical text tiles. It is the screen's whole problem: the fights
// underneath it are all different and none of that reaches the eye. A house plate covers the nine, a champion
// portrait marks the tenth, and that is enough for the road to read as ten places rather than one list —
// without paying for a hundred generations to say it.
//
// Usage:  node scripts/gen-ladder-portraits.mjs [key ...]     (no args = every missing one)
import fs from "node:fs";

import sharp from "sharp";

import { housePrompt } from "../src/lib/marketplace/art-style.js";
import "./lib/ai-trace.mjs"; // every OpenAI call in this script lands in the AI Costs history

// Read at 44px on a rung tile and ~74px on a house banner, so 256 covers the banner at 3× DPI. webp, because
// twenty full-size PNGs is ~36MB in the repo to render thumbnails.
const PX = 256;
const shrink = (buf) => sharp(buf)
    .resize(PX, PX, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 88 })
    .toBuffer();

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY in accounting_app/local.properties");

const OUT = "public/images/arena/ladder";
fs.mkdirSync(OUT, { recursive: true });

// Head-and-shoulders, facing the viewer — a rung is a PERSON you are walking up to, not a foe charging the
// plaza, so this is deliberately a portrait rather than the full-body ready stance the town raiders use.
const POSE = "Head and shoulders portrait, facing the viewer, chest and up only, centred.";

const ART = {
    // ── THE YARD ── behind the tavern, for coin and pride. Nobody here is a professional.
    yard: "A scrappy working-class brawler in a patched linen shirt with rolled sleeves and rag-wrapped knuckles, a split lip and a crooked grin",
    "yard-champion": "Crooked Jem, king of the tavern yard — a broad-shouldered bare-knuckle fighter with a flattened nose and a gold tooth, a filthy prize sash over one shoulder",
    // ── THE WATCH ── paid to stop you, and good at it. Municipal, disciplined, blue steel.
    watch: "A city watchman in a blue tabard over polished mail, a steel kettle helm with a nose guard, jaw set, entirely unimpressed",
    "watch-champion": "The Captain of the Watch — a grizzled officer in ornate blue-enamelled plate with a white plume, an old scar across the brow, halberd shaft visible at the shoulder",
    // ── THE PIT ── they do this for a living, and they enjoy it. Sand, straps, showmanship.
    pit: "A professional pit fighter in a leather harness and a single spiked pauldron, sand and old blood on the skin, a wolfish grin",
    "pit-champion": "The Pit's undefeated champion — a huge arena gladiator in a snarling bronze beast-mask helm and heavy orange-strapped armour, arms crossed",
    // ── THE WOOD ── nobody sees them until it is decided. Green, quiet, hooded.
    wood: "A silent forest hunter in a moss-green hood and bark-textured leathers, face half-shadowed, a single hawk feather at the temple",
    "wood-champion": "The Wood's master hunter — a tall cloaked figure crowned with antlers, glowing green eyes in the shadow of the hood, ivy growing across the shoulder guards",
    // ── THE DEEP ── whatever the mine did not want. Pale, subterranean, wrong.
    deep: "A pallid underground digger in a grimy canvas hood with a guttering candle strapped to the brow, colourless eyes far too wide",
    "deep-champion": "The thing from the lowest seam — a hunched pale horror in shredded mining rags, violet crystal growing out through its shoulder and jaw, eyeless",
    // ── THE TIDE ── came up the beach and did not leave. Soaked, encrusted, teal.
    tide: "A waterlogged drowned sailor in rotted teal oilskins, seaweed in the hair, barnacles crusting one cheek, water still running off",
    "tide-champion": "The Undertow — a towering drowned figure in a barnacled greatcoat, a crown of coral and fishbone, sea water pouring endlessly from the sleeves",
    // ── THE HALL ── old money, older grudges, sharpest steel. Gilt and duelling silks.
    hall: "A noble duellist in a fine gold-trimmed doublet and a high starched collar, one white duelling glove raised, cold and amused",
    "hall-champion": "The Master of Arms — an ageing aristocratic swordmaster in gilded ceremonial half-plate and a fur-trimmed cloak, silver hair, a duelling scar down one cheek",
    // ── THE ASH ── what the forge made and could not unmake. Molten, cracked, orange.
    ash: "A forge-burned smith in a scorched leather apron and cracked iron mask, embers glowing in the seams of the skin, heat shimmer around the shoulders",
    "ash-champion": "The Emberwright — a colossal armoured figure of blackened iron and cooling lava, molten orange light pouring out through the cracks in its chest and helm",
    // ── THE VEIL ── it is not clear these are people. Violet, indistinct, missing pieces.
    veil: "A half-there figure in drifting grey funeral silks, the face blurred and smeared away as if half-remembered, violet light where the eyes should be",
    "veil-champion": "The Long Hour — a tall faceless apparition in a violet-black shroud, a smooth blank mask where the face belongs, dozens of pale hands reaching from the folds of the robe",
    // ── THE CROWN ── the last ten. They are not sport.
    crown: "A legendary champion in immaculate gold-filigreed plate armour, a closed helm with a narrow visor slit, a tattered banner-cape at the shoulder",
    "crown-champion": "The Old Wolf — the Den's greatest champion, a scarred veteran warlord in black and gold masterwork armour with a snarling wolf-head pauldron and a heavy fur mantle, one eye lost, utterly calm",
};

async function generate(prompt) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const res = await fetch("https://api.openai.com/v1/images/generations", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
                body: JSON.stringify({
                    model: "gpt-image-1", prompt, n: 1, size: "1024x1024",
                    quality: "medium", background: "transparent", output_format: "png",
                }),
            });
            const json = await res.json();
            const b64 = json?.data?.[0]?.b64_json;
            if (!b64) throw new Error(json?.error?.message || "no image");
            return Buffer.from(b64, "base64");
        } catch (e) {
            if (attempt === 3) throw e;
            await new Promise((r) => setTimeout(r, 4000 * attempt));
        }
    }
    return null;
}

const want = process.argv.slice(2);
const todo = Object.keys(ART).filter((k) => (want.length ? want.includes(k) : !fs.existsSync(`${OUT}/${k}.webp`)));
if (!todo.length) { console.log("nothing to do"); process.exit(0); }
console.log(`generating ${todo.length} at medium (~$${(todo.length * 0.042).toFixed(2)}): ${todo.join(", ")}`);

const queue = [...todo];
let done = 0; const failed = [];
await Promise.all(Array.from({ length: 3 }, async () => {
    for (let k = queue.shift(); k; k = queue.shift()) {
        try {
            const buf = await generate(housePrompt(ART[k], { extra: POSE }));
            fs.writeFileSync(`${OUT}/${k}.webp`, await shrink(buf));
            done += 1;
            console.log(`✓ ${k}`);
        } catch (e) { failed.push(k); console.log(`✗ ${k}: ${e.message}`); }
    }
}));
console.log(`\nDONE — ${done}/${todo.length}`);
if (failed.length) { console.log(`FAILED: ${failed.join(", ")}`); process.exit(1); }
