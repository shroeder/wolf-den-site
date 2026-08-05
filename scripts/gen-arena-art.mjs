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
const OBJ = `A single fantasy ARENA item game icon, three-quarter view, centered and filling most of the frame. ${STYLE} ${CUTOUT}`;

const ART = {
    // Unlabelled on purpose — the moment a bottle gets a paper label the model writes crooked nonsense on it.
    "item-poultice": [`${OBJ} A squat round field-medicine jar of thick amber glass with a cork stopper and a leather cord wound round its neck, filled with deep red liquid, a sprig of green herb tucked under the cord.`, "icon"],
    "item-draught": [`${OBJ} A slender tapered vial of clear glass in a brass filigree cradle, filled with luminous electric-blue liquid giving off a few floating sparks, stoppered with a polished blue gem.`, "icon"],
};

const SIZE = { icon: "1024x1024" };
const PX = { icon: 256 };

async function generate(prompt, kind) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const r = await fetch("https://api.openai.com/v1/images/generations", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
                body: JSON.stringify({
                    model: "gpt-image-1", prompt, size: SIZE[kind], quality: "low", n: 1,
                    background: "transparent",
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
            .webp({ quality: 88, alphaQuality: 100 }).toFile(out);
        done += 1;
        console.log(`✓ ${k} (${Math.round(fs.statSync(out).size / 1024)}kb)`);
    } catch (e) {
        failed.push(k);
        console.log(`✗ ${k}: ${e.message}`);
    }
}
console.log(`\nDONE — ${done}/${keys.length}`);
if (failed.length) { console.log(`FAILED: ${failed.join(", ")}`); process.exit(1); }
