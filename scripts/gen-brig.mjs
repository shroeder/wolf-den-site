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
        subject: "The inside of a ship's brig below decks, seen straight on: a back wall of heavy dark "
            + "timber planks with iron bolts, damp streaks and old scratches, a low curved deck beam "
            + "overhead, scattered straw on the floor, a tin cup and a rumpled blanket pushed into the "
            + "left corner, a heavy iron ring bolted low on the right wall with a slack chain. Lit warm "
            + "and dim from the upper left as if by a single lantern just out of frame, everything else "
            + "falling into deep shadow. The MIDDLE of the wall is bare and unobstructed. No people, no "
            + "figures, no bars",
    },
    // IN FRONT of him. Vertical iron, mostly empty so the man reads through it.
    bars: {
        size: "1024x1024", transparent: true,
        subject: "A row of seven thick vertical iron prison bars running from the top of the frame to the "
            + "bottom, evenly spaced with wide gaps between them, pitted rusted black iron with warm "
            + "highlights down their left edges, one horizontal iron cross-brace low across them. Only "
            + "the bars themselves — the gaps between them are EMPTY and fully transparent. No wall, no "
            + "floor, no background, no door, no lock, no figures",
    },
    // The light source, drawn as its own object so it can flicker and gutter down.
    lantern: {
        size: "1024x1024", transparent: true,
        subject: "An old ship's lantern hanging from a short iron hook: dented brass frame, four smoked "
            + "glass panes, a warm flame burning inside, a small ring at the top. Seen from the side, "
            + "isolated on transparency",
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
