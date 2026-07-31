// One sprite per FOE ARCHETYPE, per faction. Ten in total.
//
// The archetypes already fight differently — a shield-bearer shrugs off sloppy timing, an archer dies fast but
// bites back hard — but visually they were one shared goblin with a CSS tint, a scale factor and a badge
// emoji stuck on. So mechanical variety the server went to real trouble to create was invisible: every foe in
// the plaza read as the same guy in a different colour.
//
// Written into mkt_town_art under `foe_<faction>_<archetype>`, which is where the Town already reads its art
// from, so no new plumbing.
//
// Usage:  node scripts/gen-foe-sprites.mjs [key ...]     (no args = every missing one)
import fs from "node:fs";

import { put } from "@vercel/blob";
import { neon } from "@neondatabase/serverless";

import { housePrompt } from "../src/lib/marketplace/art-style.js";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const env = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
const pick = (src, k) => src.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();
const OPENAI = pick(props, "OPENAI_API_KEY") || pick(env, "OPENAI_API_KEY");
const BLOB = pick(env, "BLOB_READ_WRITE_TOKEN");
const DB = pick(env, "DATABASE_URL");
if (!OPENAI || !BLOB || !DB) throw new Error(`missing key(s): openai=${!!OPENAI} blob=${!!BLOB} db=${!!DB}`);
const sql = neon(DB);

// Full body, facing LEFT — they're charging the player's side of the plaza.
const POSE = "Full body, standing in a menacing ready stance, facing and looking toward the LEFT of the image.";

const FOES = {
    // ── GOBLINS ──
    goblin_scrapper: "A wiry green goblin brawler in scavenged leather scraps, clutching a crude rusty shortsword, snarling",
    goblin_archer: "A small lean green goblin archer in light rags, drawing a crude shortbow, quiver of ragged arrows on its back",
    goblin_shieldbearer: "A squat heavyset green goblin behind a huge battered iron shield almost as tall as itself, armored in mismatched plate",
    goblin_elite: "A goblin warchanter draped in violet ceremonial robes and bone fetishes, staff raised, crackling purple magic swirling around it",
    goblin_chieftain: "A hulking scarred goblin chieftain in spiked crimson armor hoisting a massive jagged cleaver, skull trophies at its belt, roaring",
    // ── BANDITS ──
    bandit_scrapper: "A human bandit cutpurse in a dark hood and travel-worn leathers, dagger held low in a reverse grip, face half-shadowed",
    bandit_archer: "A human bandit crossbowman in a studded leather jerkin, raising a loaded crossbow, bolts strapped across the chest",
    bandit_shieldbearer: "A burly human bandit bruiser in heavy dented plate behind a broad iron kite shield, mace in the other hand",
    bandit_elite: "A bandit lieutenant in a fine dark coat with gold trim and a feathered hat, twin sabres drawn, violet magic curling off the blades",
    bandit_chieftain: "The Bandit King — a towering armored warlord in a crimson cloak and horned helm, greatsword planted before him, skull trophies on his belt",
};

async function generate(prompt) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const resp = await fetch("https://api.openai.com/v1/images/generations", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI}` },
                body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", background: "transparent", quality: "medium", // "high" is 4x the price and vanishes in the downscale below — see art-style.js, n: 1 }),
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
const existing = new Set((await sql.query(`SELECT art_key FROM mkt_town_art WHERE art_key LIKE 'foe_%'`)).map((r) => r.art_key));
const todo = Object.keys(FOES).filter((k) => (want.length ? want.includes(k) : !existing.has(`foe_${k}`)));
if (!todo.length) { console.log("nothing to do"); process.exit(0); }
console.log(`generating ${todo.length}: ${todo.join(", ")}`);

const queue = [...todo];
let done = 0; const failed = [];
await Promise.all(Array.from({ length: 3 }, async () => {
    for (let k = queue.shift(); k; k = queue.shift()) {
        try {
            const buf = await generate(housePrompt(FOES[k], { extra: POSE }));
            const blob = await put(`marketplace/foes/${k}-${Date.now()}.png`, buf, { access: "public", contentType: "image/png", token: BLOB });
            await sql.query(
                `INSERT INTO mkt_town_art (art_key, url, updated_at) VALUES ($1, $2, NOW())
                 ON CONFLICT (art_key) DO UPDATE SET url = $2, updated_at = NOW()`,
                [`foe_${k}`, blob.url],
            );
            done += 1;
            console.log(`✓ ${k}`);
        } catch (e) { failed.push(k); console.log(`✗ ${k}: ${e.message}`); }
    }
}));
console.log(`\nDONE — ${done}/${todo.length}`);
if (failed.length) { console.log(`FAILED: ${failed.join(", ")}`); process.exit(1); }
