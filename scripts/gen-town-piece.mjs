// ── ONE PIECE OF A TOWN'S OWN FURNITURE ──────────────────────────────────────────────────────────────────────
// Luke, looking at all seven streets at once: "every town should be kind of, like, unique ... there's life to
// it, not just like a few stalls" and "we need to redo them all to have them all thematically match where
// they're at so they don't clash so much with the environment."
//
// The towns already have their own skies, grounds and foregrounds. What they share is the FURNITURE — one gold
// wolf fountain standing in all seven, including on a lava flat — and the people. This draws a replacement for
// one piece in one town; TownClient asks for `<townId>_<key>` and falls back to the shared art, so a town can
// be redressed a piece at a time with no broken window in between.
//
// ⚠️ THREE AT A TIME, IN THE FOREGROUND, PRICED. It is Luke's money and the rule is in CLAUDE.md. Medium only.
//
//   node scripts/gen-town-piece.mjs ashfall_centerpiece ashfall_questgiver ashfall_vault
import fs from "node:fs";
import { register } from "node:module";

import sharp from "sharp";

register("./lib/app-loader.mjs", import.meta.url);
const { IMAGE_MODEL } = await import("@/lib/marketplace/image-model.js");

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const KEY = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();

// ── THE PIECES ───────────────────────────────────────────────────────────────────────────────────────────────
// Keyed exactly as TownClient asks for them: `<townId>_<artKey>`. A centrepiece stands at the middle of the
// street where the fountain does; a questgiver stands on the NPC line; a building sits on the ground line.
const PIECES = {
    // ── ASHFALL BASTION — a fortress on a lava flat, map 7, the end of the world ──
    ashfall_centerpiece: {
        kind: "prop",
        prompt: "A basalt forge-shrine: a squat hexagonal plinth of black volcanic rock, cracked with glowing "
            + "orange molten veins, with a bowl of liquid fire on top throwing sparks upward, and three "
            + "blackened iron chains hanging from its rim",
    },
    ashfall_questgiver: {
        kind: "npc",
        prompt: "A grizzled ash-scarred warden standing at ease: dark soot-stained plate over red-brown "
            + "leather, a heavy horned helm held under one arm, close-cropped grey beard, a long iron-shod "
            + "spear planted in the ground beside her, embers drifting past",
    },
    ashfall_vault: {
        kind: "building",
        prompt: "A squat fortified strongroom cut from black basalt blocks, banded with glowing-hot iron "
            + "straps, a single heavy riveted door with a brass wolf-head boss, narrow slit windows lit from "
            + "within, and molten light seeping from the cracks at its base",
    },
};

// The house look, reverse-engineered from the town art that shipped: painterly cel-shade, heavy dark ink
// contour, two or three flat tone steps, saturated, lit from the upper left.
const STYLE = "Painterly cel-shaded 2D video-game art with a heavy dark ink contour around the whole "
    + "silhouette and each major form, two or three flat tone steps per surface, rich saturated colour, "
    + "chunky slightly exaggerated proportions, lit from the upper left.";
// ⚠️ A SHADOW IS THE ONE THING THAT MUST NOT BE PAINTED IN. These sit on seven different painted grounds —
// ash, bog water, flagstones — and a baked shadow is a grey smear that belongs to none of them.
const BAN = "FULLY TRANSPARENT background — no ground, no cast shadow, no scene, no sky, no text, no letters, "
    + "no numbers, no logo, no frame, no border. Nothing but the object itself.";
const VIEW = {
    prop: "A SINGLE isolated object, centred, seen straight on from the side at eye level, standing upright.",
    npc: "A SINGLE standing character, centred, full body head to feet, facing the viewer three-quarters, "
        + "feet together on nothing.",
    building: "A SINGLE small building, centred, seen straight on from the front at eye level, its base flat.",
};

const want = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!want.length) { console.log(`pieces: ${Object.keys(PIECES).join(" ")}`); process.exit(0); }
if (want.length > 3) { console.error("Three at a time. It is Luke's money and he judges three on a sheet."); process.exit(1); }

console.log(`\n${want.length} image(s) at MEDIUM — about $${(want.length * 0.042).toFixed(2)}.\n`);

const OUT = "public/images/town/piece";
fs.mkdirSync(OUT, { recursive: true });

for (const key of want) {
    const piece = PIECES[key];
    if (!piece) { console.error(`no such piece: ${key}`); continue; }
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
            model: IMAGE_MODEL, prompt: `${piece.prompt}. ${VIEW[piece.kind]} ${STYLE} ${BAN}`,
            // ⚠️ MEDIUM. Never high — see the rule at the top of CLAUDE.md.
            size: piece.kind === "npc" ? "1024x1536" : "1024x1024",
            quality: "medium", background: "transparent", n: 1,
        }),
    });
    if (!resp.ok) { console.log(`✗ ${key}: ${resp.status} ${(await resp.text()).slice(0, 180)}`); continue; }
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) { console.log(`✗ ${key}: no image back`); continue; }

    // ⚠️ ALPHA FLOORED BEFORE THE TRIM — "transparent" from this model is routinely alpha 1-30 around the
    // subject, so trimming without the floor finds the whole plate and crops nothing.
    const { data, info } = await sharp(Buffer.from(b64, "base64")).ensureAlpha().raw()
        .toBuffer({ resolveWithObject: true });
    for (let i = 3; i < data.length; i += 4) if (data[i] <= 40) data[i] = 0;
    const out = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
        .trim({ threshold: 1 }).webp({ quality: 92 }).toBuffer();
    fs.writeFileSync(`${OUT}/${key}.webp`, out);
    const m = await sharp(out).metadata();
    console.log(`✓ ${key}  ${m.width}x${m.height}  ${Math.round(out.length / 1024)}kb`);
}
