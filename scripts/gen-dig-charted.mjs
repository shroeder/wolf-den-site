// ── THE CHARTED ISLAND'S OWN BEACH ───────────────────────────────────────────────────────────────────
// The three ordinary voyages each have a backdrop; a charted island had a key in DIG_BGS and no file,
// which on this codebase is not a missing picture but a broken-image glyph rendered before React can
// catch it (see the img onError note). One image, same 1536x1024 as its three siblings.
//   node scripts/gen-dig-charted.mjs [--force]
import fs from "node:fs";
import sharp from "sharp";
import { housePrompt } from "../src/lib/marketplace/art-style.js";

const props = fs.readFileSync("../accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");
const DEST = "public/images/sailing/dig-charted.png";
if (fs.existsSync(DEST) && !process.argv.includes("--force")) { console.log("already drawn"); process.exit(0); }

// Deliberately NOT a nicer version of the ordinary beach. Somewhere three men were made to name: colder,
// older, and clearly not on the way to anywhere.
const SUBJECT = "A hidden cove on a charted island at dusk: black volcanic sand between two tall basalt "
    + "headlands, the wreck of an old ship half-buried in the sand with its ribs showing, a single "
    + "weathered stone marker standing upright near the water, cold green sea, low mist, one shaft of "
    + "pale light through heavy cloud. Empty, quiet and unmistakably somewhere nobody comes";

const resp = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
        model: "gpt-image-1", prompt: housePrompt(SUBJECT, { framing: "scene" }),
        size: "1536x1024", output_format: "png", quality: "medium", n: 1,
    }),
});
if (!resp.ok) throw new Error(`OpenAI ${resp.status} ${(await resp.text()).slice(0, 200)}`);
const json = await resp.json();
const png = await sharp(Buffer.from(json.data[0].b64_json, "base64")).png({ compressionLevel: 9 }).toBuffer();
fs.writeFileSync(DEST, png);
console.log(`wrote ${DEST} — ${Math.round(png.length / 1024)}kb  (about $0.04)`);
