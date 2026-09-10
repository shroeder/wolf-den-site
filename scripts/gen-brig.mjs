// ── THE ROOM THE BRIG IS IN ──────────────────────────────────────────────────────────────────────────
// Two layers, not one, because the captain has to stand INSIDE the cell rather than in front of a
// picture of one. The back wall goes behind him and the bars go in front, so the depth is real and the
// iron actually crosses him. A single flat backdrop reads as a poster with a man taped to it.
//   node scripts/gen-brig.mjs [--force]
import fs from "node:fs";
import sharp from "sharp";
import { housePrompt } from "../src/lib/marketplace/art-style.js";

const props = fs.readFileSync("../accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");
const OUT = "public/images/sailing/brig";
fs.mkdirSync(OUT, { recursive: true });
const FORCE = process.argv.includes("--force");

const PIECES = {
    // BEHIND him. Deliberately empty in the middle third — that is where a man is going to be standing.
    room: {
        size: "1024x1024", transparent: false,
        // ⚠️ "EVERY SURFACE IS TIMBER" IS LOAD-BEARING. The first draft came back with a band of brick
        // across the top of the wall, which reads as a cellar rather than as somewhere below a waterline.
        subject: "The inside of a wooden ship's brig below decks, seen straight on: a back wall built "
            + "entirely of heavy dark horizontal timber planks with iron bolts, damp streaks and old "
            + "scratches, curved wooden deck beams overhead, a plank floor with scattered straw, a tin "
            + "cup and a rumpled blanket pushed into the left corner, a heavy iron ring bolted low on "
            + "the right wall with a slack chain. EVERY surface is ship timber — there is no brick, no "
            + "stone, no masonry and no plaster anywhere in the image. Lit warm and dim from the upper "
            + "left as if by a single lantern just out of frame, everything else falling into deep "
            + "shadow. The MIDDLE of the wall is bare and unobstructed. No people, no figures, no bars",
    },
    // ⚠️ THERE IS NO `bars` PIECE AND THERE MUST NOT BE ONE. The iron is drawn in CSS (see Brig.js) so
    // it is full-bleed at any width and crisp at any density. It was attempted here once and gpt-image-1
    // returned a horned ogre, because DIE_CUT asks for a single centred subject touching no edge and a
    // prison bar is the exact opposite of that. Re-adding it would also mean --force quietly recreating a
    // 2MB file nothing loads.
    // The light source, drawn as its own object so it can flicker and gutter down.
    lantern: {
        size: "1024x1024", transparent: true,
        // The room is lit BY this thing, so it has to look like the source of that light: warm metal and a
        // real flame. A reroll came back pale pewter and instantly read as a stone lamp in a wooden room.
        subject: "An old ship's lantern hanging from a short iron hook: a dented POLISHED BRASS frame in "
            + "deep warm gold, four smoked glass panes lit from within by a strong orange flame, the "
            + "brass catching that firelight along every edge, a small ring at the top. Warm, glowing and "
            + "unmistakably the source of a room's light. Seen from the side, isolated on transparency",
    },
};

let spent = 0;
for (const [id, p] of Object.entries(PIECES)) {
    const dest = `${OUT}/${id}.png`;
    if (fs.existsSync(dest) && !FORCE) { console.log(`  ${id}: already drawn`); continue; }
    const body = {
        model: "gpt-image-1", prompt: housePrompt(p.subject, { framing: p.transparent ? "sprite" : "scene" }),
        size: p.size, output_format: "png", quality: "medium", n: 1,
    };
    if (p.transparent) body.background = "transparent";
    const r = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
    });
    if (!r.ok) { console.log(`  ${id}: OpenAI ${r.status} ${(await r.text()).slice(0, 160)}`); continue; }
    const j = await r.json();
    const png = await sharp(Buffer.from(j.data[0].b64_json, "base64")).png({ compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(dest, png);
    spent += 0.04;
    console.log(`  ${id}: ${Math.round(png.length / 1024)}kb`);
}
console.log(`\nabout $${spent.toFixed(2)}`);
