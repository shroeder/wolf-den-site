// ── THE ART FOR TWENTY-FIVE ISLANDS ──────────────────────────────────────────────────────────────────────────
// Four kinds of plate, and the counts are the whole reason twenty-five islands are affordable:
//
//   backdrop  25  one per island, 1536x1024  — the thing that makes a landfall feel like a NEW PLACE
//   prop      25  five per BIOME, die-cut    — shared by the five islands of that water
//   prize     25  one per island, die-cut    — the thing you cannot get anywhere else
//   warden    40  25 island + 15 escorts     — the unique fights on the way in
//
// ⚠️ THE BACKDROPS ARE FLAT, AND THAT IS NOT A STYLE CHOICE. The island scrolls sideways past a camera that
// never moves in depth. Any vanishing point drawn into the plate is correct from exactly ONE spot on the strip
// and wrong everywhere else — walk on and the whole island appears to swivel. See
// [[scrolling-room-needs-flat-backdrop]], which is the lesson the Forest's grove already paid for.
//
// ⚠️ THE WARDENS FIGHT ON THE SAME STAGE AS THE FLEET, so they obey the same contract as gen-encounters.mjs:
// ships and beasts in profile FACING LEFT, because the enemy stands on the right and the scene does not mirror
// (mirroring a hull mirrors its lighting with it).
//
//   node scripts/gen-islands.mjs                      # only what is missing
//   node scripts/gen-islands.mjs --force              # redraw everything
//   node scripts/gen-islands.mjs --only bellmouth     # one island, every plate it owns
//   node scripts/gen-islands.mjs --kind backdrop      # one kind, all of them
//   node scripts/gen-islands.mjs --dry                # price it and draw nothing
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import "./lib/ai-trace.mjs";
import { BIOMES, ISLANDS, PRIZES, biomeOf, prizeFor } from "../src/lib/marketplace/islands.js";
import { ESCORTS, WARDENS } from "../src/lib/marketplace/island-wardens.js";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/islands";
for (const d of ["", "/props", "/prize", "/warden"]) fs.mkdirSync(`${OUT}${d}`, { recursive: true });

const argv = process.argv.slice(2);
const FORCE = argv.includes("--force");
const DRY = argv.includes("--dry");
const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const ONLY = (flag("--only") || "").split(",").map((s) => s.trim()).filter(Boolean);
const KIND = flag("--kind");

// The real billed numbers, same table as ai-ledger.js. Printed up front so a run is priced before it is spent.
const COST = { "1024x1024": 1056 * 40 / 1e6, "1536x1024": 1568 * 40 / 1e6 };

const STYLE = "Painterly cel-shaded 2D video-game art, bold clean dark ink outlines, chunky readable "
    + "silhouette, rich saturated colour, dramatic rim light, storybook fantasy pirate style.";
const NEG = "No text, no letters, no numbers, no words, no logo, no watermark, no signature, no UI, no border.";
// ⚠️ NO WHITE STICKER RIM AND NO DROP SHADOW. Both come back by default on a transparent background and both
// make a sprite read as a sticker pasted onto the island rather than a thing standing on it. Reroll rather than
// accept one. See [[sprite-no-outlines-no-white-shadows]].
const CUTOUT = "Drawn ENTIRELY INSIDE the frame with clear empty space on all four sides — roughly 8% of the "
    + "image empty above, below, left and right. NO part may touch or run off any edge; draw it SMALLER rather "
    + "than cropped. ISOLATED as a clean die-cut sprite on a FULLY TRANSPARENT background (alpha channel) — "
    + "absolutely NO ground, NO sky, NO backdrop, NO scenery, NO cast shadow, NO glow halo, NO white sticker "
    + "rim, NO frame. " + NEG;

// ── THE BACKDROP ─────────────────────────────────────────────────────────────────────────────────────────────
// One continuous side-on wall of island, painted so the left and right edges could meet. The horizon is dead
// level and no line in it converges. What changes per island is one clause.
const BACKDROP = (biome, feature) =>
    "A side-on view of an island shore seen from just offshore at eye level, painted as ONE continuous scene "
    + "and lit from high above. Across the TOP, open sky and a DEAD LEVEL horizon running straight from edge "
    + "to edge. Behind, the island's interior receding into pale haze — further forms paler and softer, NEVER "
    + "converging. In the middle distance, " + feature + ". Across the BOTTOM third, the shore itself — "
    + biome.ground + " — running FLAT from left to right, its top edge at exactly the same height as in any "
    + "other island scene. The water along the shoreline is " + biome.water + ". "
    + "NO path, NO jetty running away from the viewer, NO focal point, NO vanishing point, NO perspective "
    + "lines converging anywhere, NO single centred subject. Evenly composed end to end so the left and right "
    + "edges tile seamlessly against another copy. Nothing in the immediate foreground. "
    + STYLE + " " + NEG;

// What stands in the middle distance of each island. One clause each — the palette and the ground line come
// from the biome, so twenty-five of these still look like one game.
const FEATURE = {
    tallow_key: "three leaning palms and the charred ribs of a burnt-out rendering hut",
    hundred_shallows: "a scatter of dozens of tiny low sandbars trailing off into the haze",
    pilots_mistake: "the broken masts of four wrecked ships standing up out of the shallows in a rough line",
    sugarbone: "low rolling dunes that are not sand but packed bleached bone, pale and dry",
    lending_reef: "a long exposed reef shelf hung with fishing floats, rope and other people's lost gear",
    cinderfall: "a low black cinder slope with a permanent grey haze drifting across it",
    smoking_sister: "twin low volcanic cones, one venting a thin column of smoke and one dead and cold",
    blacksand_bar: "a long flat bar of glittering black volcanic sand with heat shimmer above it",
    ember_hold: "a squat basalt fortress wall with dull orange light in its gun slits",
    furnace_door: "a tall cleft in a basalt cliff face breathing out visible warm air on a slow pulse",
    low_harbour: "a drowned harbour wall and crane standing out of the water, sagging but intact",
    sunken_assize: "the upper storeys of a stone courthouse rising out of the flood, windows dark",
    bellmouth: "a submerged bell tower leaning out of the water with the bell still hanging in it",
    drowned_corwick: "the rooftops and chimney pots of a whole drowned town breaking the surface",
    quiet_street: "a cobbled street of drowned houses, doors and windows half under green water",
    gullwinter: "a grey shingle shore under a low ice cliff, bare of any bird",
    blue_mouth: "a great arched cave mouth in an ice shelf, glowing deep blue from within",
    rime_shoal: "a wide frozen shoal of pressure-ridged sea ice in broken plates",
    long_cold: "a dark ice plain under a low band of aurora, almost no light on it",
    widows_ice: "a field of clear blue ice with pale teardrop inclusions frozen through it",
    greenrot: "a wall of dense rotting jungle with pale fungus running up the trunks",
    overgrown_charter: "two straight overgrown streets of a surveyed town almost swallowed by jungle",
    mothers_thicket: "one vast continuous thicket of interwoven stems filling the whole middle distance",
    fever_coast: "a mangrove shore under yellow haze with standing water between the roots",
    last_green_thing: "a single enormous ancient tree standing alone above a low green shore, open sea beyond",
};

// ── THE PROPS ────────────────────────────────────────────────────────────────────────────────────────────────
// Five per biome, standing on the ground and tapped. Described per biome so a wreck on the Sunken Coast is a
// drowned house and a wreck in the Cinders is a burnt hull — same verb, different island.
const PROPS = {
    coral: {
        wreck: "a small wrecked sloop half buried in white coral sand, ribs and one broken mast showing, rope and weed draped over it",
        cache: "a salt-bleached wooden chest wedged under a dead brain-coral head, lid ajar, sand spilling out",
        forage: "a cluster of fat spiny sea urchins and bright coral fans growing on a low rock",
        shrine: "a weathered pale coral pillar carved with worn spiral marks, shells pressed into its base",
        warden: "a heaped mound of crab shell and picked bone with something still moving inside it",
    },
    ash: {
        wreck: "a burnt ship's hull, blackened ribs and warped iron banding, half sunk in black grit",
        cache: "an iron-bound strongbox scorched black, sitting in cooled lava, its lock melted shut",
        forage: "clusters of glassy black obsidian shards and pale sulphur crystals growing from a vent",
        shrine: "a squat basalt altar with a dull ember glow in the seams of its carving",
        warden: "a cairn of slag and fused bone with heat shimmer rising off it",
    },
    drowned: {
        wreck: "the upper half of a drowned stone house, roof gone, silt to the window sills",
        cache: "a waterlogged sea chest resting on flooded flagstones, brass fittings green with verdigris",
        forage: "thick brown weed and mussel clusters growing over a submerged iron railing",
        shrine: "a drowned stone statue standing to its chest in water, face worn smooth",
        warden: "a rotted mooring post wound with weed, something dark coiled around its base",
    },
    frost: {
        wreck: "a whaling boat crushed and frozen into blue shore ice, timbers splintered outward",
        cache: "a sealed iron-strapped crate frozen into clear ice, its contents faintly visible",
        forage: "pale blue ice crystals and frozen lichen growing in a sheltered hollow",
        shrine: "a standing cairn of grey stones capped with clear ice, old marks cut into it",
        warden: "a mound of frost-covered bone and pale matted fur half buried in blue shore ice, cold "
            + "vapour curling off it. Entirely white, grey and pale blue — no fire, no embers, no orange",
    },
    green: {
        wreck: "a jungle-swallowed ship's hull with roots and creepers growing straight through the planking",
        cache: "a rotted wooden crate under a strangler fig root, split open, moss over the lid",
        forage: "a spray of vivid rot-bloom fungus and heavy fleshy leaves on a fallen trunk",
        shrine: "a mossy carved stone head half buried in leaf mould, vines through its eyes",
        warden: "a dense knot of writhing roots and mud built up into a low hunched shape",
    },
};

// ── THE PRIZES ───────────────────────────────────────────────────────────────────────────────────────────────
// One per island. Small, held-in-the-hand things — they sit on the X and then go in your hold.
const PRIZE_ART = {
    candle_coral: "a branching piece of waxy pale coral with a small steady flame burning at its tip",
    tide_pearl: "a large iridescent pearl grown lopsided around a splinter of dark ship's timber",
    pilot_glass: "a brass spyglass cracked clean across the middle, still holding together",
    sugarbone_scrim: "a flat panel of polished white bone scratched all over with a fine engraved coastline",
    lent_thing: "a tarnished silver locket wound tight in coral growth, clearly somebody's",
    cinder_glass: "a jagged spike of black volcanic glass with lightning-white fracture lines inside it",
    sister_ash: "a sealed clay jar of fine grey ash with faint warm light showing through the crack in its lid",
    slag_ingot: "a rough poured metal ingot shaped like a footprint, still dull red at its core",
    hold_key: "a huge ornate iron key, black with soot, far too big for any door nearby",
    furnace_heart: "a fist-sized lump of dark stone with a slow pulsing ember glow deep inside it",
    harbour_seal: "a heavy green-brass harbour seal on a chain, its engraving still crisp",
    assize_writ: "a rolled waterlogged parchment writ with a broken wax seal hanging off it",
    drowned_bell: "a small bronze bell thick with barnacles, tilted as if mid-swing",
    corwick_ledger: "a swollen leather ledger book, pages warped, a ribbon marker still in place",
    street_lamp: "an iron street lantern with its candle impossibly still lit behind wet glass",
    winter_gull: "the skull and spread bone wings of a gull, frost white, too many joints in them",
    blue_core: "a smooth cut core of deep blue glacial ice, not melting, cold light inside",
    rime_shard: "a shard of clear ice with a flurry of snow frozen mid-fall inside it",
    cold_iron: "a dark iron bar rimed with permanent frost, breath-fog rolling off it",
    widows_tear: "a single flawless teardrop of clear ice held on a dark cloth",
    rot_bloom: "a lush red and cream fungal bloom on a knot of black rotted wood",
    charter_stone: "a carved granite boundary marker, chipped, thick moss in the lettering",
    mother_root: "a thick pale severed taproot still weeping clear sap, faintly pulsing",
    fever_resin: "a lump of translucent amber resin with something small suspended inside it",
    green_heart: "a heavy heart-shaped knot of living green heartwood, veined with gold sap",
};

// ── ⚠️ FACING IS THE HARDEST THING TO GET OUT OF THE MODEL, AND IT IS NOT OPTIONAL ───────────────────────────
// The foe stands on the RIGHT of the battle stage and the scene does not mirror it — mirroring a hull mirrors
// its lighting with it — so every one of these has to be drawn pointing LEFT. The first sample came back with
// the Ringer facing squarely right despite one clause asking for left, which is the usual outcome: a direction
// buried mid-sentence is a suggestion. So the instruction now LEADS, is repeated in the negative, and names
// the specific body part that has to be on the left.
//
// ⚠️ AND IT STILL HAS TO BE EYEBALLED. Run scripts/island-sheet.mjs after any batch and look at the contact
// sheet — a wrong-facing foe is invisible in a file listing and obvious in one glance. See
// [[watch-it-run-before-done]] and [[sprite-amputation-vs-clipping]].
const FACE_LEFT = "⚠️ DIRECTION IS THE MOST IMPORTANT REQUIREMENT: the subject MUST face and point to the "
    + "VIEWER'S LEFT — that is, toward the left-hand edge of the image. It must NOT face right. ";
const SHIP = FACE_LEFT + "A single sailing ship in full side profile with its BOW (the pointed front) on the "
    + "LEFT side of the image and its stern on the RIGHT, seen level with the waterline. The whole vessel from "
    + "bowsprit to stern is visible, travelling leftward.";
const BEAST = FACE_LEFT + "A single sea creature breaching, its HEAD and JAWS at the LEFT side of the image "
    + "and its tail or body trailing away to the RIGHT, lunging leftward. Big and heavy enough to threaten a "
    + "ship. The head must NOT be on the right. No boat, no raft, no vessel of any kind in the image.";
const SWARM = FACE_LEFT + "MANY small separate creatures massed together into one churning shape, the whole "
    + "mass surging toward the LEFT edge of the image — the swarm itself is the creature. NOT one large "
    + "animal. No boat, no vessel of any kind in the image.";
// ── ⚠️ "A SEA CREATURE" IS A SHARK, AND THE MODEL WILL GIVE YOU TWELVE OF THEM ────────────────────────────────
// The first batch of forty came back with the facing right and TEN near-identical breaching sharks: the Ringer
// (a bell), the One That Stayed (a bird), Mother (a thicket) and the Last Green Thing (an island) all arrived
// as the same grey fish with its mouth open. BEAST's "a single sea creature breaching" is a strong attractor
// and a one-line blurb cannot pull against it.
//
// Two answers, both needed. NOT_A_FISH is an explicit negative for anything that is not supposed to be an
// animal at all; and BODY below is per-warden art direction that LEADS the prompt with a concrete noun, so the
// model is drawing a bell or a bird rather than deciding what kind of sea creature a bell is.
//
// ⚠️ The wardens are what make an island recognisable before the backdrop has loaded. Ten of twenty-five
// looking alike is the feature's identity gone. Judge them on the contact sheet — npm run sheet:islands.
const NOT_A_FISH = " ⚠️ It is NOT a shark, NOT a whale, NOT a fish, NOT a generic sea monster, and it has NO "
    + "fins, NO gills and NO fish tail. Do not draw a breaching fish.";

// Only the ones the blurb alone could not carry. Anything absent keeps its authored blurb, which worked.
const BODY = {
    esc_growler: "A vast jagged mountain of blue-white pack ice grinding through black water, its cracked "
        + "leading edge shaped like a blunt snout, meltwater streaming off it. A MOVING ICEBERG." + NOT_A_FISH,
    wd_sugarbone: "A surging drift of thousands of bleached white BONES — ribs, skulls and long bones — "
        + "heaped into one rolling wave-shaped mass pouring forward." + NOT_A_FISH,
    wd_furnace_door: "A living column of superheated air and glowing embers pouring out of a dark cleft in "
        + "black basalt, the shape of a great exhaled breath, orange sparks streaming." + NOT_A_FISH,
    wd_bellmouth: "An enormous green-bronze church BELL, thick with barnacles and hanging weed, swinging "
        + "forward on a rotted timber yoke with dark water pouring out of its mouth." + NOT_A_FISH,
    wd_gullwinter: "An enormous ragged SEABIRD — a gull with a cruel hooked beak, too many wing joints and "
        + "frost-white feathers, wings spread wide, bare bone showing through." + NOT_A_FISH,
    wd_blue_mouth: "A towering arch of deep blue glacial ice with a cavern mouth in it, jagged icicle teeth "
        + "around the opening, cold blue light glowing from far inside. ARCHITECTURE, not an animal."
        + NOT_A_FISH,
    wd_mothers_thicket: "One colossal PLANT — a dense interwoven mass of thorned stems, whipping tendrils "
        + "and dark leaves rearing up into a hunched shape, roots trailing mud beneath it." + NOT_A_FISH,
    wd_last_green_thing: "An immense LANDMASS that has stood up — a shelf of green turf, rock and soil with "
        + "one enormous ancient tree growing out of its back, roots hanging like limbs beneath it."
        + NOT_A_FISH,
    wd_widows_ice: "A crowd of pale human-shaped figures frozen inside clear blue ice, packed shoulder to "
        + "shoulder in one slab, faces turned outward. Ice and figures only." + NOT_A_FISH,
    wd_smoking_sister: "A great slumped mass of cooled black lava in the rough shape of a crouching beast, "
        + "cracked all over, every fissure DEAD and grey with no glow left in it at all, cold ash sifting off "
        + "its back. Stone, not flesh." + NOT_A_FISH,
    wd_lending_reef: "A huge reef-encrusted creature built out of coral, anchor chain, rope, fishing floats "
        + "and other people's lost gear fused into one lumbering shape." + NOT_A_FISH,
};

const shapeFor = (row) => (row.kind === "ship" ? SHIP : row.limb === "swarm" ? SWARM : BEAST);
// A BODY override replaces the blurb AND the shape clause; the facing instruction always survives.
const creaturePrompt = (id, row) => (BODY[id]
    ? `${FACE_LEFT}${BODY[id]} It is called ${row.name}. ${STYLE} ${CUTOUT}`
    : `${row.blurb} It is ${row.cls.toLowerCase()}, called ${row.name}. ${shapeFor(row)} ${STYLE} ${CUTOUT}`);

// ── EVERY PLATE THIS FEATURE NEEDS ───────────────────────────────────────────────────────────────────────────
const PLATES = [];
for (const isle of ISLANDS) {
    PLATES.push({
        kind: "backdrop", id: isle.id, island: isle.id, file: `${OUT}/${isle.id}.webp`,
        size: "1536x1024", scene: true,
        prompt: BACKDROP(biomeOf(isle), FEATURE[isle.id] || "a low shore of broken rock"),
    });
    PLATES.push({
        kind: "prize", id: isle.prize, island: isle.id, file: `${OUT}/prize/${isle.id}.png`,
        size: "1024x1024", to: 384,
        prompt: `${PRIZE_ART[isle.prize] || prizeFor(isle).name}. A single object, held-in-the-hand size. ${STYLE} ${CUTOUT}`,
    });
    const w = WARDENS[isle.id];
    if (w) {
        PLATES.push({
            kind: "warden", id: `wd_${isle.id}`, island: isle.id, file: `${OUT}/warden/wd_${isle.id}.png`,
            size: "1024x1024", to: 512,
            prompt: creaturePrompt(`wd_${isle.id}`, w),
        });
    }
}
for (const [biome, set] of Object.entries(PROPS)) {
    for (const [kind, subject] of Object.entries(set)) {
        PLATES.push({
            kind: "prop", id: `${biome}-${kind}`, biome, file: `${OUT}/props/${biome}-${kind}.png`,
            size: "1024x1024", to: 384,
            prompt: `${subject}. A single object standing on the ground, seen straight on from the side at eye level. ${STYLE} ${CUTOUT}`,
        });
    }
}
for (const [biome, pool] of Object.entries(ESCORTS)) {
    for (const row of pool) {
        PLATES.push({
            kind: "warden", id: row.id, biome, file: `${OUT}/warden/${row.id}.png`,
            size: "1024x1024", to: 512,
            prompt: creaturePrompt(row.id, row),
        });
    }
}

const wanted = PLATES.filter((p) => (!KIND || p.kind === KIND)
    && (!ONLY.length || ONLY.some((o) => p.id.includes(o) || p.island === o || p.biome === o)));
const todo = wanted.filter((p) => FORCE || !fs.existsSync(p.file));

const price = (list) => list.reduce((n, p) => n + (COST[p.size] || COST["1024x1024"]), 0);
console.log(`\n${PLATES.length} plates in the archipelago · ${wanted.length} selected · ${todo.length} missing`);
console.log(`   backdrops ${PLATES.filter((p) => p.kind === "backdrop").length}`
    + ` · props ${PLATES.filter((p) => p.kind === "prop").length}`
    + ` · prizes ${PLATES.filter((p) => p.kind === "prize").length}`
    + ` · wardens ${PLATES.filter((p) => p.kind === "warden").length}`);
console.log(`   this run would draw ${todo.length} at a billed cost of about $${price(todo).toFixed(2)}`
    + ` (whole archipelago: $${price(PLATES).toFixed(2)})\n`);
if (DRY) { console.log("   --dry, so nothing was drawn.\n"); process.exit(0); }

let spent = 0, drawn = 0, failed = 0;
for (const p of todo) {
    const body = {
        model: "gpt-image-1", prompt: p.prompt, size: p.size,
        output_format: "png", quality: "medium", n: 1,
        ...(p.scene ? {} : { background: "transparent" }),
    };
    const r = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
    });
    if (!r.ok) { failed += 1; console.log(`  ✗ ${p.kind}/${p.id}: OpenAI ${r.status} ${(await r.text()).slice(0, 160)}`); continue; }
    const j = await r.json();
    let img = sharp(Buffer.from(j.data[0].b64_json, "base64"));
    // A backdrop is looked at full width; a prop is drawn at a couple of hundred pixels and 1024 of it is a
    // megabyte of nothing. Resizing DOWN is also what keeps `medium` the right quality tier for these.
    if (p.scene) {
        // ── ⚠️ MIRROR-TILE THE PLATE, ALWAYS ────────────────────────────────────────────────────────────
        // The prompt asks for edges that tile and the model does not really deliver that — the join came back
        // as a hard vertical brightness step straight down the middle of Rime Shoal's ice, visible from across
        // the room. A plate laid beside a horizontally flipped copy of itself has only MIRROR lines at its
        // joins, both in the middle and where the pair wraps, and the eye does not read those as seams.
        // Costs nothing, cannot fail, and it doubles the width so the parallax rarely has to wrap at all.
        const base = await img.resize(1536, 1024, { fit: "cover" }).toBuffer();
        const flipped = await sharp(base).flop().toBuffer();
        img = sharp({ create: { width: 3072, height: 1024, channels: 3, background: "#000" } })
            .composite([{ input: base, left: 0, top: 0 }, { input: flipped, left: 1536, top: 0 }])
            .webp({ quality: 84, effort: 5 });
    }
    else img = img.resize(p.to, p.to, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9 });
    fs.mkdirSync(path.dirname(p.file), { recursive: true });
    await img.toFile(p.file);
    spent += COST[p.size] || COST["1024x1024"];
    drawn += 1;
    console.log(`  ✓ ${p.kind}/${p.id}  →  ${p.file}`);
}
console.log(`\n  drew ${drawn}, failed ${failed}, about $${spent.toFixed(2)} billed.`);
console.log("  ⚠️ Now LOOK at them — a contact sheet, not a file listing. See [[sprite-amputation-vs-clipping]]");
console.log("     and [[watch-it-run-before-done]]. And bump ART_V in IslandWalk.js on any redraw.\n");
