// ── ART FOR THE SKILL PANEL ──────────────────────────────────────────────────────────────────────────────────
// Nine skill emblems and eighty-one branch nodes, one per entry in arena-skills.js. Every one of them has been
// borrowing art from the passive tree or the old gear-signature skills since the panel was built, which is
// fine for a lab and not fine for a screen members spend points on — three of the Warden's nodes were grey
// discs that mean nothing.
//
// THE SUBJECTS COME FROM THE CATALOG, not from a list typed beside it. A node's icon is generated from its own
// name and description, so a node that gets renamed or re-specced comes back with art that matches it instead
// of quietly keeping a picture of what it used to do. That is the whole reason this reads SKILLS rather than
// hard-coding ninety filenames.
//
//   node scripts/gen-skill-art.mjs                 everything missing
//   node scripts/gen-skill-art.mjs --force         redraw everything
//   node scripts/gen-skill-art.mjs --only rupture  one skill and its nine nodes
//   node scripts/gen-skill-art.mjs --quality medium
//
// Quality defaults to LOW, which is the house default (see art-style.js) — image output is ~91% of the OpenAI
// bill and low is ~15x cheaper than high. At the size these are drawn, 30-52px, the tier is invisible.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import { SKILLS } from "../src/lib/marketplace/arena-skills.js";
import { housePrompt, SMALL_ICON_EXTRA } from "../src/lib/marketplace/art-style.js";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const KEY = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!KEY) throw new Error("no OPENAI_API_KEY in accounting_app/local.properties");

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const FORCE = process.argv.includes("--force");
const ONLY = arg("--only", null);
const QUALITY = arg("--quality", "low");

const OUT = "public/images/arena/skill";
fs.mkdirSync(`${OUT}/node`, { recursive: true });

// ── WHAT TO DRAW ─────────────────────────────────────────────────────────────────────────────────────────────
// A skill emblem reads as the ACTION; a node reads as the MODIFICATION. Keeping those two framings apart is
// what stops ninety icons all looking like the same glowing rune — the emblem is the verb, the node is the
// adjective on it.
const emblemOf = (s) => housePrompt(
    `A fantasy COMBAT SKILL EMBLEM for a move called "${s.name}". ${s.blurb} `
    + "A bold abstract emblem of the ACTION itself — no character, no scenery, no hands. "
    + "Centered, filling the frame, instantly readable at small size.",
    { extra: SMALL_ICON_EXTRA },
);

const nodeOf = (s, b, n) => housePrompt(
    `A fantasy SKILL-TREE NODE ICON called "${n.name}", a modification to a combat skill called "${s.name}". `
    + `What it does: ${String(n.desc).replace(/^CAPSTONE\.\s*/, "")} `
    + `It belongs to the "${b.name}" branch — ${b.tag}. `
    + "A small abstract emblem, no character, no scenery, no text. Centered and filling the frame, "
    + `readable at 32 pixels. ${n.tier === 2 ? "This is a CAPSTONE: make it noticeably grander and brighter than an ordinary node." : ""}`,
    { extra: SMALL_ICON_EXTRA },
);

const jobs = [];
for (const s of SKILLS) {
    if (ONLY && s.id !== ONLY) continue;
    jobs.push({ key: `${s.id}`, file: `${OUT}/${s.id}.webp`, px: 256, prompt: emblemOf(s) });
    for (const b of s.branches) {
        for (const n of s.nodes.filter((x) => x.branch === b.id)) {
            jobs.push({ key: `${s.id}/${n.id}`, file: `${OUT}/node/${n.id}.webp`, px: 192, prompt: nodeOf(s, b, n) });
        }
    }
}

const todo = jobs.filter((j) => FORCE || !fs.existsSync(j.file));
console.log(`${jobs.length} pieces, ${todo.length} to draw at quality "${QUALITY}"`);
if (!todo.length) process.exit(0);

let done = 0;
let failed = 0;
for (const j of todo) {
    try {
        const r = await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
            body: JSON.stringify({ model: "gpt-image-1", prompt: j.prompt, size: "1024x1024", quality: QUALITY, n: 1 }),
        });
        const body = await r.json();
        const b64 = body?.data?.[0]?.b64_json;
        if (!b64) throw new Error(body?.error?.message || "no image came back");
        fs.mkdirSync(path.dirname(j.file), { recursive: true });
        // Stored at 2-4x the drawn size and no larger: a node is rendered at 30-34px and an emblem at 52px, so
        // anything past this is bytes on a phone connection buying detail nobody can resolve.
        await sharp(Buffer.from(b64, "base64"))
            .resize({ width: j.px, withoutEnlargement: true })
            .webp({ quality: 90, alphaQuality: 100 })
            .toFile(j.file);
        done += 1;
        console.log(`✓ ${j.key} (${Math.round(fs.statSync(j.file).size / 1024)}kb)  ${done}/${todo.length}`);
    } catch (e) {
        failed += 1;
        console.log(`✗ ${j.key} — ${e.message}`);
    }
}
console.log(`\ndrew ${done}, failed ${failed}`);
