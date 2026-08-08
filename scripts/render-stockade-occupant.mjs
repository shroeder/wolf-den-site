// Draw whoever is currently in the stockade INTO the stockade.
//
// The app already does this on placeInStockade — it feeds the member's own hero sprite to the image EDITS
// endpoint and asks for the same character locked in the boards, so the figure in the plaza is recognisably
// them rather than a generic prisoner. Two sprites in, one out.
//
// This script exists because the occupant can also arrive by a route that skips that call (a row written
// straight into mkt_stockade, which is how the first one got there). Rather than leave an empty pillory with a
// nameplate on it, this re-runs the draw for whoever is in right now.
//
//   node scripts/render-stockade-occupant.mjs
import fs from "node:fs";
import sharp from "sharp";
import { put } from "@vercel/blob";
import { neon } from "@neondatabase/serverless";
import "./lib/ai-trace.mjs";

const env = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
const DB = env.match(/DATABASE_URL=(.+)/)?.[1]?.trim().replace(/^["']|["']$/g, "");
const BLOB = env.match(/BLOB_READ_WRITE_TOKEN=(.+)/)?.[1]?.trim().replace(/^["']|["']$/g, "");
const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const KEY = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!DB || !BLOB || !KEY) throw new Error("missing DATABASE_URL, BLOB_READ_WRITE_TOKEN or OPENAI_API_KEY");

const sql = neon(DB);

// Verbatim from stockade.js so the two paths cannot drift — if this prompt is edited, edit it there too.
const PROMPT =
    "Redraw this exact character locked into a medieval wooden pillory stockade, keeping their face, hair, skin tone, outfit and colours EXACTLY as they are. Two thick weathered oak planks clamp shut across them: their HEAD is through the large centre hole and BOTH WRISTS are through the two smaller side holes, palms open, arms stretched out to the sides and bent forward at the elbow so they are genuinely trapped in the boards. Hunched forward slightly, standing, glum embarrassed expression. A few splattered rotten tomatoes and cabbage leaves on the boards and on the ground at their feet. Bold stylized 2D video-game illustration, dark ink contour lines, cel-shaded flat vibrant colors, warm torchlit fantasy town palette, polished RPG game-art style, strong readable silhouette, full body, viewed from the front, transparent background, no text, no logo, no watermark, no border, no white outline, no sticker rim, no drop shadow.";

const occ = (await sql`
    SELECT s.buyer_id, s.reason, b.display_name, b.avatar_sprite_url
      FROM mkt_stockade s JOIN mkt_buyer b ON b.id = s.buyer_id
     WHERE s.released_at IS NULL LIMIT 1`)[0];
if (!occ) { console.log("stockade is empty — nothing to draw"); process.exit(0); }
if (!occ.avatar_sprite_url) { console.log(`${occ.display_name} has no hero sprite to work from`); process.exit(1); }
console.log(`drawing ${occ.display_name} — "${occ.reason}"`);

// sharp normalises whatever the sprite is stored as (WebP) into the PNG the edits endpoint requires.
const srcBuf = Buffer.from(await fetch(occ.avatar_sprite_url).then((r) => r.arrayBuffer()));
const png = await sharp(srcBuf).png().toBuffer();

const form = new FormData();
form.append("model", "gpt-image-1");
form.append("prompt", PROMPT);
form.append("size", "1024x1024");
form.append("quality", "medium");
form.append("background", "transparent");
form.append("image", new Blob([png], { type: "image/png" }), "hero.png");

const resp = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST", headers: { Authorization: `Bearer ${KEY}` }, body: form,
});
if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
const b64 = (await resp.json())?.data?.[0]?.b64_json;
if (!b64) throw new Error("no image returned");

// Trimmed so the figure fills its box — a sprite with baked-in margin renders small and floating in the plaza.
const out = await sharp(Buffer.from(b64, "base64"))
    .trim({ threshold: 6 })
    .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 }).toBuffer();

const { url } = await put(`marketplace/town/stockade-${occ.buyer_id}-${Date.now()}.png`, out, {
    access: "public", token: BLOB, contentType: "image/png",
});
await sql`UPDATE mkt_stockade SET occupant_art_url = ${url}, occupant_art_at = NOW() WHERE buyer_id = ${occ.buyer_id}`;
console.log("wrote", url);
