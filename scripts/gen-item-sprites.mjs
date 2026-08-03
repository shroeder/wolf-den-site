// AI gear art for items that don't have one yet, written to mkt_item_sprite + Vercel Blob.
//
// No writer for this table was ever checked in — the 334 sprites already in it came from a script that isn't
// in the repo, which is how twelve brand-new pieces of gear ended up as the only art-less items in the game.
// The prompt below is reconstructed VERBATIM from the prompts stored alongside those 334 rows (slot nouns and
// rarity materials extracted from the table itself), so anything generated here is indistinguishable from what
// is already there. Do not "improve" the wording — matching the existing set is the whole point.
//
// Usage:  node scripts/gen-item-sprites.mjs [itemId ...]   (no args = every item missing art)
import fs from "node:fs";

import { put } from "@vercel/blob";
import { neon } from "@neondatabase/serverless";

import "./lib/ai-trace.mjs"; // every OpenAI call in this script lands in the AI Costs history

// items.js CANNOT be imported here: it resolves `@/lib/...`, an alias only Next understands, so plain node
// dies with ERR_MODULE_NOT_FOUND. (The pet/art scripts get away with importing art-style.js because that one
// has no imports of its own.) The catalog is a flat list of single-line object literals, so it is read out of
// the source instead — no bundler, no alias, and it stays correct as items are added.
function readItems() {
    const src = fs.readFileSync(new URL("../src/lib/marketplace/items.js", import.meta.url), "utf8");
    const out = [];
    for (const line of src.split(/\r?\n/)) {
        const id = line.match(/\{ id: "([a-z0-9_]+)"/);
        if (!id) continue;
        // An explicit "start, space or brace" prefix rather than \b — a word boundary is the obvious choice
        // but survives editing badly (one lost backslash turns it into a literal backspace char and every
        // field silently reads undefined, which looks exactly like "the catalog is empty").
        const f = (k) => line.match(new RegExp(`(?:^|[ ,{])${k}: "([^"]*)"`))?.[1];
        const name = f("name"), slot = f("slot"), rarity = f("rarity");
        if (!name || !slot || !rarity) continue;   // pets/consumables/other catalogs in the same file
        out.push({ id: id[1], name, slot, rarity, flavor: f("flavor") || "" });
    }
    return out;
}
const ITEMS = readItems();

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const env = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
const pick = (src, k) => src.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim().replace(/^"|"$/g, "");
const OPENAI = pick(props, "OPENAI_API_KEY") || pick(env, "OPENAI_API_KEY");
const BLOB = pick(env, "BLOB_READ_WRITE_TOKEN");
const DB = pick(env, "DATABASE_URL");
if (!OPENAI || !BLOB || !DB) throw new Error(`missing key(s): openai=${!!OPENAI} blob=${!!BLOB} db=${!!DB}`);
const sql = neon(DB);

// Extracted from the stored prompts of the existing rows.
const SLOT_NOUN = {
    main_hand: "weapon",
    off_hand: "shield or off-hand focus",
    ring: "ring",
    belt: "belt",
    chest: "chest armor (torso plate/robe)",
    boots: "pair of boots",
    amulet: "amulet or necklace",
    helmet: "helmet / headgear",
    back: "cloak or cape",
};
const RARITY_MATERIAL = {
    common: "made of plain worn materials — rough wood, dull grey iron, cracked leather; muted and battered",
    rare: "crafted from polished steel and hardwood with subtle blue-tinted metal edges; clean and well-kept",
    epic: "ornate enchanted craftsmanship with violet gemstones and fine silver filigree worked into the object",
    legendary: "masterwork gold-and-obsidian craftsmanship, glowing orange runes etched into the object, a few embers on its surface",
    mythic: "otherworldly materials with vivid teal-green crystal inlays and glowing energy veins across the object",
    ascendant: "divine craftsmanship with shifting pink-violet cosmic gemstones and star-metal filigree",
    eternal: "celestial forged look, blazing orange starfire etched along its edges, radiant molten trim",
};

function buildItemPrompt(it) {
    const noun = SLOT_NOUN[it.slot] || "item";
    const material = RARITY_MATERIAL[it.rarity] || RARITY_MATERIAL.common;
    return (
        `A single fantasy RPG ${noun} game inventory icon: "${it.name}". ` +
        `It is described as: "${it.flavor || ""}". ` +
        `The object is ${material}. ` +
        `Painterly cel-shaded 2D video-game item art, 3/4 view, bold clean dark outlines, chunky readable ` +
        `silhouette, high contrast, vibrant colors, soft inner shading. It is a die-cut sticker of ONLY the ` +
        `single object, centered and filling most of the frame. CRITICAL: 100% transparent background — no ` +
        `backdrop, no background color, no background gradient, no glow halo behind the object, no cast ` +
        `shadow, no ground, no scenery, no character, no hands, no text, no words, no letters, no border or frame.`
    );
}

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

async function upload(buf) {
    const path = `marketplace/item/${Date.now()}-${Math.round(Math.random() * 1e6)}.png`;
    const blob = await put(path, buf, { access: "public", contentType: "image/png", token: BLOB });
    return blob.url;
}

const want = process.argv.slice(2);
const have = new Set((await sql`SELECT item_id FROM mkt_item_sprite`).map((r) => r.item_id));
const todo = ITEMS.filter((i) => (want.length ? want.includes(i.id) : !have.has(i.id)));
console.log(`${todo.length} item sprites to generate`);

const queue = [...todo];
let done = 0; const failed = [];
await Promise.all(Array.from({ length: 3 }, async () => {
    for (let it = queue.shift(); it; it = queue.shift()) {
        try {
            const prompt = buildItemPrompt(it);
            const url = await upload(await generate(prompt));
            await sql.query(
                `INSERT INTO mkt_item_sprite (item_id, url, prompt, updated_at) VALUES ($1, $2, $3, NOW())
                 ON CONFLICT (item_id) DO UPDATE SET url = $2, prompt = $3, updated_at = NOW()`,
                [it.id, url, prompt],
            );
            done += 1;
            console.log(`✓ ${it.id} (${it.rarity} ${it.slot}) → ${url.slice(-26)}`);
        } catch (e) {
            failed.push(it.id);
            console.log(`✗ ${it.id}: ${e.message}`);
        }
    }
}));
console.log(`\nDONE — ${done}/${todo.length}`);
if (failed.length) { console.log(`FAILED: ${failed.join(", ")}`); process.exit(1); }
