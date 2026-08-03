// Sprites for the 16 consumables that never had one.
//
// Every consumable is meant to show its own painted art; the ones without a row in mkt_consumable_sprite fall
// back to a generic teal potion. That is why a Fertilizer Crate came out of the mine looking like a bottle of
// mystery liquid — and why two of them in one haul looked like the same thing twice.
//
// Usage: node scripts/gen-consumable-sprites.mjs [id …]   (no args = every consumable missing art)
//
// House rule: never ask for outlines-as-rims, sticker edges or drop shadows — they bake a white halo into the
// cutout. Bold INK CONTOUR is the wanted look. And nothing that invites lettering: a labelled bottle or an
// unfurled scroll comes back with misspelled words printed on it.
import fs from "node:fs";
import sharp from "sharp";
import { neon } from "@neondatabase/serverless";
import { put } from "@vercel/blob";
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const OPENAI_KEY = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
const env = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
const DB_URL = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim().replace(/^"|"$/g, "");
const BLOB_TOKEN = env.match(/^BLOB_READ_WRITE_TOKEN=(.+)$/m)?.[1]?.trim().replace(/^"|"$/g, "");
if (!OPENAI_KEY) throw new Error("no OPENAI_API_KEY");
if (!DB_URL) throw new Error("no DATABASE_URL");
if (!BLOB_TOKEN) throw new Error("no BLOB_READ_WRITE_TOKEN");
const sql = neon(DB_URL);

const BASE =
    "cel-shaded cartoon game asset, bold clean dark ink contours and rich saturated color, mobile RPG art style, "
    + "ONE single object, centered, shown ENTIRELY within the frame with generous empty margin on all four sides, "
    + "nothing cropped or touching any edge, three-quarter view, polished and glossy, "
    + "absolutely NO text, NO letters, NO words, NO numbers, NO labels, NO writing of any kind anywhere, "
    + "fully TRANSPARENT background — no ground, no scene, no shadow, no border, no sticker edge.";

// Each one described as an OBJECT, not by its effect — "a crate of fertilizer" reads at 40px, "your next five
// harvests roll better" does not.
const SUBJECTS = {
    forge_power_scroll: "A tightly ROLLED scroll of cream parchment bound with a glowing orange cord, faint sparks rising from its ends. Completely rolled — no flat face, no writing surface",
    forge_enchant_scroll: "A tightly ROLLED violet-tinged scroll bound with a silver cord set with a small glowing purple gem, motes of magic drifting off it. Completely rolled — no flat face",
    sail_war_drum: "A squat wooden WAR DRUM with taut hide, iron banding and rope lacing, two carved beaters resting across the top",
    sail_treasure_map: "A rolled and weathered pirate MAP tied with twine, one corner curled to show a scrap of coastline and a small red X — only a coastline squiggle and the X, no lettering",
    sail_lucky_lure: "An ornate FISHING LURE — polished silver spoon blade, a bright feather tuft and a tiny four-leaf clover charm on the ring",
    sail_storm_bottle: "A corked glass BOTTLE with a tiny thundercloud swirling inside it, faint lightning flickering behind the glass, sea-grey and electric blue",
    sail_kraken_bait: "A hunk of glistening dark bait on a heavy iron hook, purple ink smeared across it, a few small tentacle scraps clinging on",
    farm_growth_tonic: "A round glass FLASK of bright green tonic with a cork stopper, a tiny seedling sprouting from the liquid inside, warm sunlight through the glass",
    farm_harvest_charm: "A rustic braided-straw CHARM in a circle, bound with red thread and hung with three golden wheat ears and a small brass bell",
    farm_fertilizer_crate: "A small wooden CRATE with slatted sides, packed with rich dark soil and pellets, a garden trowel stuck in the top and a green shoot poking out",
    farm_fertilizer_haul: "A large overflowing wooden CRATE of dark fertile soil and pellets, a burlap sack slumped against its side spilling more, clearly a big load",
    farm_pet_whistle: "A small brass PET WHISTLE on a red braided cord, polished and gleaming, a tiny paw print embossed on its side",
    farm_kindness_token: "A warm gold COIN-LIKE TOKEN stamped with a simple heart in relief, softly glowing, a sprig of green ribbon tied through a hole at its top",
    sail_tailwind_charm: "A carved pale-wood wind CHARM shaped like a curling gust, hung with three small silver bells and a white feather, wisps of air curling around it",
    sail_prospectors_charm: "A weathered brass PROSPECTOR'S CHARM — a tiny crossed pick and pan on a leather thong, with a small raw gold nugget wired to it",
    sail_raiding_horn: "A curved ox HORN banded with dark iron and bound in leather cord, a war-worn drinking-and-signalling horn",
};

const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const rows = await sql`SELECT consumable_id FROM mkt_consumable_sprite`;
const have = new Set(rows.map((r) => r.consumable_id));
const todo = (only.length ? only : Object.keys(SUBJECTS)).filter((id) => only.length || !have.has(id));

console.log(`Generating ${todo.length} consumable sprite(s)…`);
const shrink = (buf) => sharp(buf).resize(256, 256, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 }).toBuffer();

for (const id of todo) {
    const subject = SUBJECTS[id];
    if (!subject) { console.log(`  skip ${id} — no subject written`); continue; }
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({ model: "gpt-image-1", prompt: `${subject}. ${BASE}`, size: "1024x1024", background: "transparent", output_format: "png", quality: "low", n: 1 }),
    });
    if (!resp.ok) { console.log(`  FAILED ${id}: ${resp.status} ${(await resp.text()).slice(0, 140)}`); continue; }
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) { console.log(`  FAILED ${id}: no image`); continue; }
    const png = await shrink(Buffer.from(b64, "base64"));
    const blob = await put(`marketplace/consumables/${id}-${Date.now()}.png`, png, {
        access: "public", token: BLOB_TOKEN, contentType: "image/png",
    });
    await sql`INSERT INTO mkt_consumable_sprite (consumable_id, url) VALUES (${id}, ${blob.url})
              ON CONFLICT (consumable_id) DO UPDATE SET url = EXCLUDED.url`;
    console.log(`  ✓ ${id}`);
}
console.log("done");
