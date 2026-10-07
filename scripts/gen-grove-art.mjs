// ── THE GROVE'S ART ──────────────────────────────────────────────────────────────────────────────────────────
// Map one of the node map: twelve zone backdrops, the four creatures the catalogue could not reuse, and the
// crystal rare spawn.
//
// ⚠️ NINE OF THE TWELVE ENEMIES ARE NOT HERE, ON PURPOSE. rootrat, grub, thornling, badger, gourdling,
// barrowhound, warren-mother, voidmoth and ashwraith already exist in public/images/delves and fit a forest
// exactly. Luke: "use whatever sprites we can to fit the theme. But generate new ones where we need to." Art
// already paid for is art already paid for — see check-existing-sprites-first.
//
// ⚠️ THE BACKDROPS ARE SIDE-ON, NOT RECEDING. Every other backdrop generator in this repo asks for "deep
// perspective receding into darkness", which is right for a room you stand in and wrong for a PLATFORMER. A
// vanishing point is only correct from one camera position, and this camera trolleys left and right across a
// zone that is also vertical. A flat, layered, side-scrolling plate is the only thing that holds up while the
// view moves. See scrolling-room-needs-flat-backdrop.
//
//   node scripts/gen-grove-art.mjs            # price it and stop
//   node scripts/gen-grove-art.mjs --apply    # draw it
//   node scripts/gen-grove-art.mjs --apply --only bg-thicket,crystal_stag
import fs from "node:fs";
import path from "node:path";
import { quality, priceRun } from "./lib/gen-guard.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const KEY = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
const OUT = "public/images/grove";
const APPLY = process.argv.includes("--apply");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const ONLY = (arg("--only") || "").split(",").map((s) => s.trim()).filter(Boolean);
const Q = quality();

const STYLE = "Painterly cel-shaded 2D video-game art, bold clean dark outlines, chunky readable silhouette, high contrast, vibrant colors, soft inner shading, fantasy action-RPG style.";
const CUTOUT = "ISOLATED as a clean die-cut sprite on a FULLY TRANSPARENT background (alpha channel) — absolutely NO backdrop, NO scenery, NO ground, NO cast shadow, NO glow halo, NO white sticker rim. Nothing but the subject. No text, no words, no letters, no logo, no watermark, no border.";

const FOE = `A single fantasy forest CREATURE, full body, three-quarter view facing the viewer, menacing but readable at small size. ${STYLE} ${CUTOUT}`;

// The platformer plate. Flat and layered rather than perspectival, and deliberately empty — the hero, the pet
// and fifteen to thirty enemies are drawn on top of this, so anything living in the plate would read as a
// creature you cannot hit.
const PLATE = `A wide SIDE-ON 2D platformer background plate for a forest game level. FLAT LAYERED composition with distinct foreground, midground and far background bands — NO vanishing point, NO deep perspective, NO receding corridor, as the camera scrolls sideways across it. Completely EMPTY of characters and creatures. Clear horizontal ground line along the bottom with room to walk. ${STYLE} No characters, no creatures, no people, no text, no words, no logo, no watermark, no UI, no border.`;

// key → [prompt, kind]
const ART = {
    // ── TWELVE ZONE BACKDROPS ───────────────────────────────────────────────────────────────────────
    "bg-thicket": [`${PLATE} ZONE: the bright outer edge of a forest. Slim birch and hazel, sun breaking through in warm shafts, long grass, a worn dirt path along the bottom. Fresh greens and gold. The safest-looking place in the wood.`, "plate"],
    "bg-hollow": [`${PLATE} ZONE: a damp mossy hollow. Everything carpeted in thick green moss, fallen logs furred with it, standing water in shallow pools, mushrooms in clusters. Cool wet greens, low soft light.`, "plate"],
    "bg-fernway": [`${PLATE} ZONE: a path through head-high ferns. Enormous fronds crowding in from both sides, dappled light, the trail barely visible underfoot. Lush layered greens, humid haze.`, "plate"],
    "bg-oldstand": [`${PLATE} ZONE: a stand of enormous ancient oaks. Massive trunks like pillars, huge gnarled surface roots forming natural steps and ledges, deep leaf litter, shafts of amber light far above. Heavy browns and deep green.`, "plate"],
    "bg-bramble": [`${PLATE} ZONE: a wall of thorned bramble deliberately planted. Dense interlocking thorn canes, dark red berries, narrow gaps hacked through, a crude wooden ladder against one. Dark greens, blood-red fruit, overcast light.`, "plate"],
    "bg-stubble": [`${PLATE} ZONE: a harvested field at the forest's edge at dusk. Cut stalks to the horizon, bound stooks standing in rows, a crooked fence, the treeline black behind. Dry golds and long violet shadows.`, "plate"],
    "bg-barrows": [`${PLATE} ZONE: grassy burial mounds in deliberate rows. Low turfed barrows with dark stone-lintel openings, leaning standing stones, ground mist. Muted greens and cold grey stone, overcast.`, "plate"],
    "bg-warren": [`${PLATE} ZONE: an underground warren of packed earth. Tunnel mouths at several heights connected by root ledges, hanging pale roots, cobwebs in the corners, faint green glow from clustered fungus. Deep browns and sickly green light.`, "plate"],
    "bg-mothlight": [`${PLATE} ZONE: a night clearing lit from the air. Pale luminous moths drifting in their hundreds as living lanterns, silver birches, dewed grass glittering, a deep blue night sky above. Cold blues and glowing pale gold.`, "plate"],
    "bg-rotwood": [`${PLATE} ZONE: a forest that burned long ago and never cooled. Black charred trunks still faintly smouldering orange at the cracks, grey ash drifted into dunes, thin smoke, no leaves anywhere. Charcoal, ember orange, dead grey.`, "plate"],
    "bg-palisade": [`${PLATE} ZONE: a crude goblin palisade in the deep wood. Sharpened log stakes driven in facing outward, rope bridges and plank platforms at several heights, tattered banners, cook-fires. Dark timber, rope, firelight.`, "plate"],
    "bg-heartwood": [`${PLATE} ZONE: the heart of the forest. ONE colossal ancient tree filling the frame, bark like cliff faces, immense roots forming broad terraces, soft golden light from inside a hollow in the trunk. Awe-inspiring, warm, very old. Deep gold and rich brown.`, "plate"],

    // ── THE FOUR CREATURES NOTHING EXISTING COVERED ─────────────────────────────────────────────────
    husk: [`${FOE} A STRAW WALKER: a shambling figure of bound field-stubble and twine with a sackcloth head, stitched button eyes, straw spilling from every seam, arms hanging long and loose. Dry golds and dirty cream.`, "foe"],
    goblin: [`${FOE} A PALISADE GOBLIN: a wiry green-skinned forest goblin in scavenged bark-and-rope armour, holding a crude spear made from a sharpened stake, teeth bared, crouched and ready to spring. Mossy green, rope brown, rust.`, "foe"],
    elderling: [`${FOE} An ELDERLING: a tall slow treefolk guardian of living heartwood, bark skin seamed with faint gold sap-light, a crown of antler-like branches, moss at the shoulders, long heavy arms. Ancient and grave, not hostile-looking. Deep brown bark and warm gold.`, "foe"],
    crystal_stag: [`${FOE} THE CRYSTAL STAG: a magnificent rare stag whose antlers and parts of its flank have grown into translucent faceted crystal, light refracting through them in pale violet and cyan, hooves trailing faint motes. Regal, luminous, unmistakably a once-in-a-session sight. Crystal violet, pale cyan, deep forest brown.`, "foe"],
};

const SIZES = { plate: "1536x1024", foe: "1024x1024" };

const keys = Object.keys(ART).filter((k) => !ONLY.length || ONLY.includes(k));
const plates = keys.filter((k) => ART[k][1] === "plate").length;
const foes = keys.length - plates;

const bill = priceRun({ count: plates, size: SIZES.plate, quality: Q })
    + priceRun({ count: foes, size: SIZES.foe, quality: Q });

console.log(`The Grove — ${keys.length} image(s): ${plates} zone plate(s), ${foes} creature(s)`);
console.log(`  quality ${Q}   estimated $${Number(bill).toFixed(2)}`);
console.log(`  reusing 9 existing sprites: rootrat, grub, thornling, badger, gourdling, barrowhound, warren-mother, voidmoth, ashwraith`);
if (!APPLY) { console.log("\ndry run — pass --apply to draw it"); process.exit(0); }
if (!KEY) throw new Error("no OPENAI_API_KEY");

fs.mkdirSync(OUT, { recursive: true });

let done = 0;
for (const key of keys) {
    const [prompt, kind] = ART[key];
    const file = path.join(OUT, `${kind === "plate" ? "" : "foe-"}${key.replace(/^bg-/, "zone-")}.webp`);
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
            model: "gpt-image-1",
            prompt,
            size: SIZES[kind],
            quality: Q,
            // A plate is a full-bleed background; a creature is a cutout.
            background: kind === "foe" ? "transparent" : "opaque",
            output_format: "webp",
            n: 1,
        }),
    });
    if (!resp.ok) {
        console.log(`  FAILED ${key}: ${resp.status} ${(await resp.text()).slice(0, 160)}`);
        continue;
    }
    const data = await resp.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) { console.log(`  FAILED ${key}: no image back`); continue; }
    fs.writeFileSync(file, Buffer.from(b64, "base64"));
    done += 1;
    console.log(`  ${done}/${keys.length}  ${file}`);
}
console.log(`\n[ai-trace] gen-grove-art: ${done} OpenAI calls`);
