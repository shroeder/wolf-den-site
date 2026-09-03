// ── ONE TOWN/TAVERN NPC SPRITE ───────────────────────────────────────────────────────────────────────────────
// A character sprite for the plaza or the tavern room, generated from the prompt that ALREADY lives in
// town-art.js — never a prompt written here, for the same reason gen-town-market.mjs reads its building out of
// that file: the admin regenerate button and this script must never draw two different people.
//
// It differs from gen-town-market.mjs only in what it does NOT do: no ${BUILDING_STYLE} substitution, because
// every NPC prompt in that table is a complete literal (a building style biases the model into drawing a house
// with a face on it — the note above `smith` in town-art.js is the scar from that).
//
// MEDIUM quality: an NPC renders at ~150-200px on the floor, which is past where `low` turns a face to mush,
// and it is one image, once. Candidates are written to disk and NOT stored, so a bad roll costs $0.04 and
// nothing else — see [--pick] below.
//
// Usage:
//   node scripts/gen-town-npc.mjs cardsharp --n 3     draw 3 candidates → scratch PNGs + a contact sheet
//   node scripts/gen-town-npc.mjs cardsharp --pick 2  re-render nothing; store candidate 2 as the live sprite
import fs from "node:fs";

import { neon } from "@neondatabase/serverless";
import { put } from "@vercel/blob";
import sharp from "sharp";

import { priceRun, quality } from "./lib/gen-guard.mjs";
import "./lib/ai-trace.mjs"; // every OpenAI call in this script lands in the AI Costs history

function prop(text, key) {
    for (const line of text.split(/\r?\n/)) {
        const i = line.indexOf("=");
        if (i > 0 && line.slice(0, i).trim() === key) return line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
    return null;
}
const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const env = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
const OPENAI_KEY = prop(props, "OPENAI_API_KEY");
const DB_URL = prop(env, "DATABASE_URL");
const BLOB_TOKEN = prop(env, "BLOB_READ_WRITE_TOKEN");
if (!OPENAI_KEY?.startsWith("sk-")) throw new Error("bad OPENAI_API_KEY");
const sql = neon(DB_URL);

const KEY = process.argv[2];
if (!KEY) throw new Error("usage: node scripts/gen-town-npc.mjs <art_key> [--n 3] [--pick 1]");
const arg = (name, dflt) => {
    const i = process.argv.indexOf(name);
    return i > 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : dflt;
};
const N = arg("--n", 1);
const PICK = arg("--pick", 0);
const OUT = "scratch/npc";
fs.mkdirSync(OUT, { recursive: true });

// The prompt, straight out of the source of truth.
const src = fs.readFileSync("src/lib/marketplace/town-art.js", "utf8");
const prompt = src.match(new RegExp(`^\\s{4}${KEY}: \`([^]*?)\`,$`, "m"))?.[1];
if (!prompt) throw new Error(`no ART_PROMPTS entry named "${KEY}" in town-art.js`);
if (prompt.includes("${")) throw new Error(`"${KEY}" interpolates a style constant — use gen-town-market.mjs for those`);

// TRIM FIRST, always. The model centres the figure in a square and leaves transparent margin all round; without
// the trim the sprite stands shorter than the barkeep beside it for a reason nobody can see in the picture.
const finish = (buf) => sharp(buf).trim({ threshold: 10 }).resize({ width: 512, withoutEnlargement: true })
    .webp({ quality: 90, effort: 5 }).toBuffer();

async function store(webp, usage = {}) {
    const { url } = await put(`marketplace/town/${KEY}-${Date.now()}.webp`, webp, { access: "public", token: BLOB_TOKEN, contentType: "image/webp" });
    await sql`INSERT INTO mkt_town_art (art_key, url, updated_at) VALUES (${KEY}, ${url}, NOW())
              ON CONFLICT (art_key) DO UPDATE SET url = EXCLUDED.url, updated_at = NOW()`;
    await sql`INSERT INTO mkt_ai_generation (url, subject, source, size, quality, prompt, ok, tokens_in, tokens_out, origin, label, model, bytes)
              VALUES (${url}, ${KEY}, 'marketplace/town', '1024x1024', ${quality()}, ${prompt.slice(0, 900)}, true,
                      ${usage.input_tokens || null}, ${usage.output_tokens || null}, 'admin', ${`Town art - ${KEY}`}, 'gpt-image-1', ${webp.length})`.catch(() => {});
    return url;
}

// ── --pick: store a candidate that was already paid for ──────────────────────────────────────────────────
if (PICK) {
    const file = `${OUT}/${KEY}-${PICK}.png`;
    if (!fs.existsSync(file)) throw new Error(`no candidate at ${file} — run without --pick first`);
    const url = await store(await finish(fs.readFileSync(file)));
    console.log(`ok  ${KEY} #${PICK} → ${url}`);
    process.exit(0);
}

// ── draw the candidates ─────────────────────────────────────────────────────────────────────────────────
const q = quality();
priceRun({ count: N, size: "1024x1024", quality: q });
console.log(`${KEY}: ${prompt.slice(0, 110)}…\n`);

const sheets = [];
for (let i = 1; i <= N; i++) {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", background: "transparent", quality: q, n: 1 }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);
    const buf = Buffer.from(j.data[0].b64_json, "base64");
    fs.writeFileSync(`${OUT}/${KEY}-${i}.png`, buf);
    // A CHECKERBOARD under each candidate, because a transparent PNG viewed on white hides exactly the fault
    // this sheet is for: a white sticker rim reads as "clean cutout" against a white page.
    sheets.push(await sharp(buf).resize(340, 340, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .flatten({ background: "#4a3a2a" }).png().toBuffer());
    console.log(`  #${i} drawn`);
}

if (N > 1) {
    const sheet = await sharp({ create: { width: 340 * N, height: 340, channels: 4, background: "#4a3a2a" } })
        .composite(sheets.map((input, i) => ({ input, left: 340 * i, top: 0 })))
        .png().toBuffer();
    fs.writeFileSync(`${OUT}/${KEY}-sheet.png`, sheet);
    console.log(`\ncontact sheet → ${OUT}/${KEY}-sheet.png    then: node scripts/gen-town-npc.mjs ${KEY} --pick <n>`);
} else {
    const url = await store(await finish(fs.readFileSync(`${OUT}/${KEY}-1.png`)));
    console.log(`ok  ${KEY} → ${url}`);
}
