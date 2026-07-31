// A die-cut sprite for every fish species. The log is the whole point of fishing, and a log made of emoji
// (🐟 four times over) can't carry it — you couldn't tell a Sardine from a Marlin from a Bluefin.
//
// Same house style as everything else, SMALL_ICON_EXTRA because these are read in a log grid, and each fish is
// described side-on so the whole set reads as one plate of specimens rather than 24 unrelated drawings.
//
// Usage:  node scripts/gen-fish-sprites.mjs [id ...]     (no args = every missing one)
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { housePrompt, SMALL_ICON_EXTRA } from "../src/lib/marketplace/art-style.js";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/fish";
fs.mkdirSync(OUT, { recursive: true });
const ICON_PX = 192; // bigger than the nav icons — these are shown as trophy art on a catch, not just in a list

const POSE = "Shown side-on in full profile facing left, the whole animal visible from nose to tail, level in the water as if swimming.";

const FISH = {
    fish_sardine: "A small slender silver sardine with a blue-green back and a bright mirror-bright flank",
    fish_perch: "A silver perch with dark vertical bars along its flank and spiny dorsal fin",
    fish_mackerel: "A streamlined mackerel with iridescent blue-green tiger striping across its back",
    fish_crab: "A chunky red rock crab with thick claws raised, seen from the front",
    fish_squid: "A pale bay squid with long trailing tentacles and large dark eyes",
    fish_snapper: "A deep-bodied ruby-red snapper with large scales and a forked tail",
    fish_shrimp: "A large tiger prawn with bold orange and black banding and long antennae",
    fish_pufferfish: "A round inflated pufferfish covered in short spines, wide-eyed and comical",
    fish_lobster: "A vivid electric-blue lobster with heavy claws and a segmented tail",
    fish_octopus: "A reef octopus with coiled curling arms and a large domed mantle, mottled orange",
    fish_moonfish: "A disc-shaped silver moonfish glowing with pale moonlight, luminous and round",
    fish_swordfish: "A powerful swordfish with a long flat bill, tall crescent dorsal fin and deep blue back",
    fish_tuna: "A muscular bluefin tuna, torpedo-shaped with a steel-blue back and bright yellow finlets",
    fish_manta: "A vast manta ray seen from above with broad triangular wings and cephalic fins curled forward",
    fish_stormpike: "A long lean pike wreathed in crackling blue lightning, jaws bristling with teeth",
    fish_anglerfish: "A deep-sea anglerfish with an enormous toothy jaw and a glowing lure dangling over its head",
    fish_shark: "A great white shark with a grey back, white belly and open toothy jaws",
    fish_dolphin: "A translucent ghostly pale dolphin, faintly glowing and semi-transparent, trailing mist",
    fish_marlin: "A black marlin with a long spear bill, high sail-like dorsal fin and dark cobalt flanks",
    fish_coelacanth: "A primitive armoured coelacanth with thick lobed fins and heavy blue-grey scales",
    fish_whale: "A great whale with sunlight glowing warmly through its skin, barnacled and serene",
    fish_kraken: "A young kraken with thick suckered tentacles coiling around it, deep purple and menacing",
    fish_leviathan: "A small dragon-like sea leviathan with finned spines down its back and a serpentine body",
    fish_starfish: "A five-pointed star fallen from the sky, glowing gold-white with a comet shimmer",
};

const shrink = (buf) => sharp(buf)
    .resize(ICON_PX, ICON_PX, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 }).toBuffer();

const want = process.argv.slice(2);
const todo = Object.keys(FISH).filter((k) => (want.length ? want.includes(k) : !fs.existsSync(path.join(OUT, `${k}.png`))));
if (!todo.length) { console.log("nothing to do"); process.exit(0); }
console.log(`generating ${todo.length} fish sprites`);

async function one(k) {
    const prompt = housePrompt(FISH[k], { extra: `${POSE} ${SMALL_ICON_EXTRA}` });
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const resp = await fetch("https://api.openai.com/v1/images/generations", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
                body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", background: "transparent", quality: "medium", // "high" is 4x the price and vanishes in the downscale below — see art-style.js, n: 1 }),
            });
            if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 160)}`);
            const b64 = (await resp.json())?.data?.[0]?.b64_json;
            if (!b64) throw new Error("no image");
            const file = path.join(OUT, `${k}.png`);
            fs.writeFileSync(file, await shrink(Buffer.from(b64, "base64")));
            console.log(`✓ ${k} (${Math.round(fs.statSync(file).size / 1024)}kb)`);
            return true;
        } catch (e) {
            console.log(`… ${k} attempt ${attempt}: ${e.message}`);
            if (attempt === 3) { console.log(`✗ ${k} GAVE UP`); return false; }
            await new Promise((r) => setTimeout(r, 4000 * attempt));
        }
    }
    return false;
}

const queue = [...todo];
const results = [];
await Promise.all(Array.from({ length: 3 }, async () => {
    for (let k = queue.shift(); k; k = queue.shift()) results.push([k, await one(k)]);
}));
const failed = results.filter(([, ok]) => !ok).map(([k]) => k);
console.log(`\nDONE — ${results.length - failed.length}/${results.length}`);
if (failed.length) console.log(`FAILED: ${failed.join(", ")}`);
