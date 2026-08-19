// Battle items for the arena's JRPG command menu.
//
// Every bout hands both fighters the same small field kit, so the Items command is never an empty menu and
// healing is always a real tactical option — spend a turn drinking, or spend it swinging. These are bout-local:
// they are NOT the consumable economy, they cost nothing and they refresh each fight, so there is no way to
// walk into the arena under-equipped and no trap where the right play is burning a 6,500-gold potion.
//
// Usage: node scripts/gen-arena-art.mjs [key …]   (no args = every piece missing art)
//
// House rule: never ask for outlines-as-rims, sticker edges or drop shadows — they bake a white halo into the
// cutout. Bold INK CONTOUR is the wanted look. Nothing that invites lettering either: a labelled bottle comes
// back with misspelled words printed on it.
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

import "./lib/ai-trace.mjs"; // every OpenAI call lands in the AI Costs history

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const KEY = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!KEY) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/arena";
fs.mkdirSync(OUT, { recursive: true });

const STYLE = "Painterly cel-shaded 2D video-game art, bold clean dark outlines, chunky readable silhouette, high contrast, vibrant colors, soft inner shading, fantasy action-RPG style.";
const CUTOUT = "ISOLATED as a clean die-cut sprite on a FULLY TRANSPARENT background (alpha channel) — absolutely NO backdrop, NO scenery, NO ground, NO cast shadow, NO glow halo, NO white sticker rim. Nothing but the subject. No text, no words, no letters, no label, no logo, no watermark, no border.";
const SKILL = `A single fantasy ABILITY ICON — an abstract magical emblem of a combat move, no character, no scenery, bold and readable at small size, centered and filling most of the frame. ${STYLE} ${CUTOUT}`;
const OBJ = `A single fantasy ARENA item game icon, three-quarter view, centered and filling most of the frame. ${STYLE} ${CUTOUT}`;

const ART = {
    // Unlabelled on purpose — the moment a bottle gets a paper label the model writes crooked nonsense on it.
    "item-poultice": [`${OBJ} A squat round field-medicine jar of thick amber glass with a cork stopper and a leather cord wound round its neck, filled with deep red liquid, a sprig of green herb tucked under the cord.`, "icon"],
    // ── THE DECK ────────────────────────────────────────────────────────────────────────────────────────
    // A monster hauled up on your line was fighting in the colosseum, which is where every other arena bout
    // happens — mechanically right and a plain fiction break: you pulled the thing out of the sea and then
    // stood in a stone amphitheatre with bunting to hit it. Same plate treatment as the colosseum, same
    // framing and horizon, so the two are interchangeable behind the fighters.
    "deck-bg": [`A wide atmospheric SHIP DECK background plate, empty of characters: the weathered planking of a
        large wooden sailing ship's main deck in the foreground running to the viewer, a heavy wooden rail and
        rigging ropes along the sides, a mast base and coiled rope to one side, open sea and a low horizon
        beyond the rail, spray and wet timber catching the light, deep perspective across the boards. Painterly
        cel-shaded 2D video-game art, bold clean outlines, rich saturated colour, dramatic moody lighting,
        fantasy action-RPG style. No characters, no creatures, no people, no text, no words, no logo, no
        watermark, no UI, no border.`, "scene"],

    "arena-bg": [`A wide atmospheric fantasy COLOSSEUM INTERIOR background plate, empty of characters: a sunlit sand arena floor in the foreground, curved tiers of weathered honey-coloured stone seating rising behind, deep shadowed archways around the ring, colourful triangular pennants strung above, dust motes in warm low sunlight, deep perspective. Painterly cel-shaded 2D video-game art, bold clean outlines, rich saturated colour, dramatic moody lighting, fantasy action-RPG style. No characters, no creatures, no people, no text, no words, no logo, no watermark, no UI, no border.`, "scene"],
    // ── SKILL ICONS ── one per ARCHETYPE, so an ability is represented by the MOVE rather than by the ring
    // or cape it happens to come from. Element colour is applied in CSS on top, so nineteen icons cover every
    // affinity without nineteen more generations.
    "skill-firstHitMult": [`${SKILL} a coiled fist wreathed in a shockwave, the opening blow of a duel.`, "icon"],
    "skill-firstHitCrit": [`${SKILL} a cracked bullseye struck dead centre by a glowing spike.`, "icon"],
    "skill-eruptChance": [`${SKILL} a burst of molten fire erupting upward from a cracked stone.`, "icon"],
    "skill-critMult": [`${SKILL} a sword point piercing a glowing weak-point rune, sparks flying.`, "icon"],
    "skill-opportunist": [`${SKILL} a curved dagger over a cracked skull, an execution mark.`, "icon"],
    "skill-onslaught": [`${SKILL} three overlapping speed-blurred blades in a rushing charge.`, "icon"],
    "skill-giantSlayer": [`${SKILL} a small blade driven into an enormous cracked stone gauntlet.`, "icon"],
    "skill-vanguard": [`${SKILL} a banner-topped spear crossed with a rising golden arrow.`, "icon"],
    "skill-attuned": [`${SKILL} a floating elemental orb ringed by orbiting runes.`, "icon"],
    "skill-bloodlust": [`${SKILL} a snarling fanged maw wreathed in crimson smoke.`, "icon"],
    "skill-packTactics": [`${SKILL} three interlocking wolf-head shields forming a wall.`, "icon"],
    "skill-overcharge": [`${SKILL} a crystal overloading with lightning, cracks blazing white.`, "icon"],
    "skill-highroller": [`${SKILL} two tumbling dice trailing golden sparks.`, "icon"],
    "skill-beastbond": [`${SKILL} a glowing paw print overlapping a human handprint.`, "icon"],
    "skill-warbanner": [`${SKILL} a tattered war banner on a spear, planted and glowing.`, "icon"],
    "skill-xpOnHit": [`${SKILL} an open rune-lit tome with a star rising from its pages.`, "icon"],
    "skill-goldOnHit": [`${SKILL} a coin purse bursting open mid-air, coins spilling.`, "icon"],
    "skill-ticketOnCrit": [`${SKILL} a golden raffle ticket caught in a swirl of luck-sparks.`, "icon"],
    "skill-extraStrikes": [`${SKILL} a winged boot kicking up a trail of afterimages.`, "icon"],
    "item-draught": [`${OBJ} A slender tapered vial of clear glass in a brass filigree cradle, filled with luminous electric-blue liquid giving off a few floating sparks, stoppered with a polished blue gem.`, "icon"],
};

// The colosseum is the one image on screen at full size for the whole fight, and it was generated at icon
// quality: 64kb of mush that reads as one blurry texture behind the fighters. Backdrops get the better tier
// and real pixels, exactly like the dungeon plates do.
const SIZE = { icon: "1024x1024", scene: "1536x1024" };
const PX = { icon: 256, scene: 1280 };

async function generate(prompt, kind) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const r = await fetch("https://api.openai.com/v1/images/generations", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
                body: JSON.stringify({
                    model: "gpt-image-1", prompt, size: SIZE[kind], quality: kind === "scene" ? "medium" : "low", n: 1,
                    ...(kind === "scene" ? {} : { background: "transparent" }),
                }),
            });
            if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 140)}`);
            const b64 = (await r.json())?.data?.[0]?.b64_json;
            if (!b64) throw new Error("no image");
            return Buffer.from(b64, "base64");
        } catch (e) {
            if (attempt === 3) throw e;
            await new Promise((res) => setTimeout(res, 4000 * attempt));
        }
    }
    return null;
}

const want = process.argv.slice(2);
const keys = Object.keys(ART).filter((k) => (want.length ? want.includes(k) : !fs.existsSync(path.join(OUT, `${k}.webp`))));
console.log(`${keys.length} arena images to generate`);

const failed = [];
let done = 0;
for (const k of keys) {
    const [prompt, kind] = ART[k];
    try {
        const buf = await generate(prompt, kind);
        const out = path.join(OUT, `${k}.webp`);
        await sharp(buf).resize({ width: PX[kind], withoutEnlargement: true })
            .webp(kind === "scene" ? { quality: 84 } : { quality: 88, alphaQuality: 100 }).toFile(out);
        done += 1;
        console.log(`✓ ${k} (${Math.round(fs.statSync(out).size / 1024)}kb)`);
    } catch (e) {
        failed.push(k);
        console.log(`✗ ${k}: ${e.message}`);
    }
}
console.log(`\nDONE — ${done}/${keys.length}`);
if (failed.length) { console.log(`FAILED: ${failed.join(", ")}`); process.exit(1); }
