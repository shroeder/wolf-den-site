// The town's VOTING BOOTH — the plaza fixture where the Den decides who goes in the stockade.
//
// Jinxx's idea. It shipped first as a stack of CSS rectangles, which was the right call for getting the
// mechanic live and the wrong thing to leave standing in a square where every other fixture is painted.
//
// Drawn through housePrompt so it matches the merchant, the smith and the stockade rather than looking like
// a different game's asset — same ink weight, same palette, same die-cut contract.
import fs from "node:fs";
import sharp from "sharp";
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/town";
fs.mkdirSync(OUT, { recursive: true });

// housePrompt lives in the app and imports app paths, so the two style blocks are inlined here the same way
// the other standalone generators do it — one place to read, no bundler needed to run a script.
const HOUSE = "Painterly cel-shaded 2D fantasy game art, bold dark INK CONTOUR outlines, rich saturated colour, "
    + "warm torchlit medieval palette, chunky readable silhouette, storybook RPG town style.";
const DIE_CUT = "A SINGLE object, centred, drawn ENTIRELY INSIDE the frame with clear empty space on all four "
    + "sides — roughly 10% of the image empty above, below, left and right. NO part may touch or run off any "
    + "edge; draw it SMALLER rather than cropped. ISOLATED as a clean die-cut sprite on a FULLY TRANSPARENT "
    + "background (alpha channel) — NO backdrop, NO scenery, NO ground, NO cast shadow, NO glow halo, NO white "
    + "sticker rim, NO circular badge or frame behind it.";
const NEGATIVE = "No text, no words, no letters, no numbers, no signage, no logo, no watermark, no border.";

// Reads at ~62px in the plaza, so the SILHOUETTE has to carry it — and the first draw lost on exactly that.
// A shingled canopy on two posts standing over an iron-hooped barrel is a WISHING WELL: that is the shape the
// eye resolves at thumbnail size no matter what the ballots are doing, and it got read as a well on sight.
// So the barrel and the canopy-on-posts are both gone. What replaces them is a shape a well cannot have — a
// TALL, NARROW, FLAT-FRONTED upright box you stand at, taller than it is wide, with a drawn-back curtain and
// a slotted ballot chest on a writing shelf. Vertical and boxy, against a plaza of round and squat fixtures.
// No lettering — the model writes on any sign it is given, and a banner would be a sign.
const SUBJECT = "A medieval wooden VOTING BOOTH: a TALL NARROW upright wooden stall, clearly taller than it is "
    + "wide, like a market kiosk or a confessional — a flat panelled front, an open doorway on the front face "
    + "with a heavy deep-red curtain drawn back and tied to one side, and a small slanted writing shelf across "
    + "the opening at waist height. On the shelf sits a small iron-bound ballot chest with a dark slot cut in "
    + "its lid, a quill beside it, and a couple of rolled paper ballots. A flat plank awning caps the top. "
    + "Weathered oak boards, iron nail-heads, iron corner bands. "
    + "NOT a well: no barrel, no round tub, no hooped cask, no rope, no winch, no crank, no bucket, no stone "
    + "rim, no pitched shingled roof carried on open posts.";

const PROMPT = `${SUBJECT} ${DIE_CUT} ${HOUSE} Must read clearly at 62 pixels tall — strong outline, few large shapes, no fine detail. ${NEGATIVE}`;

const dest = `${OUT}/vote-booth.png`;
if (fs.existsSync(dest) && !process.argv.includes("--force")) {
    console.log("skip — already exists (pass --force to redraw)");
} else {
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        // medium: a 62px fixture gains nothing from "high" once it is downscaled, and "low" comes back
        // off-house-style (thin ink, weak silhouette) which is the one thing this asset cannot afford.
        body: JSON.stringify({ model: "gpt-image-1", prompt: PROMPT, size: "1024x1024", background: "transparent", output_format: "png", quality: "medium", n: 1 }),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) throw new Error("no image returned");
    // Trim first so the sprite fills its box — a fixture that arrives with baked-in margin renders small and
    // floating, which is the exact defect that made the fleet captains look wrong.
    const buf = await sharp(Buffer.from(b64, "base64"))
        .trim({ threshold: 6 })
        .resize(384, 384, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(dest, buf);
    console.log(`wrote ${dest} ${fs.statSync(dest).size} bytes`);
}
