// ── THE PEOPLE STANDING IN THE GROVE ─────────────────────────────────────────────────────────────────────────
// Twenty-one quest-givers and seven Coliseum marshals, one set per built map, drawn to the house character
// style so they stand beside the hero without looking imported.
//
// ⚠️ PORTRAIT CANVAS, NOT SQUARE. A standing figure drawn into a square plate loses its head-dress, its hat
// brim and the top of whatever it is carrying — the same clipping that cost a full sprite re-run once before.
// 1024x1536 fixes it at medium and the difference dies in the downscale anyway.
//
// ⚠️ IMAGE_MODEL, NOT A LITERAL. Most generators in this repo still name gpt-image-1, which has been gone
// from /v1/images/generations since 2026-10-23 and answers 400 "does not exist" — which reads like an API key
// problem and is not one.
//
//   node scripts/gen-grove-npcs.mjs                      # price it and stop
//   node scripts/gen-grove-npcs.mjs --apply --only alder,mub,rook
//   node scripts/gen-grove-npcs.mjs --apply              # the lot
import fs from "node:fs";
import path from "node:path";
import { register } from "node:module";

register("./lib/app-loader.mjs", import.meta.url);

import { quality, priceRun } from "./lib/gen-guard.mjs";

const { IMAGE_MODEL, HOUSE_CHARACTER_TAIL } = await import("@/lib/marketplace/image-model.js");
const { GROVE_NPCS, COLISEUM_NPCS } = await import("@/lib/marketplace/grove-npcs.js");
const { GROVE_MAPS } = await import("@/lib/marketplace/grove-maps.js");

const Q = quality();
const SIZE = "1024x1536";
const OUT = "public/images/grove";
const APPLY = process.argv.includes("--apply");
const ONLY = (process.argv.find((a) => a.startsWith("--only="))
    || (process.argv.includes("--only") ? `--only=${process.argv[process.argv.indexOf("--only") + 1]}` : ""))
    .replace("--only=", "").split(",").map((s) => s.trim()).filter(Boolean);

const KEY = (() => {
    const lp = "C:/Users/Luke/Projects/accounting_app/local.properties";
    const line = fs.readFileSync(lp, "utf8").split(/\r?\n/).find((l) => l.startsWith("OPENAI_API_KEY="));
    return line ? line.slice("OPENAI_API_KEY=".length).trim() : process.env.OPENAI_API_KEY;
})();

// What each map looks like, in the words the art should answer to. The NPC has to read as BELONGING to the
// place — a forest warden in the ash fields is just a man in the wrong coat.
const LOOK = {
    1: "ancient green forest, moss, huge roots, dappled warm light",
    2: "lightless cave under tree roots, pale bioluminescent fungus, wet stone",
    3: "drowned marsh, reeds, standing brown water, low grey mist",
    4: "storm-wrecked salt coast, driftwood, bleached rope, grey surf",
    5: "flooded stone ruins, broken columns, green water, sunken carving",
    6: "gold-coloured desert, glass sand, bleached bone, hard white sun",
    7: "burned black country, drifting ash, live orange embers in the cracks",
};

const JOBS = Object.fromEntries(GROVE_NPCS.map((n) => [n.id, `${n.role}. ${n.line}`]));

function promptFor(npc, isMarshal) {
    const look = LOOK[npc.map] || LOOK[1];
    const map = GROVE_MAPS.find((m) => m.n === npc.map);
    const job = isMarshal
        ? `the master of ceremonies outside a fighting arena. Showy, loud, dressed better than anyone else here`
        : JOBS[npc.id] || npc.role;
    return `A single standing character: ${npc.name}, ${job}
Setting they belong to: ${map?.name || ""} — ${look}.
Full body, facing the viewer, feet visible, standing at rest and waiting to be spoken to.
Clothing, tools and colours all drawn from that setting so they read as a local, not a visitor.
${HOUSE_CHARACTER_TAIL}`;
}

const ALL = [
    ...GROVE_NPCS.map((n) => ({ ...n, file: `npc-${n.id}`, marshal: false })),
    ...COLISEUM_NPCS.map((n) => ({ ...n, role: "Coliseum marshal", file: `npc-${n.id}`, marshal: true })),
];
const TARGETS = ALL.filter((n) => !ONLY.length || ONLY.includes(n.id));

const bill = priceRun({ count: TARGETS.length, size: SIZE, quality: Q });
console.log(`${TARGETS.length} sprites · ${SIZE} · quality ${Q} · model ${IMAGE_MODEL}`);
console.log(`estimated ${typeof bill === "number" ? `$${bill.toFixed(2)}` : bill}`);
if (!APPLY) { console.log("\nnothing drawn. --apply to draw."); process.exit(0); }
if (!KEY) { console.error("no OPENAI_API_KEY"); process.exit(1); }

fs.mkdirSync(OUT, { recursive: true });
let spent = 0;
for (const npc of TARGETS) {
    const dest = path.join(OUT, `${npc.file}.webp`);
    process.stdout.write(`  ${npc.name.padEnd(26)} `);
    const r = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
        // ⚠️ background AND output_format, BOTH. Omitting them does not fail — it returns a perfectly good
        // sprite with the transparency checkerboard PAINTED IN as flat grey, 3 channels, no alpha. It looks
        // correct in any preview that shows a checkerboard for transparency, which is every preview, so the
        // first 28 of these were drawn, inspected, and only caught by asking sharp for the alpha channel.
        // Cost $1.78 to learn. Check hasAlpha on one file before drawing a set.
        body: JSON.stringify({
            model: IMAGE_MODEL,
            prompt: promptFor(npc, npc.marshal),
            size: SIZE,
            quality: Q,
            n: 1,
            background: "transparent",
            output_format: "webp",
        }),
    });
    const j = await r.json();
    if (!r.ok) { console.log(`FAILED ${j?.error?.message || r.status}`); continue; }
    const b64 = j.data?.[0]?.b64_json;
    if (!b64) { console.log("no image back"); continue; }
    const sharp = (await import("sharp")).default;
    const buf = Buffer.from(b64, "base64");
    await sharp(buf).webp({ quality: 92 }).toFile(dest);
    // Refuse to call a sprite done if it came back without the alpha that makes it a sprite.
    const meta = await sharp(dest).metadata();
    if (!meta.hasAlpha) { console.log("NO ALPHA — the background was painted, not transparent"); continue; }
    spent += 1;
    console.log(`→ ${dest}`);
}
console.log(`\ndrew ${spent}/${TARGETS.length}`);
