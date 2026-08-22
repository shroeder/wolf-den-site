// ── THE REELS, DRAWN ─────────────────────────────────────────────────────────────────────────────────────────
// Every symbol on every reel was a Unicode glyph in a coloured box — a triangle standing in for a wolf. That
// was fine while the paytables were still moving, and it is the single biggest thing holding the floor back
// now that they have settled.
//
// PER MACHINE, NOT SHARED. The three cabinets already differ in volatility, cabinet art and reel colour, and
// the symbols are the thing you actually stare at, so they differ too: Wolf's Luck burns gold and its symbols
// are warm brass, Den Fortune is honey-coloured and homely, Moonrise is cold silver and violet. Same symbol
// IDS on every machine — the paytables and both gates are untouched — different art. Sixteen images, not
// seven, and the odds cannot notice.
//
// WHY THEY MUST READ AT 44 PIXELS. A reel symbol is smaller than a badge and it goes past at speed. Detail
// that survives that is silhouette and one strong colour; anything finer is mud. Every prompt below says so
// in numbers, because "make it simple" does not survive contact with an image model.
//
// Run:  node scripts/gen-slot-symbols.mjs                 preview, local PNGs only
//       node scripts/gen-slot-symbols.mjs --apply         write into public/images/casino/reels/
//       node scripts/gen-slot-symbols.mjs --publish       ship the previews you already looked at
//       node scripts/gen-slot-symbols.mjs --only=slot3    one cabinet
import fs from "node:fs";
import path from "node:path";

import { housePrompt } from "../src/lib/marketplace/art-style.js";
import { priceRun, quality, requirePreview } from "./lib/gen-guard.mjs";
import "./lib/ai-trace.mjs";

const ARGV = process.argv.slice(2);
const APPLY = ARGV.includes("--apply");
const PUBLISH = ARGV.includes("--publish");
const ONLY = (ARGV.find((a) => a.startsWith("--only="))?.slice(7) || "").split(",").filter(Boolean);
const Q = quality();

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const env = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
const pick = (src, k) => src.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();
const OPENAI = pick(props, "OPENAI_API_KEY") || pick(env, "OPENAI_API_KEY");
if (!OPENAI) throw new Error("no OPENAI_API_KEY");

const OUT = process.env.REEL_OUT || path.join(process.cwd(), ".reel-art");
const PUBLIC = path.join(process.cwd(), "public", "images", "casino", "reels");

// Said on every symbol, because every symbol has the same job: survive being 44 pixels wide, in a dark box,
// moving.
const READABLE =
    "It must read INSTANTLY at 44 pixels wide: one single object centred in frame, a bold unmistakable "
    + "silhouette, large simple shapes, high contrast against a dark background, and NO fine detail, no thin "
    + "lines, no small text, no background scenery. Generous empty margin on all four sides — nothing may "
    + "touch or cross the edge of the frame.";

// Three houses, three moods. The mood line goes on every symbol of that cabinet so a reel reads as a set.
const MACHINES = {
    slot: {
        mood: "Warm polished BRASS and deep gold, lit like a lamp is on it, rich and well-used and inviting.",
        symbols: {
            wolf: "a howling wolf's head in profile, carved from gold",
            chest: "a small treasure chest with its lid open and gold light spilling out",
            laurel: "a golden laurel wreath",
            doubloon: "a single thick gold coin seen face-on, a wolf's head stamped on it",
            bone: "a clean white bone, the classic dog-bone shape, on a brass mount",
            moon: "a crescent moon in warm pale gold",
        },
    },
    slot2: {
        mood: "HONEY-coloured and homely — warm amber, worn copper, soft and friendly rather than grand.",
        symbols: {
            wolf: "a friendly stylised wolf's head in profile, warm amber fur",
            chest: "a small round-topped wooden money box with copper bands, coins spilling from it",
            laurel: "a wheat-and-laurel sprig bound with a copper ribbon",
            moon: "a crescent moon in soft warm amber",
        },
    },
    slot3: {
        mood: "COLD moonlight — polished silver, deep violet shadow, pale blue rim light. Austere, expensive, "
            + "slightly eerie.",
        symbols: {
            wolf: "a howling wolf's head in profile, silver-white fur, violet shadow",
            moon: "a full moon, cratered, glowing pale blue-white",
            chest: "a dark iron strongbox banded in silver, violet light escaping the lid",
            laurel: "a frost-covered laurel wreath in silver-blue",
            star: "a single bright four-pointed star with a soft violet glow",
            bone: "a pale bone bleached white, cold blue shadow",
        },
    },
};

const jobs = [];
for (const [machineId, m] of Object.entries(MACHINES)) {
    if (ONLY.length && !ONLY.includes(machineId)) continue;
    for (const [symId, subject] of Object.entries(m.symbols)) {
        jobs.push({
            name: `${machineId}-${symId}`,
            prompt: housePrompt(`A slot-machine reel symbol: ${subject}.`, { extra: `${m.mood} ${READABLE}` }),
        });
    }
}
if (!jobs.length) { console.error("nothing to draw"); process.exit(1); }

if (PUBLISH) console.log(`publishing ${jobs.length} existing preview(s) — no OpenAI calls, $0.00`);
else {
    const bill = priceRun({ count: jobs.length, quality: Q });
    console.log(`${jobs.length} reel symbols${APPLY ? "" : " — PREVIEW ONLY, nothing written to public/"}`);
    if (APPLY) requirePreview({ count: jobs.length, total: bill });
}

fs.mkdirSync(OUT, { recursive: true });
if (APPLY || PUBLISH) fs.mkdirSync(PUBLIC, { recursive: true });

async function generate(prompt) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const resp = await fetch("https://api.openai.com/v1/images/generations", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI}` },
                body: JSON.stringify({
                    model: "gpt-image-1", prompt, size: "1024x1024",
                    background: "transparent", output_format: "png", quality: Q, n: 1,
                }),
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

const sharp = (await import("sharp")).default;
const queue = [...jobs];
const failed = [];
let done = 0;

await Promise.all(Array.from({ length: 3 }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
        try {
            let buf;
            if (PUBLISH) {
                const src = path.join(OUT, `${job.name}.png`);
                if (!fs.existsSync(src)) throw new Error(`no preview at ${src}`);
                buf = fs.readFileSync(src);
            } else {
                buf = await generate(job.prompt);
                fs.writeFileSync(path.join(OUT, `${job.name}.png`), buf);
            }
            if (APPLY || PUBLISH) {
                // 128px: the symbol renders at 44 and goes to about 64 on a big phone, so this is comfortably
                // past retina and still a few kilobytes. A 1024px PNG per symbol would be megabytes of reel.
                const webp = await sharp(buf).resize({ width: 128, height: 128, fit: "inside" })
                    .webp({ quality: 90 }).toBuffer();
                fs.writeFileSync(path.join(PUBLIC, `${job.name}.webp`), webp);
            }
            done += 1;
            console.log(`✓ ${job.name}`);
        } catch (e) {
            failed.push(job.name);
            console.log(`✗ ${job.name}: ${e.message}`);
        }
    }
}));

console.log(`\n${done}/${jobs.length} drawn${failed.length ? ` — failed: ${failed.join(", ")}` : ""}`);
console.log(`previews: ${OUT}${APPLY || PUBLISH ? `\npublished: ${PUBLIC}` : ""}`);
