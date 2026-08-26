// Battle sprites for the three VIP LOUNGE pets Sable sells -- base plus all four evolved forms. Written
// because detailFor() had no `case "pet"` at all, so the counter drew a blank circle beside every one of
// them: Luke, in the lounge, "no sprites for the new pets". The prompts are the spritePrompt lines already
// written on each pet in collectibles.js, copied here the way every other generator in this folder does it.
// because a pet that levels has to visibly evolve or the levelling means nothing.
//
// Unlike the fish and nav icons, pet sprites are NOT static files: the app reads them from mkt_pet_sprite /
// mkt_pet_sprite_level, with the image itself on Vercel Blob. So this writes to both, exactly as the in-app
// generator does — but calls OpenAI directly rather than driving the site's own admin endpoints.
//
// The pose and evolution wording are copied from src/lib/marketplace/pet-sprite.js so these 20 match the 89
// sprites already in the table. If that file's wording changes, change it here too.
//
// Usage:  node scripts/gen-vip-pet-sprites.mjs [petId ...]
import fs from "node:fs";

import { put } from "@vercel/blob";
import { neon } from "@neondatabase/serverless";

import { housePrompt } from "../src/lib/marketplace/art-style.js";
import "./lib/ai-trace.mjs"; // every OpenAI call in this script lands in the AI Costs history

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const env = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
const pick = (src, k) => src.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();
const OPENAI = pick(props, "OPENAI_API_KEY") || pick(env, "OPENAI_API_KEY");
const BLOB = pick(env, "BLOB_READ_WRITE_TOKEN");
const DB = pick(env, "DATABASE_URL");
if (!OPENAI || !BLOB || !DB) throw new Error(`missing key(s): openai=${!!OPENAI} blob=${!!BLOB} db=${!!DB}`);
const sql = neon(DB);

// Verbatim from pet-sprite.js — facing right matters mechanically (the pet fights beside you, toward the foe).
const POSE =
    "Full body, cute but fierce, facing and looking toward the RIGHT side of the image — a right-facing " +
    "three-quarter view, turned toward the enemy.";
const LEVEL_EVOLUTION = {
    2: "It has grown a little stronger — a faint magical aura and a more confident, battle-ready stance.",
    3: "It is battle-hardened and clearly more powerful — glowing energy, subtle magical runes or markings, a fiercer posture.",
    4: "It has reached an EPIC evolved form — radiant energy swirling around it, dramatic elemental effects, a larger imposing heroic silhouette.",
    5: "It has reached its ULTIMATE LEGENDARY form — a blazing powerful aura, crackling energy, maximum intensity, awe-inspiring and majestic.",
};

// VERBATIM from the spritePrompt on each pet in collectibles.js. If one is reworded there, reword it here.
const PETS = {
    house_ferret: "a sleek cream-and-gold ferret standing upright holding a single casino chip in its front paws, bright dark eyes, tiny gold waistcoat",
    velvet_lynx: "an elegant long-eared lynx with deep violet-grey fur lounging on a gold velvet cushion, one paw draped over the edge, wearing a thin gold collar",
    midnight_crane: "a tall slender crane with midnight-blue plumage and silver-tipped wings standing on one leg, long neck curved, a single silver ring on its ankle",
};

const basePrompt = (p) => housePrompt(`${p} — a loyal battle companion.`, { extra: POSE });
const levelPrompt = (p, lv) => housePrompt(
    `${p} — a loyal battle companion, power level ${lv} of 5. ${LEVEL_EVOLUTION[lv]} Keep it recognizably the SAME creature, just more powerful.`,
    { extra: POSE },
);

async function generate(prompt) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const resp = await fetch("https://api.openai.com/v1/images/generations", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI}` },
                // medium, not high: "high" is ~4x the price and the extra detail dies in the downscale (see art-style.js).
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
    const path = `marketplace/pet/${Date.now()}-${Math.round(Math.random() * 1e6)}.png`;
    const blob = await put(path, buf, { access: "public", contentType: "image/png", token: BLOB });
    return blob.url;
}

const want = process.argv.slice(2);
const ids = Object.keys(PETS).filter((id) => (want.length ? want.includes(id) : true));

// One job per (pet, level). level 0 = the base sprite.
const jobs = [];
for (const id of ids) for (const lv of [0, 2, 3, 4, 5]) jobs.push({ id, lv });
console.log(`${jobs.length} sprites to generate (${ids.length} pets x base+Lv2-5)`);

const queue = [...jobs];
let done = 0; const failed = [];
await Promise.all(Array.from({ length: 3 }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
        const { id, lv } = job;
        const label = lv ? `${id} Lv${lv}` : `${id} base`;
        try {
            const buf = await generate(lv ? levelPrompt(PETS[id], lv) : basePrompt(PETS[id]));
            const url = await upload(buf);
            if (lv === 0) {
                // Freshly generated art is already right-facing, so stamp it oriented — the repair sweep skips it.
                await sql.query(
                    `INSERT INTO mkt_pet_sprite (pet_id, url, updated_at, oriented_at) VALUES ($1, $2, NOW(), NOW())
                     ON CONFLICT (pet_id) DO UPDATE SET url = $2, updated_at = NOW(), oriented_at = NOW(), flip = FALSE, facing_checked_at = NULL`,
                    [id, url],
                );
            } else {
                await sql.query(
                    `INSERT INTO mkt_pet_sprite_level (pet_id, level, url, updated_at) VALUES ($1, $2, $3, NOW())
                     ON CONFLICT (pet_id, level, variant) DO UPDATE SET url = $3, updated_at = NOW(), flip = FALSE, facing_checked_at = NULL`,
                    [id, lv, url],
                );
            }
            done += 1;
            console.log(`✓ ${label} → ${url.slice(-28)}`);
        } catch (e) {
            failed.push(label);
            console.log(`✗ ${label}: ${e.message}`);
        }
    }
}));
console.log(`\nDONE — ${done}/${jobs.length}`);
if (failed.length) { console.log(`FAILED: ${failed.join(", ")}`); process.exit(1); }
