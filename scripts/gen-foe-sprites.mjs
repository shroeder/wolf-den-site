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
// Usage:  node scripts/gen-foe-sprites.mjs [key ...]              (no args = every missing one)
//         node scripts/gen-foe-sprites.mjs --sheet                (contact sheet of all 25; free)
//         node scripts/gen-foe-sprites.mjs --flip drowned_scrapper (mirror by hand; free)
import fs from "node:fs";

import { put } from "@vercel/blob";
import { neon } from "@neondatabase/serverless";
import sharp from "sharp";

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

// ── FACING RIGHT, AND IT HAS TO BE ───────────────────────────────────────────────────────────────────────────
// This said LEFT for its whole life, on the reasoning that these foes charge the player's side of the plaza.
// That reasoning skipped the screen they are actually FOUGHT on. A town skirmish is an arena bout — it resolves
// through startBout with a `town` rider — so a foe is drawn by ArenaClient, and ArenaClient MIRRORS every foe:
// "a foe's rest pose is scaleX(-1)", supplied by arBreatheFoe, because arena fighters are drawn facing right and
// have to turn to meet a hero standing on the left. A sprite authored facing left therefore renders facing RIGHT
// — back to back with your hero for the whole fight, which is exactly how it looked in the plaza's skirmishes.
//
// So: right, like every other fighter in this game. The plaza is unaffected — a roaming enemy there is flipped
// per-enemy anyway (`scaleX(en.flip ? -1 : 1)`), so it was never relying on a fixed direction.
// Verify with `--sheet --ingame`, which applies the same mirror and shows you what the player gets.
const POSE = "Full body, standing in a menacing ready stance, facing and looking toward the RIGHT of the image.";

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

/** Every foe sprite currently live, in roster order, as { key, url }. */
async function roster() {
    const rows = await sql.query(`SELECT art_key, url FROM mkt_town_art WHERE art_key LIKE 'foe_%'`);
    const byKey = new Map(rows.map((r) => [r.art_key, r.url]));
    return Object.keys(FOES).map((k) => ({ key: k, url: byKey.get(`foe_${k}`) || null })).filter((f) => f.url);
}

// ── THE ONLY AUDIT THAT WORKS ────────────────────────────────────────────────────────────────────────────────
// A contact sheet, read by eye — the same pass gen-ladder-rungs.mjs has, and here for the same reason. These
// foes are drawn facing LEFT because they stand on the right of the plaza and charge the player, and the model
// gets that wrong often enough to matter: a foe drawn facing right stands back-to-back with your hero for the
// whole fight. Nothing automatic catches it. A vision model asked "which way is this facing?" flip-flops — on
// the fleet captains it flipped twelve, then re-read its own output and called ten of those left-facing again.
// So: read the sheet, then --flip the wrong ones by hand. Labelled, because a fix needs a name to act on.
// `--ingame` is the one worth reading. The fight screen MIRRORS every foe — "a foe's rest pose is scaleX(-1)",
// supplied by arBreatheFoe in ArenaClient — because arena fighters are drawn facing right and have to turn to
// meet a hero who stands on the left. So the sprite on the blob is NOT what the player sees, and auditing the
// source art means holding the mirror in your head for twenty-five figures. Don't: pass --ingame and read the
// picture the player actually gets. Anything facing RIGHT there is facing away from the hero, and is a bug.
if (want.includes("--sheet")) {
    const inGame = want.includes("--ingame");
    const foes = await roster();
    const cell = 300, pad = 22, cols = 5, rows = Math.ceil(foes.length / cols);
    const comp = [];
    for (let i = 0; i < foes.length; i += 1) {
        const buf = Buffer.from(await (await fetch(foes[i].url)).arrayBuffer());
        const left = (i % cols) * cell, top = Math.floor(i / cols) * (cell + pad);
        const img = sharp(buf).resize(cell - 12, cell - 12, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } });
        comp.push({ input: await (inGame ? img.flop() : img).png().toBuffer(), left: left + 6, top: top + 6 });
        // The hero stands on the LEFT of the ring, so a correct foe looks back down this arrow.
        comp.push({
            input: Buffer.from(`<svg width="${cell}" height="${pad}"><text x="${cell / 2}" y="15" font-family="monospace"
                font-size="13" fill="#333" text-anchor="middle">← ${foes[i].key}</text></svg>`),
            left, top: top + cell,
        });
    }
    const out = inGame ? "foe-sheet-ingame.png" : "foe-sheet.png";
    await sharp({ create: { width: cols * cell, height: rows * (cell + pad), channels: 4, background: { r: 250, g: 250, b: 252, alpha: 1 } } })
        .composite(comp).png().toFile(out);
    console.log(`wrote ${out} — ${foes.length} foes, ${cols} across.`);
    console.log(inGame ? "This is what the fight screen shows. Each should face LEFT, into the arrow." : "Source art, unmirrored. Add --ingame to see what the player gets.");
    process.exit(0);
}

// Mirror by hand, after reading the sheet. Lossless, free, and it re-uploads rather than editing in place so a
// cached <img> cannot keep serving the old orientation.
if (want.includes("--flip")) {
    const keys = want.filter((a) => !a.startsWith("--"));
    if (!keys.length) throw new Error("--flip needs at least one foe key, e.g. drowned_scrapper");
    for (const k of keys) {
        if (!FOES[k]) { console.log(`skip (not a foe): ${k}`); continue; }
        const row = await sql.query(`SELECT url FROM mkt_town_art WHERE art_key = $1`, [`foe_${k}`]);
        if (!row[0]?.url) { console.log(`skip (never generated): ${k}`); continue; }
        const src = Buffer.from(await (await fetch(row[0].url)).arrayBuffer());
        const blob = await put(`marketplace/foes/${k}-${Date.now()}.png`, await sharp(src).flop().png().toBuffer(),
            { access: "public", contentType: "image/png", token: BLOB });
        await sql.query(`UPDATE mkt_town_art SET url = $2, updated_at = NOW() WHERE art_key = $1`, [`foe_${k}`, blob.url]);
        console.log(`flipped ${k}`);
    }
    process.exit(0);
}

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
