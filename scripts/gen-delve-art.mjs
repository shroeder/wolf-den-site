// Every piece of art the dungeon delves need: four backdrops, four bosses, sixteen foes, and the event icons.
//
// Backdrops are SCENES (wide, atmospheric, no cutout) and everything else is a die-cut sprite on transparency,
// so a foe can stand in front of any backdrop without a seam. Written to public/images/delves as static files,
// the same way the fish are — these are fixed content, not per-player art, so a table row would be a lookup for
// a value that can never change.
//
// Usage:  node scripts/gen-delve-art.mjs [key ...]   (no args = everything missing)
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

import "./lib/ai-trace.mjs"; // every OpenAI call lands in the AI Costs history

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const KEY = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!KEY) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/delves";
fs.mkdirSync(OUT, { recursive: true });

// Shared house language. Kept verbatim across the set so sixteen foes read as one bestiary rather than sixteen
// unrelated drawings — the same reason the fish are all described side-on.
const STYLE = "Painterly cel-shaded 2D video-game art, bold clean dark outlines, chunky readable silhouette, high contrast, vibrant colors, soft inner shading, fantasy action-RPG style.";
const CUTOUT = "ISOLATED as a clean die-cut sprite on a FULLY TRANSPARENT background (alpha channel) — absolutely NO backdrop, NO scenery, NO ground, NO cast shadow, NO glow halo, NO white sticker rim. Nothing but the subject. No text, no words, no letters, no logo, no watermark, no border.";
const FOE = `A single fantasy dungeon MONSTER, full body, three-quarter view facing the viewer, menacing but readable at small size. ${STYLE} ${CUTOUT}`;
const OBJ = `A single fantasy dungeon OBJECT game icon, three-quarter view, centered and filling most of the frame. ${STYLE} ${CUTOUT}`;
const SCENE = `A wide atmospheric fantasy dungeon INTERIOR background plate, empty of characters, deep perspective receding into darkness, dramatic moody lighting, painterly cel-shaded game art with rich color. No characters, no creatures, no text, no words, no logo, no watermark, no UI, no border.`;

// key → [prompt, kind]. kind decides size + whether the background is transparent.
const ART = {
    // ── backdrops (one per dungeon) ──
    "bg-hollow": [`${SCENE} A collapsed earthen badger warren beneath an old orchard: packed soil walls threaded with pale tree roots, broken timber props, mushrooms glowing faint green, shafts of dim light from a caved-in ceiling. Damp mossy greens and warm browns.`, "scene"],
    "bg-sunken": [`${SCENE} A flooded stone treasury vault beneath a harbour: knee-deep dark water rippling, barnacled columns, a rusted iron portcullis, spilled coins glinting under the surface, cold teal light from above. Deep blue-greens and verdigris.`, "scene"],
    "bg-ember": [`${SCENE} A magma seam broken open inside a mine: cracked black basalt, rivers of glowing orange lava in the floor channels, hanging chains and a ruined forge, embers drifting in the air. Fierce oranges and deep charcoal.`, "scene"],
    "bg-astral": [`${SCENE} The interior of an impossible tower: floating stone stairs going in several directions, a starfield visible THROUGH the walls, violet nebula light, drifting motes, geometry that does not quite meet. Deep violets and cold silver.`, "scene"],

    // ── bosses ──
    "foe-warren-mother": [`${FOE} An enormous matriarch badger-beast far too large for its tunnels, grey-black striped fur matted with earth, heavy clawed forelimbs, milky blind eyes, low and wide.`, "boss"],
    "foe-drowned-warden": [`${FOE} A drowned armoured vault guard, waterlogged plate armour crusted with barnacles and green weed, a heavy iron vault key on a chain around its neck, dark water pouring from its helm.`, "boss"],
    "foe-cinder-tyrant": [`${FOE} A towering blacksmith-shaped colossus of blackened iron and cooling magma, cracks of white-hot light across its chest, one arm ending in a forge hammer, wreathed in heat shimmer.`, "boss"],
    "foe-hollow-star": [`${FOE} A tall faceless humanoid figure made of night sky, its body a window onto stars and violet nebula, a hollow ring of light where a head should be, trailing motes.`, "boss"],

    // ── hollow warren foes ──
    "foe-rootrat": [`${FOE} A wiry rat the size of a dog with root-like whiskers and bark-flecked fur, hunched and twitching.`, "foe"],
    "foe-grub": [`${FOE} A bloated pale cave grub, segmented and glistening, with a ring of small black eyes and a puckered maw.`, "foe"],
    "foe-badger": [`${FOE} A snarling striped badger with oversized claws and a scarred snout, hackles raised.`, "foe"],
    "foe-thornling": [`${FOE} A small hunched creature woven from thorny bramble and dead leaves, glowing green eyes in a hollow of twigs.`, "foe"],

    // ── sunken vault foes ──
    "foe-eelhound": [`${FOE} A sleek eel-bodied hound with slick blue-black skin, finned legs and a jaw of needle teeth, water sheeting off it.`, "foe"],
    "foe-barnacle": [`${FOE} A hulking brute of barnacle-crusted stone and coral with fists like anchors, seawater draining from its seams.`, "foe"],
    "foe-siren": [`${FOE} A pale drowned siren in tattered vault-keeper robes, long dark hair floating as if underwater, hollow luminous eyes.`, "foe"],
    "foe-coffer": [`${FOE} An animate iron strongbox standing on stubby clawed legs, lid gaping to show a mouth of coins and teeth.`, "foe"],

    // ── ember deep foes ──
    "foe-emberling": [`${FOE} A small impish creature of living flame and blackened crust, grinning, embers dripping from its fingertips.`, "foe"],
    "foe-slagbeast": [`${FOE} A four-legged beast of cooled slag and molten seams, back ridged with glowing cracks, head low and heavy.`, "foe"],
    "foe-ashwraith": [`${FOE} A drifting wraith of hot ash and smoke in the shape of a robed figure, two burning coals for eyes.`, "foe"],
    "foe-magmite": [`${FOE} A squat armoured creature of obsidian plates with magma glowing between them, tiny bright eyes, coiled to charge.`, "foe"],

    // ── astral spire foes ──
    "foe-voidmoth": [`${FOE} A large moth with wings made of starfield, trailing violet dust, body of pale bone-white chitin.`, "foe"],
    "foe-starhusk": [`${FOE} A hollow humanoid husk of cracked white stone with starlight pouring out of the fractures, head tilted.`, "foe"],
    "foe-mirrorkin": [`${FOE} A humanoid figure of fractured mirror shards reflecting a violet sky, edges sharp, silhouette almost human but wrong.`, "foe"],
    "foe-riftling": [`${FOE} A small darting creature that looks like a tear in reality, edges glowing violet-white, glimpses of stars inside.`, "foe"],

    // ── the mimic (shared) ──
    "foe-mimic": [`${FOE} A treasure chest that has come alive: lid split into a wide grinning mouth of jagged wooden teeth, a long pink tongue, small mad eyes, stubby clawed legs, gold spilling from its jaws.`, "foe"],

    // ── event icons ──
    "ev-chest": [`${OBJ} A closed iron-bound wooden treasure chest with a heavy lock plate, sitting slightly ajar with warm light escaping the seam.`, "icon"],
    "ev-merchant": [`${OBJ} A hooded travelling merchant's market stall: a small wooden cart with a striped canopy, bottles, pouches and trinkets laid out, a hanging lantern. No people.`, "icon"],
    "ev-well": [`${OBJ} An old circular stone wishing well with a wooden roof and a rope bucket, dark water below, a few coins glinting on its rim.`, "icon"],
    "ev-shrine": [`${OBJ} A small weathered stone shrine: a carved kneeling figure with cupped hands, a shallow basin of water, faint blue light in the carvings.`, "icon"],
    "ev-trap": [`${OBJ} A sprung floor trap: rusted iron jaws set into cracked flagstones with dart holes in the wall behind, one bolt still quivering.`, "icon"],
    "ev-rest": [`${OBJ} A small abandoned camp: a bedroll, a cold fire ring with a blackened kettle, a pack leaning against a stone.`, "icon"],
    "ev-cache": [`${OBJ} A spilled leather coin purse with gold and silver coins scattered around it and a single gemstone among them.`, "icon"],
    "ev-puzzle": [`${OBJ} Two heavy stone doors side by side in a dungeon wall, one carved with a sun and one with a moon, an unmarked iron lever between them.`, "icon"],
    "ev-potion": [`${OBJ} A round glass flask of glowing crimson healing potion with a cork stopper, leather cord wrapped round the neck.`, "icon"],
    "ev-victory": [`${OBJ} A golden laurel wreath crossed with a raised sword, glowing warmly, small gold sparks around it.`, "icon"],
    "ev-death": [`${OBJ} A cracked adventurer's helm lying on its side with a snapped sword blade beside it, dust settling.`, "icon"],
    "ev-retreat": [`${OBJ} A lit brass hand-lantern with a rope coil beside it, warm safe light, pointing back the way you came.`, "icon"],

    // ── PER-DUNGEON encounter icons ─────────────────────────────────────────────────────────────────────────
    // One chest icon shared by all four decks quietly undid the theming the decks exist for: a Warren chest is
    // a farmer strongbox in the dirt, a Spire chest is a display case in a starfield. 8 kinds x 4 dungeons.
    "ev-hollow-chest": [`${OBJ} A muddy iron-bound wooden strongbox half-sunk in dark earth, pale tree roots growing over the lid.`, "icon"],
    "ev-hollow-cache": [`${OBJ} A spilled leather purse of coins in dark soil, a few acorns and a gold ring among them.`, "icon"],
    "ev-hollow-merchant": [`${OBJ} A forager blanket laid on packed earth with bundled herbs, clay jars and a hooded lantern. No people.`, "icon"],
    "ev-hollow-shrine": [`${OBJ} A mossy standing stone with a worn hollow at its top holding clear rainwater, ferns at its base.`, "icon"],
    "ev-hollow-well": [`${OBJ} A flooded earthen shaft ringed with tree roots, black water below, a coin glinting on the rim.`, "icon"],
    "ev-hollow-trap": [`${OBJ} A snarl of thick grasping tree roots sprung across a burrow mouth like a snare, soil falling from them.`, "icon"],
    "ev-hollow-rest": [`${OBJ} A thick bed of green moss in a root hollow with a burst cider barrel beside it.`, "icon"],
    "ev-hollow-puzzle": [`${OBJ} Two dark burrow mouths side by side in an earthen wall, roots framing each, one breathing faint warm mist.`, "icon"],

    "ev-sunken-chest": [`${OBJ} A barnacle-crusted iron deposit box, its door hanging open, seawater draining from the seams.`, "icon"],
    "ev-sunken-cache": [`${OBJ} Gold and silver coins scattered across wet stone flags under shallow rippling water.`, "icon"],
    "ev-sunken-merchant": [`${OBJ} A salvor crate-top stall on a dry ledge: rope, a brass diving lamp, bottles and a ledger. No people.`, "icon"],
    "ev-sunken-shrine": [`${OBJ} A carved stone basin of perfectly clear water set into a verdigris-streaked vault wall.`, "icon"],
    "ev-sunken-well": [`${OBJ} A round iron drain grate set in a flooded stone floor, coins visible glinting through the bars.`, "icon"],
    "ev-sunken-trap": [`${OBJ} A burst stone wall seam with dark water jetting through it across cracked flagstones.`, "icon"],
    "ev-sunken-rest": [`${OBJ} A dry stone ledge above the waterline with a lit brass lantern and a coiled rope.`, "icon"],
    "ev-sunken-puzzle": [`${OBJ} A heavy vault door with four brass combination dials and a waterlogged note pinned beside it.`, "icon"],

    "ev-ember-chest": [`${OBJ} A soot-blackened smith tool chest with brass fittings, lid open on neatly slotted tools, glowing faintly from within.`, "icon"],
    "ev-ember-cache": [`${OBJ} A stack of poured metal ingots stamped with a maker mark, glowing dull orange at the edges.`, "icon"],
    "ev-ember-merchant": [`${OBJ} A scrapper anvil-side stall: tongs, half-finished blades and a slate price list, lit by forge glow. No people.`, "icon"],
    "ev-ember-shrine": [`${OBJ} A stone quenching trough of dark water beside a worn iron anvil, steam rising off the surface.`, "icon"],
    "ev-ember-well": [`${OBJ} A deep slag pit shaft in cracked basalt with molten orange glow far below.`, "icon"],
    "ev-ember-trap": [`${OBJ} A cracked floor vent blasting a jet of white steam, glowing magma visible in the fissure.`, "icon"],
    "ev-ember-rest": [`${OBJ} A worker shift bunk with a folded blanket, a cold stove and a tin mug.`, "icon"],
    "ev-ember-puzzle": [`${OBJ} A bank of eight iron levers on a scorched control panel with a burned-away chart above them.`, "icon"],

    "ev-astral-chest": [`${OBJ} A glass display case on a pale stone plinth, its lid ajar, violet starlight spilling out.`, "icon"],
    "ev-astral-cache": [`${OBJ} Coins and small bright objects floating in a slow cluster, weightless, trailing violet motes.`, "icon"],
    "ev-astral-merchant": [`${OBJ} A pilgrim folding counter of pale wood with star-charts, an astrolabe and a hanging lamp. No people.`, "icon"],
    "ev-astral-shrine": [`${OBJ} A shallow round font of perfectly still liquid light on a carved pale plinth.`, "icon"],
    "ev-astral-well": [`${OBJ} A square window frame in a pale stone wall opening onto deep starfield with no room behind it.`, "icon"],
    "ev-astral-trap": [`${OBJ} A flight of pale stone stairs shearing away mid-air, steps tumbling into a violet void.`, "icon"],
    "ev-astral-rest": [`${OBJ} A warm pale stone bench in a quiet alcove, faint silver light pooling on it.`, "icon"],
    "ev-astral-puzzle": [`${OBJ} Three narrow stone doors crowded onto a wall too narrow to hold three doors, violet light at their seams.`, "icon"],

    // ── RARE FINDS ── the 1-in-13 floors. Each gets its own picture, because these are the only floors anyone
    // tells someone else about and a generic strongbox would waste them. Scenes, not cutouts: the reward is a room.
    "rare-seedvault": [`${SCENE} A small dry stone chamber sealed inside a mass of tree roots, shelves of ancient labelled seed jars glowing faintly gold, untouched dust.`, "rare"],
    "rare-kinghoard": [`${SCENE} An earthen chamber heaped with generations of stolen bright things — coins, rings, cutlery, glass — piled to the ceiling, lit warm gold.`, "rare"],
    "rare-orchardheart": [`${SCENE} The interior of an enormous split tree root, hollow and dry, its walls glowing amber, something bright resting at the centre.`, "rare"],
    "rare-reserve": [`${SCENE} A hidden bank reserve room behind an open vault door, gold bars stacked in neat rows on dry stone above the flood line, cold teal light.`, "rare"],
    "rare-wreck": [`${SCENE} A sunken cargo barge broken open under dark water, spilled crates of treasure lit by shafts of pale light from above.`, "rare"],
    "rare-directors": [`${SCENE} A flooded bank office: a heavy desk, a portrait, an open private safe glinting with gold, verdigris and teal light.`, "rare"],
    "rare-mastervault": [`${SCENE} A master smith private locker room deep in a forge: finished masterwork blades and tools racked on the walls, orange forge light.`, "rare"],
    "rare-heartseam": [`${SCENE} A vast seam of glowing molten gold ore running through black basalt, brilliant and dangerous, the reason the mine was dug.`, "rare"],
    "rare-firstforge": [`${SCENE} An ancient primordial forge older than the mine around it, a huge stone anvil and hearth still burning white-hot after centuries.`, "rare"],
    "rare-observatory": [`${SCENE} A circular observatory room open to a violet starfield, a great brass telescope and floating orrery rings, silver light.`, "rare"],
    "rare-corehall": [`${SCENE} An enormous hollow at the centre of a tower, filled with everything ever lost in it — coins, relics, doors, stairs — all slowly falling upward.`, "rare"],
    "rare-beforeroom": [`${SCENE} A warm furnished room that predates the tower around it: a made bed, a lit fire, a laid table, impossibly ordinary and clearly ancient.`, "rare"],

    // ── upgrade track icons ──
    "track-flask": [`${OBJ} An oversized ornate healing flask with a wide belly and brass fittings, deep red liquid, engraved rune on the glass.`, "icon"],
    "track-satchel": [`${OBJ} An open leather adventurer's satchel with three glowing red potion flasks tucked into its loops.`, "icon"],
    "track-ward": [`${OBJ} A heavy travelling cloak with a silver clasp, faint blue protective runes glowing along its hem, hanging as if worn.`, "icon"],
};

const SIZE = { scene: "1536x1024", rare: "1024x1024", boss: "1024x1024", foe: "1024x1024", icon: "1024x1024" };
// Rare finds are SCENES rather than cutouts — the reward is a whole room, so they get more pixels than an icon.
const PX = { scene: 1024, rare: 420, boss: 512, foe: 448, icon: 256 };

async function generate(prompt, kind) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const r = await fetch("https://api.openai.com/v1/images/generations", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
                body: JSON.stringify({
                    model: "gpt-image-1", prompt, size: SIZE[kind], quality: "low", n: 1,
                    // Scenes are meant to be opaque plates; everything else must key out cleanly.
                    ...(kind === "scene" || kind === "rare" ? {} : { background: "transparent" }),
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
const keys = Object.keys(ART).filter((k) => (want.length ? want.includes(k) : !fs.existsSync(path.join(OUT, `${k}.png`))));
console.log(`${keys.length} delve images to generate`);

const queue = [...keys];
let done = 0; const failed = [];
await Promise.all(Array.from({ length: 3 }, async () => {
    for (let k = queue.shift(); k; k = queue.shift()) {
        const [prompt, kind] = ART[k];
        try {
            const buf = await generate(prompt, kind);
            const out = path.join(OUT, `${k}.png`);
            await sharp(buf).resize({ width: PX[kind], withoutEnlargement: true }).png({ compressionLevel: 9 }).toFile(out);
            done += 1;
            console.log(`✓ ${k} (${kind}, ${Math.round(fs.statSync(out).size / 1024)}kb)`);
        } catch (e) {
            failed.push(k);
            console.log(`✗ ${k}: ${e.message}`);
        }
    }
}));
console.log(`\nDONE — ${done}/${keys.length}`);
if (failed.length) { console.log(`FAILED: ${failed.join(", ")}`); process.exit(1); }
