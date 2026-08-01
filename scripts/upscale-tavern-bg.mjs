// The tavern interior backdrop was stored at 512x181 and is drawn full-bleed on a phone — roughly a 2x upscale
// by the browser, which is exactly the mush you can see behind the barkeep.
//
// Nothing can recover detail that isn't in a 512px source, so this re-renders the SAME scene at full size using
// the existing art as the reference image, then uploads it over the same art_key. Composition is preserved
// because the original is passed in; only the resolution is new.
//
// --apply to upload; default writes a local preview only.
import fs from "node:fs";
import path from "node:path";
import "./lib/ai-trace.mjs";
import { put } from "@vercel/blob";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
const env = fs.readFileSync("../accounting_app/.env", "utf8");
const dbUrl = env.match(/^DATABASE_URL=(.*)$/m)[1].trim();
const blobToken = env.match(/^BLOB_READ_WRITE_TOKEN=(.*)$/m)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const sql = neon(dbUrl);
const OUT = "C:/Users/Luke/AppData/Local/Temp/claude/C--Users-Luke-Projects/a74e73a5-2c7a-498f-9a71-6af0a5746735/scratchpad";

const row = (await sql`SELECT url FROM mkt_town_art WHERE art_key = 'tavern_interior'`)[0];
if (!row?.url) throw new Error("no tavern_interior art row");
const srcBuf = Buffer.from(await (await fetch(row.url)).arrayBuffer());
fs.writeFileSync(path.join(OUT, "tavern-src.png"), srcBuf);

const prompt = `Redraw this exact tavern interior at high resolution, keeping the SAME composition, layout, camera angle, colours and mood. `
    + `A warm medieval fantasy tavern: big stone hearth with a roaring fire at the centre-right, heavy dark timber beams `
    + `across the ceiling, rough stone and wood walls, wooden stools and a table. Painterly cel-shaded game background, `
    + `rich warm firelight falling across the room, deep shadows in the corners. `
    + `Crisp and detailed — visible stone texture, wood grain and individual flames. `
    + `NO characters, NO people, NO text, NO UI. Empty room, wide shot, background plate only.`;

const form = new FormData();
form.append("model", "gpt-image-1");
form.append("image", new Blob([srcBuf], { type: "image/png" }), "tavern.png");
form.append("prompt", prompt);
form.append("size", "1536x1024");
// The one place a higher quality is worth paying for: this is a full-screen backdrop, not a 40px icon.
form.append("quality", "high");
form.append("n", "1");

const resp = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form,
});
if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 400)}`);
const b64 = (await resp.json())?.data?.[0]?.b64_json;
if (!b64) throw new Error("no image returned");

const png = Buffer.from(b64, "base64");
const sharp = (await import("sharp")).default;
// webp at the same dimensions — the site serves webp everywhere and it is a third the bytes for a photo-like plate.
// Lifted slightly: the render came back moodier than the original, and the barkeep and member sprites stand
// ON this — they need something to read against in the lower third.
const webp = await sharp(png).modulate({ brightness: 1.16, saturation: 1.06 }).webp({ quality: 90 }).toBuffer();
const preview = path.join(OUT, "tavern-new.webp");
fs.writeFileSync(preview, webp);
console.log(`new backdrop 1536x1024, ${(webp.length / 1024).toFixed(0)}KB -> ${preview}`);

if (!APPLY) { console.log("preview only — re-run with --apply to publish"); process.exit(0); }
if (!blobToken) throw new Error("no BLOB_READ_WRITE_TOKEN");

const uploaded = await put(`art/mkt_town_art/tavern-interior-hi-${Date.now()}.webp`, webp, {
    access: "public", token: blobToken, contentType: "image/webp",
});
await sql`UPDATE mkt_town_art SET url = ${uploaded.url} WHERE art_key = 'tavern_interior'`;
console.log("published ->", uploaded.url);
