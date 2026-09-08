// ── THE THREE THAT ONLY THE BEST CHESTS HOLD ─────────────────────────────────────────────────────────────────
// Battle sprites for the Vaultwyrm, the Lodestar and the Ammonite — the base form plus all four evolved
// rungs, because a pet that levels has to visibly evolve or the levelling means nothing.
//
// Pet sprites are NOT static files: the app reads them from mkt_pet_sprite / mkt_pet_sprite_level with the
// image itself on Vercel Blob. So this writes to both, exactly as the in-app generator does, while calling
// OpenAI directly rather than driving the site's admin endpoints.
//
// ⚠️ THE WORDING IS IMPORTED, NOT COPIED. gen-fishing-pet-sprites.mjs restates POSE and LEVEL_EVOLUTION
// inline and still carries the PRE-REWRITE text ("a faint magical aura and a more confident stance") — the
// exact vague line that was replaced for inviting the model to reinterpret the whole creature. Twenty sprites
// came out of wording nobody meant to use. pet-sprite-prompt.js exists so this file cannot repeat that.
//
// Levels 2-5 are EDITS anchored on the Lv1 image, which is the structural fix for identity drift: the pixels
// of the base form carry forward, so "the same creature, later" is not something the model has to infer.
//
// Usage:
//   node scripts/gen-celestial-pet-sprites.mjs --base           just the three base forms, for a contact sheet
//   node scripts/gen-celestial-pet-sprites.mjs --yes            the whole set (15 images)
//   node scripts/gen-celestial-pet-sprites.mjs --only lodestar
import fs from "node:fs";

import { put } from "@vercel/blob";
import { neon } from "@neondatabase/serverless";

import { COLLECTIBLES } from "../src/lib/marketplace/collectibles.js";
import {
    PET_SPRITE_LEVELS, buildPetSpritePrompt, buildPetSpriteLevelEditPrompt,
} from "../src/lib/marketplace/pet-sprite-prompt.js";
import { quality, priceRun, requirePreview } from "./lib/gen-guard.mjs";
import "./lib/ai-trace.mjs"; // every OpenAI call here lands in the AI Costs history

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const env = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
const pick = (src, k) => src.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();
const OPENAI = pick(props, "OPENAI_API_KEY") || pick(env, "OPENAI_API_KEY");
const BLOB = pick(env, "BLOB_READ_WRITE_TOKEN");
const DB = pick(env, "DATABASE_URL");
if (!OPENAI || !BLOB || !DB) throw new Error(`missing key(s): openai=${!!OPENAI} blob=${!!BLOB} db=${!!DB}`);
const sql = neon(DB);

const IDS = ["vaultwyrm", "lodestar", "ammonite"];
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const ONLY = (arg("--only") || "").split(",").filter(Boolean);
const BASE_ONLY = process.argv.includes("--base");
const KEEP_BASE = process.argv.includes("--keep-base");
// ──── REROLLING ONE RUNG ──────────────────────────────────────────────────────
// Two failures only ever show up on the full contact sheet, and both are rerolls rather than prompt edits:
// a hard drawn OUTLINE around the creature, and the top rung collapsing into the same gold blaze as every
// other pet's top rung — which costs the animal its own colours. Both hit the Lodestar's Lv4 and Lv5.
// So a rung can be bought again on its own without repricing the other thirteen.
const LEVELS = (arg("--levels") || "").split(",").filter(Boolean).map(Number);
const Q = quality();

const pets = COLLECTIBLES.filter((p) => IDS.includes(p.id) && (!ONLY.length || ONLY.includes(p.id)));
if (!pets.length) throw new Error("no matching pets");

// The bill, before a single call. --base is the contact sheet: three maximally different subjects, looked at
// before fifteen images are bought (see the note in gen-guard.mjs about the $65 day).
// Two lines because the run is two different purchases: a fresh generate per pet, and an EDIT per rung which
// carries the Lv1 image in with it and is priced accordingly.
const nBase = KEEP_BASE ? 0 : pets.length;
const nLevels = BASE_ONLY ? 0
    : pets.length * (LEVELS.length ? PET_SPRITE_LEVELS.filter((n) => LEVELS.includes(n)).length : PET_SPRITE_LEVELS.length);
console.log(`${pets.map((p) => p.name).join(", ")} — ${BASE_ONLY ? "base forms only" : "full set"}`);
const bill = (nBase ? priceRun({ count: nBase, size: "1024x1024", quality: Q }) : 0)
    + (nLevels ? priceRun({ count: nLevels, size: "1024x1024", quality: Q, edit: true }) : 0);
console.log(`  total $${bill.toFixed(2)}`);
requirePreview({ count: nBase + nLevels, total: bill });

const ai = async (path, body, form = null) => {
    const res = await fetch(`https://api.openai.com/v1/images/${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI}`, ...(form ? {} : { "Content-Type": "application/json" }) },
        body: form || JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`${path}: ${json?.error?.message || res.status}`);
    return Buffer.from(json.data[0].b64_json, "base64");
};

const store = async (buf, name) => {
    const { url } = await put(`marketplace/pet/${name}-${Date.now()}.png`, buf, {
        access: "public", token: BLOB, contentType: "image/png",
    });
    return url;
};

for (const pet of pets) {
    console.log(`\n── ${pet.name} ─────────────────────────────`);

    // ──── THE BASE FORM ────────────────────────────────────────────────────────────────
    // ⚠️ --keep-base IS NOT AN OPTIMISATION, IT IS THE POINT OF THE CONTACT SHEET. The whole reason for
    // looking at three base forms before buying twelve more is to APPROVE those three — and a second run
    // that regenerates them throws away the thing that was approved and anchors every level to a creature
    // nobody looked at. So a set run reuses the exact PNG from the preview run off disk.
    fs.mkdirSync("out/pets", { recursive: true });
    const onDisk = `out/pets/${pet.id}-1.png`;
    let basePng;
    if (KEEP_BASE && fs.existsSync(onDisk)) {
        basePng = fs.readFileSync(onDisk);
        console.log(`  Lv1  reusing the approved base form from ${onDisk}`);
    } else {
        basePng = await ai("generations", {
            model: "gpt-image-1", prompt: buildPetSpritePrompt(pet),
            size: "1024x1024", background: "transparent", quality: Q, n: 1,
        });
        const baseUrl = await store(basePng, `${pet.id}-base`);
        await sql`INSERT INTO mkt_pet_sprite (pet_id, url) VALUES (${pet.id}, ${baseUrl})
                  ON CONFLICT (pet_id) DO UPDATE SET url = ${baseUrl}`;
        fs.writeFileSync(onDisk, basePng);
        console.log(`  Lv1  ${baseUrl}`);
    }
    if (BASE_ONLY) continue;

    // ── AND FOUR RUNGS OF THE SAME ANIMAL ────────────────────────────────────────────────────────────
    // Each one edits the BASE image rather than the rung below it: drift compounds down a chain, so five
    // independent readings of a sentence produce five creatures and five edits of an edit produce a slow
    // slide away from the first. Anchoring every rung to Lv1 keeps the individual fixed.
    for (const level of PET_SPRITE_LEVELS.filter((n) => !LEVELS.length || LEVELS.includes(n))) {
        const form = new FormData();
        form.append("model", "gpt-image-1");
        form.append("image", new Blob([basePng], { type: "image/png" }), "base.png");
        form.append("prompt", buildPetSpriteLevelEditPrompt(pet, level));
        form.append("size", "1024x1024");
        form.append("background", "transparent");
        form.append("quality", Q);
        const png = await ai("edits", null, form);
        const url = await store(png, `${pet.id}-lv${level}`);
        // ⚠️ THE UNIQUE KEY IS (pet_id, level, VARIANT), not (pet_id, level). Level 6 has two sprites,
        // one per enshrining stone, so variant is part of the identity — and ON CONFLICT against a
        // constraint that does not exist fails outright rather than falling back to an insert.
        await sql`INSERT INTO mkt_pet_sprite_level (pet_id, level, url, updated_at)
                  VALUES (${pet.id}, ${level}, ${url}, NOW())
                  ON CONFLICT (pet_id, level, variant)
                  DO UPDATE SET url = ${url}, updated_at = NOW(), flip = FALSE, facing_checked_at = NULL`;
        fs.writeFileSync(`out/pets/${pet.id}-${level}.png`, png);
        console.log(`  Lv${level}  ${url}`);
    }
}

console.log(`\ndone — copies in out/pets/ for eyeballing.`);
