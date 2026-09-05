// ── ONE ROOM PER ACT TO FIGHT IN ─────────────────────────────────────────────────────────────────────────
// Luke, on the three acts: "how is enemy variety between acts? New backgrounds?" There was one arena and it
// stood behind every fight in the game — so act two was act one with bigger numbers, and the screen said so.
//
// Spire changes the room under you at every act and it is most of why the acts FEEL different before you have
// read a single enemy: the Exordium is dungeon brick, the City is masonry and banners, the Beyond is void and
// bone. Ours: The Sand is the arena we already had, The Deep is drowned stone, The Spire is ember and iron.
//
// PORTRAIT, because the fight is a phone screen: 1024x1536 drawn, stored at 768x1152 like the arena that came
// before it — a wall that fills the top two thirds and a floor the fighters stand on, with the floor line at
// roughly the same height in all three so the same layout math holds. See the note on --cf-floor in
// CardFightClient: the fighters are placed against that line, so moving it moves everybody.
//
// Run:  node scripts/gen-card-scenes.mjs [--force] [--only deep]
import fs from "node:fs";
import sharp from "sharp";
import { housePrompt } from "../src/lib/marketplace/art-style.js";
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

// The three rules the arena already follows, and the reason the fighters land on the floor in all of them.
const SCENE = "A WIDE EMPTY ROOM seen straight on, side-scroller style, with NOBODY in it: the wall fills the "
    + "top two thirds and a flat open floor runs across the bottom third, the line where they meet sitting a "
    + "little above the middle of the lower half. Nothing in the foreground, nothing standing on the floor, "
    + "no props at the bottom edge — characters are placed on top of this by the game. Lit from one side, "
    + "deep shadow in the corners, everything slightly out of focus so a bright sprite reads in front of it. "
    + "No text, no watermark, no border, no UI.";

const SCENES = {
    deep: {
        out: "public/images/cards/scene-deep.webp",
        subject: "A drowned stone hall far under the sea: massive green-black basalt blocks streaked with "
            + "salt and barnacles, a broken archway, thick kelp hanging from a collapsed ceiling, shafts of "
            + "cold blue-green light falling through the water from somewhere far above, and a wet dark "
            + "stone floor with shallow standing water pooled across it.",
    },
    spire: {
        out: "public/images/cards/scene-spire.webp",
        subject: "The inside of a great iron forge-tower: black riveted iron plating and cracked firebrick "
            + "walls with molten orange light bleeding out of the seams, heavy chains hanging down out of the "
            + "dark, a huge banked furnace glowing deep red far back in the gloom, and a scorched iron floor "
            + "streaked with ash.",
    },
};

const FORCE = process.argv.includes("--force");
const only = (() => { const i = process.argv.indexOf("--only"); return i > -1 ? new Set(process.argv[i + 1].split(",")) : null; })();

let made = 0, spent = 0;
for (const [id, scene] of Object.entries(SCENES)) {
    if (only && !only.has(id)) continue;
    if (fs.existsSync(scene.out) && !FORCE) { console.log(`  ${id.padEnd(7)} exists — skipped`); continue; }
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
            model: "gpt-image-1", prompt: housePrompt(scene.subject, { framing: "scene", extra: SCENE }),
            size: "1024x1536", background: "opaque", output_format: "png", quality: "medium", n: 1,
        }),
    });
    if (!resp.ok) { console.log(`  ${id}: OpenAI ${resp.status} ${(await resp.text()).slice(0, 160)}`); continue; }
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) { console.log(`  ${id}: no image returned`); continue; }
    // Stored at the arena's own size and format: it is the same layer in the same layout.
    const out = await sharp(Buffer.from(b64, "base64")).resize(768, 1152, { fit: "cover" })
        .webp({ quality: 88, effort: 5 }).toBuffer();
    fs.writeFileSync(scene.out, out);
    made += 1;
    spent += 0.063;
    console.log(`  ${id.padEnd(7)} ${(out.length / 1024).toFixed(0)}kb → ${scene.out}`);
}
console.log(`\ndrew ${made} — about $${spent.toFixed(2)}`);
