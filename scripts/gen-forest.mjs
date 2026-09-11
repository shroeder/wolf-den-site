// ── THE FOREST'S ART ─────────────────────────────────────────────────────────────────────────────────
// A dark backdrop, one sprite per tree kind, one per axe form, and a stump for a felled patch.
//
// ⚠️ THE TREE PROMPTS COME OUT OF forest.js. Same rule as the card pets: the tree is already defined there
// with its name and rarity, so a second copy of its description here is a second thing to forget when one
// is redrawn. Read as text because forest.js is fine but its neighbours use the "@/" alias.
//
//   node scripts/gen-forest.mjs            only what is missing
//   node scripts/gen-forest.mjs --force    redraw everything
import fs from "node:fs";
import sharp from "sharp";
import { housePrompt, HOUSE_STYLE, NEGATIVE_STYLE } from "../src/lib/marketplace/art-style.js";
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("../accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");
const OUT = "public/images/forest";
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(`${OUT}/trees`, { recursive: true });
fs.mkdirSync(`${OUT}/axes`, { recursive: true });
const FORCE = process.argv.includes("--force");
// ⚠️ slice(2) — argv[0] is the node binary and argv[1] is this script, so an unsliced filter is
// never empty and the "only what was asked for" branch quietly skips EVERYTHING.
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));

// ── ⚠️ THESE ARE REDWOODS, AND DIE_CUT CANNOT DRAW ONE ───────────────────────────────────────────────
// Luke: "tall trees where we can only see the bottom half because its like a redwood forest semi dark."
//
// The house DIE_CUT framing states that no part of the subject may touch any edge — which is exactly right
// for a hatchet and exactly wrong for a tree whose whole character is that it runs out of the top of the
// picture. So the trunks compose their own framing from HOUSE_STYLE and NEGATIVE_STYLE and skip DIE_CUT.
// The same reasoning killed the painted prison bars in the brig; there it ended in a horned ogre.
//
// Drawn PORTRAIT (1024x1536) rather than square, because a towering trunk in a square is a thin sliver with
// wasted air either side, and the crown is not in shot to fill it.
//
// ⚠️ AND EACH SPECIES IS DESCRIBED BY ITS BARK. The crown used to be how you told a birch from an oak, and
// the crown is now above the top of the frame — so the leaves are gone from every prompt and the trunk does
// all the work: colour, texture, the shape of the roots.
// ⚠️ WHOLE TREES. The first cut of these asked for "an ENORMOUS ancient tree seen from close to its base ...
// the trunk runs straight off the TOP edge, the crown far overhead and completely out of shot", and that is
// exactly what it produced. Luke, looking at it: "the trees are janky, you can't see the top of them, and
// they're, like, so big they take up the whole screen ... the trees aren't, like, massive redwoods, so forget
// about that. We want just trees, different kinds of trees that you come across."
//
// A trunk crop can only ever be photographed from one distance, which is why it ate the screen: there is no
// size you can draw it at that reads as a tree rather than as a wall. A whole tree has a silhouette, and a
// silhouette can be small. This one is drawn complete — roots to crown, inside the frame — so a walkable
// forest can stand six of them at different depths and none of them is the screen.
// ⚠️ PAINTED TO MATCH THE PLATE, NOT DRAWN AS A STICKER. The first set were house-style die-cut sprites:
// hard black outlines, flat bright fills, vivid spring-green leaves. Dropped onto a soft painted forest lit
// cool blue they read as two different games in one frame. Luke: "bg and fg no mesh at all."
const TRUNK_FRAMING =
    "A COMPLETE tree, whole and entire: roots at the bottom, trunk, branches and the full crown of foliage, "
    + "ALL of it inside the frame with clear space above the crown. Seen straight on at eye level, standing "
    + "upright and centred, noticeably taller than it is wide. "
    + "PAINTED, not inked: soft brushed edges and NO black outline anywhere. Lit by a pale cool light from "
    + "high above with deep blue-green shadow through the lower half, as if standing inside a dim blue-lit "
    + "forest. Foliage muted and desaturated toward the cool blues and deep greens of deep woodland -- never "
    + "bright, never vivid. Nothing else in the picture. Isolated on a FULLY TRANSPARENT background: no "
    + "ground, no grass, no undergrowth, no other trees, no cast shadow, no background.";
const trunkPrompt = (subject) => [subject, TRUNK_FRAMING, HOUSE_STYLE, NEGATIVE_STYLE].join(" ");

const TREES = {
    birch: "a birch tree: slender chalk-white trunk peeling in fine papery curls, ringed with black scars and dark knot-eyes, a light airy crown of small bright green leaves",
    pine: "a pine tree: straight red-brown trunk in deep jigsaw bark plates, amber resin at the seams, tiers of dark blue-green needled branches",
    oak: "an oak tree: sturdy grey-brown trunk in deep furrowed ridges with a knotted burl low down, broad spreading limbs and a heavy round crown of lobed leaves",
    ash: "an ash tree: smooth pale silver-grey trunk with fine dark fissures, upswept branches and a narrow crown of slim paired leaves",
    blackthorn: "a blackthorn tree: near-black sinewy twisted trunk bristling with long iron-hard thorns, a sparse dark crown with a scatter of tiny white blossom",
    ironwood: "an ironwood tree: blue-grey trunk that looks like riveted iron plate with angular facets and seams of rust, stiff angular branches and hard grey-green foliage",
    heartwood: "a heartwood tree: deep red-brown trunk split by a long vertical wound with a molten crimson glow pouring out of the crack, embers in the grain, a dark red crown",
    moonash: "a moonash tree: luminous silver-white trunk glowing with cold blue light, pale veins running up it, a shimmering crown of pale blue leaves shedding faint drifting motes",
};

// ── MUSHROOMS ── small, on the floor, picked up rather than chopped. Drawn from slightly above, the way you
// would see one you were about to crouch for.
const MUSH_EXTRA =
    "A small clump of mushrooms growing from a little patch of moss and leaf litter, seen from slightly above "
    + "at a three-quarter angle, complete and inside the frame. Isolated on a FULLY TRANSPARENT background: "
    + "no ground plane, no scenery, no cast shadow.";
const MUSHROOMS = {
    button_cap: "three small pale cream button mushrooms with plump rounded caps",
    inkcap: "a cluster of tall slender grey inkcaps, their bell caps splitting and dripping black at the rims",
    chanterelle: "a group of golden-orange chanterelles with wavy funnel caps and deep ridged gills",
    bloodgill: "a pair of dark red mushrooms with vivid blood-red gills showing under thick caps",
    fairy_ring: "a small ring of tiny pale yellow-green toadstools on delicate stems, faintly glowing",
    lantern_cap: "a cluster of warm amber mushrooms whose translucent caps glow from within like little lanterns",
    corpse_veil: "a tall ghost-white mushroom with a torn lacy veil hanging from its cap, faint violet bruising",
    dreamcap: "a smooth domed mushroom in deep dreamy blue with soft pale spots, wisps of pale vapour curling off it",
    mooncrown: "a rare silver-white mushroom with a crown-shaped fluted cap, glowing cold blue, motes drifting from its gills",
};

const AXE_EXTRA = "Held VERTICALLY, head at the top and haft running straight down to the bottom of the frame, "
    + "blade facing LEFT. Upright like an axe standing against a wall, never lying flat or diagonal.";

const AXES = {
    hatchet: "a small notched hand hatchet with a worn wooden handle and a chipped, dull iron head",
    felling: "a proper felling axe with a long straight pale ash handle and a clean bright steel head",
    broad: "a heavy broadaxe with a wide flaring bearded blade and a thick oiled wooden haft bound in leather",
    black: "a blackened iron axe with a dark angular head, iron banding down the haft and a faint ember glow in the bevel",
    silvered: "an ornate silvered axe with a mirror-bright engraved head, blue-white sheen and a pale wrapped grip",
    heart: "a legendary greataxe with a crimson-cored blade that glows from within like split heartwood, gold filigree and a dark heavy haft",
};

// The scene every plate is painted from. Only the middle clause changes, so three different woods still share
// one palette, one light direction and one ground height -- which is what lets them sit side by side.
const GROVE_SCENE = (feature) =>
    "A side-on view of deep forest at eye level, painted as one continuous scene and lit from above. Dark "
    + "leafy canopy and overhanging branches across the TOP of the frame. Below that, ranks of tree trunks "
    + "receding into cool blue-grey haze -- further trunks paler and softer, never converging. In the middle "
    + "distance, " + feature + ". Across the BOTTOM third, a forest floor of dark earth, moss, fallen leaves "
    + "and twigs running flat left to right, its top edge at the SAME height as in any other forest scene. "
    + "Soft shafts of pale light falling between the trunks onto the ground. NO path, NO clearing, NO focal "
    + "point, NO vanishing point, NO sky, NO horizon line. Evenly composed end to end so the left and right "
    + "edges tile seamlessly against another copy. Nothing in the immediate foreground. "
    + HOUSE_STYLE + " " + NEGATIVE_STYLE;

const PIECES = {
    ...Object.fromEntries(Object.entries(TREES).map(([id, p]) => [`trees/${id}`, { raw: trunkPrompt(p), sprite: true, size: "1024x1536", tall: true }])),
    ...Object.fromEntries(Object.entries(MUSHROOMS).map(([id, p]) => [`shrooms/${id}`, { subject: p, extra: MUSH_EXTRA, sprite: true }])),
    ...Object.fromEntries(Object.entries(AXES).map(([id, p]) => [`axes/${id}`, { subject: p, extra: AXE_EXTRA, sprite: true }])),
    stump: { subject: "a freshly cut tree stump, pale raw wood across the cut face with the rings showing, "
        + "bark dark around the rim, a few chips and splinters at its foot", sprite: true },
    // ── ⚠️ THE BACKDROP IS FLAT, AND THAT IS NOT A STYLE CHOICE ──────────────────────────────────────────
    // A scrolling world slides one picture sideways past a camera that never moves in depth. Any vanishing
    // point drawn into it is correct from exactly ONE spot on the strip and wrong everywhere else — walk on
    // and the whole wood appears to swivel. See [[scrolling-room-needs-flat-backdrop]]. So: no perspective,
    // no converging lines, no path running away from the viewer. A flat wall of distant trunks, straight on,
    // that can be tiled end to end forever without a seam or a centre.
    // ── ⚠️ ONE PAINTED SCENE, NOT TWO TEXTURES STACKED ──────────────────────────────────────────────────
    // The first cut was a flat wall of trunks with a separate top-down litter texture tiled underneath it.
    // Luke: "straight dog dookie." He was right: two unrelated pictures butted together at a hard seam, a
    // dead empty half at the top, and trees standing on what read as patterned lino. Nothing in it agreed
    // about where the light came from or where the ground was.
    //
    // This is ONE plate with the whole scene in it — canopy overhead so the top of the screen is forest
    // rather than nothing, trunks receding into haze, and the floor coming toward the viewer — painted
    // together so the light and the ground line are consistent. It still must TILE, so: no focal point, no
    // path, no vanishing point, and the two side edges have to meet.
    grove:  { raw: GROVE_SCENE("an even rank of straight trunks, low scrub along the floor"), size: "1536x1024" },
    // ⚠️ THREE PLATES, BECAUSE ONE REPEATS AND YOU CAN SEE IT. A single tile is about 1,250px on a phone, so
    // the same distinctive trunk came round every few seconds and the wood read as looping wallpaper. Luke:
    // "repeat bg sucks." Three scenes dealt in sequence push the period out past noticing. They only have to
    // agree on palette, light direction and ground height -- which is what GROVE_SCENE fixes.
    grove2: { raw: GROVE_SCENE("two great trunks close together on the left with pale mist between them, "
        + "low mossy boulders across the floor"), size: "1536x1024" },
    grove3: { raw: GROVE_SCENE("a leaning half-fallen trunk crossing the upper right, dense fern undergrowth "
        + "along the ground"), size: "1536x1024" },
};

let spent = 0;
for (const [id, p] of Object.entries(PIECES)) {
    if (only.length && !only.some((o) => id.includes(o))) continue;
    const dest = `${OUT}/${id}.webp`;
    if (fs.existsSync(dest) && !FORCE) { console.log(`  ${id}: already drawn`); continue; }
    const body = {
        model: "gpt-image-1",
        prompt: p.raw || housePrompt(p.subject, { framing: p.sprite ? "sprite" : "scene", extra: p.extra || "" }),
        size: p.size || "1024x1024", output_format: "png", quality: "medium", n: 1,
    };
    if (p.sprite) body.background = "transparent";
    const r = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
    });
    if (!r.ok) { console.log(`  ${id}: OpenAI ${r.status} ${(await r.text()).slice(0, 140)}`); continue; }
    const j = await r.json();
    let img = sharp(Buffer.from(j.data[0].b64_json, "base64"));
    // Trees and axes are drawn at a few hundred pixels; 1024 of them is a megabyte of nothing.
    // A trunk is stored tall; everything else stays square.
    if (p.sprite) {
        img = p.tall
            ? img.resize(512, 768, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
            : img.resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } });
    }
    // ⚠️ WEBP, NOT PNG. These came back as PNGs the first time and the eight trunks plus the grove backdrop
    // came to 8.3MB — the whole screen's art, downloaded before the first swing. Painted gradients are the case
    // PNG is worst at; the identical pictures at quality 82 are under 800kb for the set.
    const out = await img.webp({ quality: 82, alphaQuality: 90, effort: 6 }).toBuffer();
    fs.writeFileSync(dest, out);
    spent += 0.04;
    console.log(`  ${id.padEnd(18)} ${Math.round(out.length / 1024)}kb`);
}
console.log(`\nabout $${spent.toFixed(2)}`);
