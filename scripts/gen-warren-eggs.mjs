// THE WARREN'S EGGS — one per room, and each one has to look better than the last.
//
// Luke, with a photo of the machine he wants this to feel like: "I want to like this where you can see the
// eggs and they look cooler as each stage progresses so we'd actually have to generate Sprites for these
// eggs."
//
// He is right that this cannot be reused art. The whole ladder is carried by the board: a player two rooms
// down has to be able to SEE that the eggs in front of them are worth more than the ones upstairs, before
// they have opened anything or read a number. Nothing in the Den's pools is a set of five escalating eggs,
// and faking it by tinting one egg five ways reads as a tinted egg five ways.
//
// So: five eggs plus the Hoard's dome. Written as five distinct OBJECTS rather than five adjectives —
// "cracked with magma in the seams" survives being 74px on a phone, "fancier" does not. They climb in
// material as well as in colour, because material is what the eye reads as value: mud, then shell, then
// stone, then crystal, then gold.
//
// Run:  node scripts/gen-warren-eggs.mjs [--force] [--only ember,astral]
import fs from "node:fs";
import sharp from "sharp";
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/casino/warren";
fs.mkdirSync(OUT, { recursive: true });

const HOUSE = "Painterly cel-shaded 2D fantasy game-sprite art, bold dark INK CONTOUR outlines, rich "
    + "saturated colour, warm torchlit medieval palette, chunky readable silhouette, storybook RPG style.";
const DIE_CUT = "A SINGLE object, centred, drawn ENTIRELY INSIDE the frame with clear empty space on all four "
    + "sides. NO part may touch or run off any edge; draw it SMALLER rather than cropped. ISOLATED as a clean "
    + "die-cut sprite on a FULLY TRANSPARENT background (alpha channel) — NO backdrop, NO scenery, NO ground, "
    + "NO cast shadow, NO glow halo, NO white sticker rim, NO circular badge or frame behind it.";
const NEGATIVE = "No text, no words, no letters, no numbers, no signage, no logo, no watermark, no border.";

// Upright egg shape held constant across all five so the board reads as one set — what changes is the
// material, and the material is the whole message.
const EGGS = {
    hollow: "a plain speckled brown burrow egg, matte earthy shell flecked with darker brown spots, a few "
        + "green moss patches and one small pale root curled around its base",
    sunken: "a pale blue-green egg with a wet pearlescent shell, encrusted with small white barnacles and a "
        + "band of dark seaweed wrapped around its middle, faint mother-of-pearl sheen",
    ember: "a dark charcoal-black stone egg split by glowing molten cracks, bright orange and yellow magma "
        + "seams running down the shell, faint heat glow inside the fissures, small embers at its base",
    astral: "a deep indigo crystal egg with a starfield visible inside it, glowing pale violet constellation "
        + "lines etched across the shell, tiny white stars sparkling within the translucent crystal",
    kinghoard: "an ornate golden egg wrapped in engraved gold filigree bands, set with three large cut "
        + "gemstones — one ruby, one emerald, one sapphire — polished gleaming precious metal, jewelled and regal",
};

// ── THE HOARD'S THREE ────────────────────────────────────────────────────────────────────────────────────────
// The reference machine ends on three colossal onion domes filling the whole screen — "pick a dome". Luke:
// "the dome actually a big thing full screen and it needs to look amazing. we wouldnt use a dome but
// something more theme appropriate."
//
// Domes are Russian architecture; five rooms down a wolf warren there is no architecture at all. GEODES are
// the answer: they are the one object that is enormous, obviously full of treasure, and belongs in deep rock
// — and the Den already runs on cut gems (the Jewelcutter, the Vault's whole symbol ladder), so a wall of
// crystal reads as money here without anything having to say so.
//
// Three of them, drawn BIG rather than as icons: these render most of a phone screen tall, so unlike the
// eggs they can carry real detail, and they should. Each is a different stone so the three read as a choice
// rather than as one object repeated.
const GEODES = {
    "geode-amethyst": "a colossal cracked-open geode boulder, its hollow interior packed with enormous "
        + "violet amethyst crystals catching the light, rough grey stone rind on the outside, deep purple "
        + "inner glow, a few loose gems and gold coins spilled at its base",
    "geode-emerald": "a colossal cracked-open geode boulder, its hollow interior packed with enormous "
        + "brilliant green emerald crystals, rough mossy grey stone rind on the outside, deep green inner "
        + "glow, a few loose gems and gold coins spilled at its base",
    "geode-ruby": "a colossal cracked-open geode boulder, its hollow interior packed with enormous glowing "
        + "crimson ruby crystals, rough dark stone rind on the outside, hot red inner glow, a few loose gems "
        + "and gold coins spilled at its base",
};

const only = (() => { const i = process.argv.indexOf("--only"); return i > -1 ? new Set(process.argv[i + 1].split(",")) : null; })();
const FORCE = process.argv.includes("--force");

let made = 0, skipped = 0;
for (const [id, subject] of Object.entries({ ...EGGS, ...GEODES })) {
    if (only && !only.has(id)) continue;
    const dest = `${OUT}/${id}.png`;
    if (fs.existsSync(dest) && !FORCE) { skipped += 1; continue; }
    const big = id.startsWith("geode-");
    // The eggs are 74px and must survive it — few shapes, no detail. The geodes fill most of a phone, so
    // the opposite note applies: they get to be intricate, and they should be.
    const shape = big ? "" : "Upright egg shape, wider at the bottom, seen straight on. ";
    const scale = big
        ? "Renders LARGE, roughly 300 pixels tall — rich detail, many facets, dramatic interior light."
        : "Must read clearly at 74 pixels tall — strong outline, few large shapes, no fine detail.";
    const prompt = `${subject}. ${shape}${DIE_CUT} ${HOUSE} ${scale} ${NEGATIVE}`;
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", background: "transparent", output_format: "png", quality: "medium", n: 1 }),
    });
    if (!resp.ok) { console.log(`  ${id}: OpenAI ${resp.status} ${(await resp.text()).slice(0, 140)}`); continue; }
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) { console.log(`  ${id}: no image returned`); continue; }
    // Trimmed first so every egg fills its box identically — one arriving with baked-in margin renders
    // visibly smaller than its neighbours in a wall of fifteen, which reads as a broken sprite.
    const buf = await sharp(Buffer.from(b64, "base64"))
        .trim({ threshold: 6 })
        .resize(big ? 640 : 256, big ? 640 : 256, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(dest, buf);
    made += 1;
    console.log(`  ${id.padEnd(12)} ${(buf.length / 1024).toFixed(0)}kb`);
}
console.log(`\ndrew ${made}, skipped ${skipped} (already on disk; --force to redraw)`);
