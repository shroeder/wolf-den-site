// The Kitchen's centrepiece: one kettle, five stages.
//
// Which one you see is driven by your TOTAL upgrade levels, so buying a track visibly changes the pot on your
// screen rather than only a number in a list. That's the whole point — an upgrade you can see beats an upgrade
// you have to read.
import fs from "node:fs";
import "./lib/ai-trace.mjs"; // every OpenAI call in this script lands in the AI Costs history
import { neon } from "@neondatabase/serverless";
import { put } from "@vercel/blob";
import sharp from "sharp";

function pick(text, key) {
    for (const line of text.split(/\r?\n/)) {
        const i = line.indexOf("=");
        if (i > 0 && line.slice(0, i).trim() === key) return line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
    return null;
}
const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const env = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
const OPENAI_KEY = pick(props, "OPENAI_API_KEY");
const sql = neon(pick(env, "DATABASE_URL"));
const BLOB_TOKEN = pick(env, "BLOB_READ_WRITE_TOKEN");
if (!OPENAI_KEY?.startsWith("sk-")) throw new Error("bad OPENAI_API_KEY");

// Deliberately ONE object evolving, not five different pots — the fiction is that it's your kettle getting
// better, so the silhouette has to stay recognisable while the materials and trimmings escalate.
const STAGES = {
    kettle_1: "a small humble dented black iron cooking pot on three stubby legs, plain and well-used, a thin wisp of steam, sitting over a few glowing coals",
    kettle_2: "a sturdy black iron cooking pot on three legs with a polished copper rim and a simple iron handle, gently steaming over a small crackling fire",
    kettle_3: "a large well-made cauldron of dark iron banded with bright copper, riveted bands and a heavy hooked handle, bubbling actively over a strong fire, herbs tied to one handle",
    kettle_4: "an ornate large cauldron of blackened steel with engraved brass bands and clawed feet, rich stew bubbling over the rim, hanging from a wrought-iron hook above a roaring fire",
    kettle_5: "a magnificent golden ceremonial cauldron with elaborate engraved scrollwork, gemstone inlays and lion-paw feet, glowing stew bubbling brightly, radiant magical heat shimmering beneath it",
};

const suffix = "Bold stylized 2D game item icon, dark ink contour lines, cel-shaded flat vibrant colors, warm rustic fantasy kitchen palette, strong readable silhouette, centered, viewed straight on from the front, fills most of the frame. Die-cut on a FULLY TRANSPARENT background — no backdrop, no scene, no floor, no vignette, no drop shadow. No text, no letters, no numbers, no logo, no watermark, no border.";

const argv = process.argv.slice(2);
const todo = Object.entries(STAGES).filter(([ref]) => !argv.length || argv.includes(ref));
console.log(`generating ${todo.length} kettle stage(s)…`);

let ok = 0;
await Promise.all(todo.map(async ([ref, desc]) => {
    const prompt = `${desc}. ${suffix}`;
    try {
        const res = await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST",
            headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", background: "transparent", quality: "medium", n: 1 }),
        });
        const j = await res.json();
        if (!res.ok) { console.log(`  x ${ref}: ${JSON.stringify(j).slice(0, 110)}`); return; }
        const buf = Buffer.from(j.data[0].b64_json, "base64");
        // Bigger than the dish icons — this one is the centrepiece and renders around 120px.
        const webp = await sharp(buf).resize({ width: 384, withoutEnlargement: true }).webp({ quality: 90, effort: 5 }).toBuffer();
        const { url } = await put(`marketplace/cooking/${ref}-${Date.now()}.webp`, webp, { access: "public", token: BLOB_TOKEN, contentType: "image/webp" });
        await sql`INSERT INTO mkt_cooking_sprite (ref, url, prompt, updated_at) VALUES (${ref}, ${url}, ${prompt}, NOW())
                  ON CONFLICT (ref) DO UPDATE SET url = EXCLUDED.url, prompt = EXCLUDED.prompt, updated_at = NOW()`;
        const u = j.usage || {};
        await sql`INSERT INTO mkt_ai_generation (url, subject, source, size, quality, prompt, ok, tokens_in, tokens_out, origin, label, model, bytes)
                  VALUES (${url}, ${ref}, 'marketplace/cooking', '1024x1024', 'medium', ${prompt.slice(0, 900)}, true,
                          ${u.input_tokens || null}, ${u.output_tokens || null}, 'admin', ${'Kitchen kettle ' + ref}, 'gpt-image-1', ${webp.length})`.catch(() => {});
        ok += 1;
        console.log(`  ok ${ref}  (${(webp.length / 1024).toFixed(0)} KB)`);
    } catch (e) {
        console.log(`  x ${ref}: ${String(e?.message || e).slice(0, 110)}`);
    }
}));
console.log(`Done. ${ok}/${todo.length}.`);
