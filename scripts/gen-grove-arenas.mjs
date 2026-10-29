// ── THE SEVEN COLISEUM FLOORS ────────────────────────────────────────────────────────────────────────────────
// Luke: "you'll have to generate the different Colosseums platforming levels... each Coliseum will be a little
// different in terms of where the platform locations are, but for the most part it's a pretty easily
// traversable scene."
//
// The LAYOUT is authored data in grove-arena.js. This draws the room it happens in.
//
// ⚠️ THE PLATE DOES NOT PAINT THE PLATFORMS. Ledges are the existing 3-slice slabs drawn over the top, so a
// backdrop with shelves painted into it would show two sets of ledges that do not line up — one real and one
// a picture. The plate paints the PLACE: walls, stands, floor, light.
//
// ⚠️ AND IT IS FLAT, NOT RECEDING. Every other backdrop generator here asks for deep perspective, which is
// right for a room you stand in and wrong for a side-on platformer. A vanishing point is only correct from
// one camera position.
//
//   node scripts/gen-grove-arenas.mjs                 # price it and stop
//   node scripts/gen-grove-arenas.mjs --apply --only 1,2,3
import fs from "node:fs";
import path from "node:path";
import { register } from "node:module";

register("./lib/app-loader.mjs", import.meta.url);

import { quality, priceRun } from "./lib/gen-guard.mjs";

const { IMAGE_MODEL } = await import("@/lib/marketplace/image-model.js");
const { NEGATIVE_STYLE, HOUSE_STYLE } = await import("@/lib/marketplace/art-style.js");

const Q = quality();
const SIZE = "1536x1024";
const OUT = "public/images/grove";
const APPLY = process.argv.includes("--apply");
const ONLY = (process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : "")
    .split(",").map((s) => s.trim()).filter(Boolean);

const KEY = (() => {
    const lp = "C:/Users/Luke/Projects/accounting_app/local.properties";
    const line = fs.readFileSync(lp, "utf8").split(/\r?\n/).find((l) => l.startsWith("OPENAI_API_KEY="));
    return line ? line.slice("OPENAI_API_KEY=".length).trim() : process.env.OPENAI_API_KEY;
})();

// Each arena is a fighting pit built BY the people of that map, out of what that map has. That is what makes
// seven rooms rather than one room repainted.
const ARENAS = {
    1: { id: "rootwood", what: "a fighting ring worn into a forest clearing, ringed by vast mossy roots used as seating, rope banners strung between trunks, warm dappled light from a canopy far above" },
    2: { id: "undercave", what: "a cavern pit under tree roots, tiered stone ledges packed with watchers lost in shadow, pale bioluminescent fungus lighting the floor, dripping wet rock" },
    3: { id: "fen", what: "a drained bog pit walled with stacked reed bundles and black bog-oak posts, standing brown water at the edges, low grey mist, lanterns on poles" },
    4: { id: "saltwrack", what: "an arena built inside a wrecked ship's ribcage on a storm coast, bleached hull timbers as walls, fishing net strung overhead, grey surf behind" },
    5: { id: "drowned", what: "a flooded stone amphitheatre, broken columns, carved sunken reliefs, ankle-deep green water catching the light, shafts of sun from a collapsed roof" },
    6: { id: "gilded", what: "a sand pit ringed by bleached bone and gold-coloured dunes, tattered sun-awnings on poles, hard white desert light, glass glinting in the sand" },
    7: { id: "ashen", what: "a fighting pit in burned black country, cracked ground with live orange embers in the seams, charred standing stones as walls, drifting ash, red sky" },
};

const prompt = (a) => `A side-on game backdrop: ${a.what}.
FLAT, LAYERED, SIDE-SCROLLING PLATE — no vanishing point, no deep perspective receding into the distance. The
camera looks straight at the wall of the pit.
Leave the lower third as open, uncluttered FLOOR a character can stand and fight on.
Do NOT draw any platforms, shelves, ledges or walkways — those are added separately and would double up.
No characters, no creatures, no people in the ring.
${HOUSE_STYLE}
${NEGATIVE_STYLE}`;

const TARGETS = Object.entries(ARENAS).filter(([n]) => !ONLY.length || ONLY.includes(n));

const bill = priceRun({ count: TARGETS.length, size: SIZE, quality: Q });
console.log(`${TARGETS.length} arenas · ${SIZE} · ${Q} · ${IMAGE_MODEL}`);
console.log(`estimated ${typeof bill === "number" ? `$${bill.toFixed(2)}` : bill}`);
if (!APPLY) { console.log("\nnothing drawn. --apply to draw."); process.exit(0); }
if (!KEY) { console.error("no OPENAI_API_KEY"); process.exit(1); }

fs.mkdirSync(OUT, { recursive: true });
let n = 0;
for (const [map, a] of TARGETS) {
    const dest = path.join(OUT, `arena-${a.id}.webp`);
    process.stdout.write(`  map ${map} ${a.id.padEnd(12)} `);
    const r = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
        // A backdrop is OPAQUE on purpose — it is the room, not a cut-out.
        body: JSON.stringify({
            model: IMAGE_MODEL, prompt: prompt(a), size: SIZE, quality: Q, n: 1,
            background: "opaque", output_format: "webp",
        }),
    });
    const j = await r.json();
    if (!r.ok) { console.log(`FAILED ${j?.error?.message || r.status}`); continue; }
    const b64 = j.data?.[0]?.b64_json;
    if (!b64) { console.log("no image back"); continue; }
    const sharp = (await import("sharp")).default;
    await sharp(Buffer.from(b64, "base64")).webp({ quality: 90 }).toFile(dest);
    n += 1;
    console.log(`→ ${dest}`);
}
console.log(`\ndrew ${n}/${TARGETS.length}`);
