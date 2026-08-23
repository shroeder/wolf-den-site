// THE MASTHEAD OVER EACH CABINET.
//
// Luke, with a photo of a real machine's base game: "need this level of detail and art and dopamine."
//
// The framing of the symbols was the biggest gap and that is fixed in CSS. This is the second one, and it is
// the difference between a screen with reels on it and a MACHINE: every cabinet on a floor has a painted
// masthead above the glass — a scene, a logo, scrollwork — and ours had a gold gradient bar with the name set
// in it. A banner is the cheapest way to make five machines feel like five different machines rather than one
// component rendered five times.
//
// Wide and shallow on purpose: it sits at roughly 330x64 above the reels, so these are composed as friezes —
// a strong centre with the world of the cabinet running out to both edges — and NOT as square pictures that
// get cropped to a letterbox.
//
// Run:  node scripts/gen-slot-mastheads.mjs [--force] [--only slot,slot3]
import fs from "node:fs";
import sharp from "sharp";
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/casino/mast";
fs.mkdirSync(OUT, { recursive: true });

const HOUSE = "Painterly cel-shaded 2D fantasy game art, bold dark ink contour outlines, rich saturated "
    + "colour, warm torchlit medieval palette, storybook RPG style, ornate carved gold scrollwork framing.";
const SHAPE = "A WIDE SHALLOW BANNER FRIEZE, roughly 5:1 letterbox proportions, composed to be read at a "
    + "glance across its full width. Strong central focal object with the scene running out to BOTH left and "
    + "right edges. Dark at the far left and far right edges so text can sit over them.";
const NEGATIVE = "No text, no words, no letters, no numbers, no signage, no logo, no watermark.";

const MASTS = {
    slot: "a moonlit pine forest at night with a great grey wolf's head in profile at the centre, silver "
        + "moon behind it, dark conifers running out to both sides, carved gold scrollwork along the top edge",
    slot2: "a harvest larder at night, a lit copper cauldron at the centre with steam rising, hanging bundles "
        + "of grain and preserve jars along a beam running out to both sides, warm amber lantern light",
    slot3: "a deep undersea trench, an enormous kraken eye and coiling tentacle at the centre, shafts of "
        + "cold blue light from far above, sunken timbers and coral running out to both sides",
    slot4: "a menagerie under a night sky, a rainbow chameleon and a cyan spirit fox flanking a lit lantern "
        + "at the centre, ornate cages and hanging vines running out to both sides, violet and teal light",
    slot5: "a great vault door of blued steel and gold at the centre, half open with treasure light spilling "
        + "out, cut gemstones set into stone walls running out to both sides, cold blue and gold light",
};

const only = (() => { const i = process.argv.indexOf("--only"); return i > -1 ? new Set(process.argv[i + 1].split(",")) : null; })();
const FORCE = process.argv.includes("--force");

let made = 0, skipped = 0;
for (const [id, subject] of Object.entries(MASTS)) {
    if (only && !only.has(id)) continue;
    const dest = `${OUT}/${id}.webp`;
    if (fs.existsSync(dest) && !FORCE) { skipped += 1; continue; }
    const prompt = `${subject}. ${SHAPE} ${HOUSE} ${NEGATIVE}`;
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1536x1024", output_format: "png", quality: "medium", n: 1 }),
    });
    if (!resp.ok) { console.log(`  ${id}: OpenAI ${resp.status} ${(await resp.text()).slice(0, 140)}`); continue; }
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) { console.log(`  ${id}: no image returned`); continue; }
    // Cropped to the letterbox from the MIDDLE of the frame — the model composes a 3:2 and the banner wants
    // the central band of it, so taking the whole height and squashing would flatten every face in it.
    const img = sharp(Buffer.from(b64, "base64"));
    const { width, height } = await img.metadata();
    const band = Math.round(width / 4.6);
    const buf = await img
        .extract({ left: 0, top: Math.round((height - band) / 2), width, height: band })
        .resize(920, 200, { fit: "cover" })
        .webp({ quality: 82 }).toBuffer();
    fs.writeFileSync(dest, buf);
    made += 1;
    console.log(`  ${id.padEnd(8)} ${(buf.length / 1024).toFixed(0)}kb`);
}
console.log(`\ndrew ${made}, skipped ${skipped} (already on disk; --force to redraw)`);
