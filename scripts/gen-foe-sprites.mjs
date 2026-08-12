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
import "./lib/ai-trace.mjs"; // every OpenAI call in this script lands in the AI Costs history

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
    // ── THE FROST PACK ── fast, thin, and there are a lot of them. Blues and whites, nothing heavy.
    frost_scrapper: "A lean white-furred wolf-kin whelp in frost-rimed leather scraps, baring its teeth, breath steaming, ice crusting its claws",
    frost_archer: "A slender pale wolf-kin ice-spitter in light blue-grey furs, mid-throw with a jagged icicle javelin, frost trailing behind it",
    frost_shieldbearer: "A broad wolf-kin warrior in thick rime-crusted hide armour behind a slab of blue-white glacier ice used as a shield",
    frost_elite: "A snow-white wolf-kin pack alpha in a torn winter cloak, twin bone-handled ice axes raised, blizzard swirling around it",
    frost_chieftain: "The Winter Wolf — an enormous frost-maned wolf-kin warlord in glacial plate armour, greataxe of blue ice hoisted overhead, roaring",
    // ── THE DROWNED CREW ── heavy, waterlogged, encrusted. Greens and rusts, everything sodden.
    drowned_scrapper: "A waterlogged drowned sailor in rotted oilskins, seaweed hanging off it, rusted gutting knife in hand, hollow eyes",
    drowned_archer: "A drowned harpooner in tattered sailcloth, hoisting a barbed rusted harpoon on a coil of wet rope, barnacles on its arms",
    drowned_shieldbearer: "A hulking drowned brute armoured head to toe in barnacle-crusted ship plating, using a torn iron hull plate as a shield",
    drowned_elite: "The Bosun — a drowned officer in a rotted navy coat and tricorn, brass whistle at its lips, cutlass drawn, water pouring off it",
    drowned_chieftain: "Captain Grine — a towering drowned pirate captain in a barnacled greatcoat, one arm a rusted anchor, kraken ink swirling around him",
    // ── THE HOLLOW COURT ── spectral nobility. Candlelight, gilt, and nothing inside the clothes.
    hollow_scrapper: "A spectral candle-bearer in tattered funeral livery, a guttering candelabra held aloft, face lost in shadow beneath the hood",
    hollow_archer: "A drifting spectral whisperer in grey court silks, hands weaving pale spell-light, mouth open in a soundless word",
    hollow_shieldbearer: "An empty suit of ornate gilded plate armour standing on its own, tower shield planted, cold blue light spilling from the visor",
    hollow_elite: "A court magister in rich violet and gold robes, spectral and half-transparent, arcane sigils burning in the air around raised hands",
    hollow_chieftain: "The Hollow Regent — a towering crowned spectre in ruined royal regalia on a throne of candles, sceptre raised, eyes two cold flames",
};

async function generate(prompt) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const resp = await fetch("https://api.openai.com/v1/images/generations", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI}` },
                // MEDIUM. It was on "low" after a cost cut (with a comment still claiming medium, which is how
                // nobody noticed) and the results were visibly poor — Luke's word was "they suck". The whole
                // roster is drawn at medium now, all 25, because a faction at a different quality to the one
                // standing next to it is worse than either setting. ~$0.042 an image against ~$0.011.
                body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", background: "transparent", quality: "medium", n: 1 }),
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
