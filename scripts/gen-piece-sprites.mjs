// AI art for COLLECTION PIECES, written to mkt_item_sprite + Vercel Blob — the same table gear art lives in,
// so ItemArt picks a piece's sprite up with no change at any call site.
//
// Why this is not gen-item-sprites.mjs: that script infers the subject from an item's SLOT ("a fantasy RPG
// helmet…"), and a collection piece has no slot on purpose — it is never worn. So each piece that wants art
// carries an explicit `art` noun in collection-pieces.js, and that is what gets drawn. A piece with no `art`
// field is skipped and keeps its glyph, which is what the forty older pieces do.
//
// Usage:  node scripts/gen-piece-sprites.mjs [pieceId ...]   (no args = every piece with `art` and no sprite)
import fs from "node:fs";

import { put } from "@vercel/blob";
import { neon } from "@neondatabase/serverless";

import "./lib/ai-trace.mjs";

// collection-pieces.js has no imports of its own, but it is still ESM behind the "@/" alias for its consumers —
// and it is a flat list of one-line literals, so it is read out of the source exactly as gen-item-sprites.mjs
// reads items.js. No bundler, no alias, and it stays correct as pieces are added.
function readPieces() {
    const src = fs.readFileSync(new URL("../src/lib/marketplace/collection-pieces.js", import.meta.url), "utf8");
    const out = [];
    for (const line of src.split(/\r?\n/)) {
        const id = line.match(/\{ id: "([a-z0-9_]+)"/);
        if (!id) continue;
        const f = (k) => line.match(new RegExp(`(?:^|[ ,{])${k}: "([^"]*)"`))?.[1];
        const art = f("art");
        if (!art) continue;                     // no `art` noun → keep the glyph
        out.push({ id: id[1], name: f("name"), rarity: f("rarity"), flavor: f("flavor") || "", art });
    }
    return out;
}
const PIECES = readPieces();

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const env = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
const pick = (src, k) => src.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim().replace(/^"|"$/g, "");
const OPENAI = pick(props, "OPENAI_API_KEY") || pick(env, "OPENAI_API_KEY");
const BLOB = pick(env, "BLOB_READ_WRITE_TOKEN");
const DB = pick(env, "DATABASE_URL");
if (!OPENAI || !BLOB || !DB) throw new Error(`missing key(s): openai=${!!OPENAI} blob=${!!BLOB} db=${!!DB}`);
const sql = neon(DB);

// Verbatim from gen-item-sprites.mjs, so a piece sitting next to a sword in the same grid matches it.
const RARITY_MATERIAL = {
    common: "made of plain worn materials — rough wood, dull grey iron, cracked leather; muted and battered",
    rare: "crafted from polished steel and hardwood with subtle blue-tinted metal edges; clean and well-kept",
    epic: "ornate enchanted craftsmanship with violet gemstones and fine silver filigree worked into the object",
    legendary: "masterwork gold-and-obsidian craftsmanship, glowing orange runes etched into the object, a few embers on its surface",
    mythic: "otherworldly materials with vivid teal-green crystal inlays and glowing energy veins across the object",
    ascendant: "divine craftsmanship with shifting pink-violet cosmic gemstones and star-metal filigree",
    eternal: "celestial forged look, blazing orange starfire etched along its edges, radiant molten trim",
};

const buildPrompt = (p) =>
    `A single fantasy RPG ${p.art} game inventory icon: "${p.name}". ` +
    `It is described as: "${p.flavor}". ` +
    `The object is ${RARITY_MATERIAL[p.rarity] || RARITY_MATERIAL.common}. ` +
    `Painterly cel-shaded 2D video-game item art, 3/4 view, bold clean dark outlines, chunky readable ` +
    `silhouette, high contrast, vibrant colors, soft inner shading. It is a die-cut sticker of ONLY the ` +
    `single object, centered and filling most of the frame. CRITICAL: 100% transparent background — no ` +
    `backdrop, no background color, no background gradient, no glow halo behind the object, no cast ` +
    `shadow, no ground, no scenery, no character, no hands, no text, no words, no letters, no border or frame.` +
    // "die-cut sticker" is verbatim from the 334 existing rows and has to stay — but the word *sticker* invites
    // a white rim about one time in three, and a rim is the one defect that cannot be fixed after the fact
    // without eating the art with it. Saying so outright costs nothing and is not a style change.
    ` The object must have NO white outline, NO pale rim, NO sticker border of any colour around its edge — ` +
    `the artwork ends exactly at the object's own dark ink outline.`;

async function generate(prompt) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const resp = await fetch("https://api.openai.com/v1/images/generations", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI}` },
                body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", background: "transparent", quality: "low", n: 1 }),
            });
            if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 160)}`);
            const b64 = (await resp.json())?.data?.[0]?.b64_json;
            if (!b64) throw new Error("no image");
            return Buffer.from(b64, "base64");
        } catch (e) {
            if (attempt === 3) throw e;
            await new Promise((r) => setTimeout(r, 4000 * attempt));
        }
    }
    return null;
}

const want = process.argv.slice(2);
const have = new Set((await sql`SELECT item_id FROM mkt_item_sprite`).map((r) => r.item_id));
const todo = PIECES.filter((p) => (want.length ? want.includes(p.id) : !have.has(p.id)));
console.log(`${todo.length} piece sprite(s) to draw`);

let ok = 0;
for (const p of todo) {
    try {
        const prompt = buildPrompt(p);
        const buf = await generate(prompt);
        const { url } = await put(`marketplace/item/${p.id}-${Date.now()}.png`, buf, { access: "public", token: BLOB, contentType: "image/png" });
        await sql`INSERT INTO mkt_item_sprite (item_id, url, prompt, updated_at) VALUES (${p.id}, ${url}, ${prompt}, NOW())
                  ON CONFLICT (item_id) DO UPDATE SET url = EXCLUDED.url, prompt = EXCLUDED.prompt, updated_at = NOW()`;
        ok += 1;
        console.log(`  ✓ ${p.id.padEnd(14)} ${url.slice(-30)}`);
    } catch (e) {
        console.error(`  ✗ ${p.id}: ${e.message}`);
    }
}
console.log(`\nDone. ${ok}/${todo.length}`);
