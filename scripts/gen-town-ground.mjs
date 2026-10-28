// ── THE GROUND EACH TOWN STANDS ON ───────────────────────────────────────────────────────────────────────────
// Luke: "the town reflects the biome of the next area."
//
// A town in this game is LAYERED, not a painted backdrop: a tiling ground band across the bottom 44%, the
// feature buildings standing on it, and the hero walking between them. So what makes a town a swamp rather
// than a forest is the GROUND — one tile, repeated nineteen times across a 2,900px street.
//
// ⚠️ WHICH MEANS IT HAS TO TILE, and image models are bad at that. Nothing in the prompt can promise a seam
// will match; the only honest check is to lay three copies side by side and look at the joins, which
// --preview does. A tile with a visible seam repeats that seam nineteen times across the street.
//
// ⚠️ AND IT IS A BAND, NOT A SCENE. The buildings are separate sprites that stand ON this; a tile with its
// own horizon, sky or architecture would put a second town behind the real one. Ground only.
//
//   node scripts/gen-town-ground.mjs rootwood deepdelve fenhollow     draw these
//   node scripts/gen-town-ground.mjs --preview                        tile what exists, to check the seams
import fs from "node:fs";
import path from "node:path";
import { register } from "node:module";

import sharp from "sharp";

register("./lib/app-loader.mjs", import.meta.url);
const { IMAGE_MODEL } = await import("@/lib/marketplace/image-model.js");
await import("./lib/ai-trace.mjs");

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const KEY = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();

const OUT = "public/images/town/ground";
fs.mkdirSync(OUT, { recursive: true });

// Matches the cobble tile already in the street: 1536x1024, scaled to the band's height and repeated.
const SIZE = "1536x1024";

// The seven grounds. Each is the FLOOR of its biome seen from the side-on angle the street is drawn at —
// the same three-quarter-ish view as the existing cobbles, lit the same dusk.
const GROUNDS = {
    rootwood: "A woodland path of packed earth threaded with pale tree roots and sunk mossy flagstones, "
        + "scattered fallen leaves and a few small ferns pushing up between the stones",
    deepdelve: "A mine floor of hewn grey rock with a pair of iron cart rails running along it, loose ore "
        + "chunks and coal scattered about, and a few faint blue-green crystal veins glinting in the stone",
    fenhollow: "A swamp boardwalk of weathered dark planks laid over still black water, green reeds and "
        + "lily pads pushing up through the gaps between boards, damp and slick",
    saltwrack: "A harbour quayside of wet grey sand and tide-worn timber decking, coils of rope, scattered "
        + "shells and barnacled stones along it",
    drownedquay: "Cracked pale flagstones of a sunken ruin, shallow standing water pooled in the cracks "
        + "reflecting the light, broken fluted column stubs and drifted silt",
    gilded: "Sun-bleached desert paving slabs half-buried in fine golden sand, drifts of sand across them "
        + "and a scatter of small gold flecks caught in the cracks",
    ashfall: "A floor of black volcanic basalt split by glowing orange ember cracks, drifted grey ash "
        + "gathered in the hollows, faint heat shimmer",
};

// ── AND THE BACKDROP, WHICH TURNED OUT TO MATTER MORE ────────────────────────────────────────────────────────
// The first pass drew grounds only, on the theory that the ground is the biome. Rendered in situ that was
// plainly wrong: Deepdelve Camp came out as a cave floor with iron rails under a SUNNY MEDIEVAL SKYLINE,
// because the backdrop is four tiled copies of the default town and it fills everything above the ground band.
// The backdrop is the larger half of a biome, not the smaller.
//
// ⚠️ IT TILES WITH EVERY OTHER COPY MIRRORED (`.tw-bg img:nth-child(even) { transform: scaleX(-1) }`), so the
// seam that has to match is LEFT-TO-LEFT and RIGHT-TO-RIGHT, not left-to-right. A composition that leans one
// way reads as a mistake the moment it is flipped against itself. Keep it even-handed.
const BACKDROPS = {
    rootwood: "A wall of dense autumn forest seen from a clearing — tall trunks, warm orange and gold canopy, "
        + "shafts of late daylight between the trees, a few hanging lanterns strung at head height",
    deepdelve: "The far wall of a vast mine cavern — rough grey rock, timber pit props and scaffolding, dark "
        + "tunnel mouths, hanging lanterns throwing warm pools of light, faint teal crystal seams in the stone",
    fenhollow: "A dense swamp treeline seen across still water — crooked moss-hung trees, hanging vines, pale "
        + "mist between the trunks, green gloom, a few lanterns on poles",
    saltwrack: "A harbour seen from the quay — moored fishing boats with furled sails, timber jetties and "
        + "mooring posts, a pale overcast sea horizon, gulls, coils of net",
    drownedquay: "The flooded ruin of an old city — broken pale stone arches and toppled columns standing in "
        + "shallow water, creeping green growth, cold blue light, drifting mist",
    gilded: "A desert horizon of golden dunes under a hot pale sky, with the half-buried remains of grand "
        + "sandstone architecture — columns and a broken arch — rising out of the sand",
    ashfall: "A volcanic ridge under a dark red sky — black basalt cliffs veined with glowing orange lava, "
        + "drifting ash and ember sparks, distant smoking vents",
};
// ── AND THE FAR SKY, BECAUSE THE TOWN IS THREE LAYERS, NOT ONE ───────────────────────────────────────────────
// Found by rendering it: the street parallaxes a FAR sky band at 0.3x, a MIDGROUND skyline, and the ground.
// Replacing only the ground left a cave floor under blue sky and timbered houses. All three move together or
// none of them do, so a biome is three pieces.
const SKIES = {
    rootwood: "Pale gold late-afternoon sky above a far treeline, soft clouds, warm and open",
    deepdelve: "The dark upper vault of an enormous cavern — rough rock ceiling lost in shadow, hanging "
        + "stalactites, a few faint shafts of light from far above, deep blue-black",
    fenhollow: "A low grey-green overcast sky above distant swamp canopy, heavy and damp, thin mist",
    saltwrack: "A wide pale overcast sea sky with high thin cloud and a faint band of sunlight on the horizon",
    drownedquay: "A cold blue twilight sky above a drowned skyline, thin cloud, the first stars",
    gilded: "A hot bleached desert sky, nearly white at the horizon deepening to dusty blue above, heat haze",
    ashfall: "A dark red-black volcanic sky choked with ash cloud, faint orange glow along the underside",
};

// ⚠️ AND THE MIDGROUND IS DRAWN ON TRANSPARENCY, which is the other half of the fix. Asking for "no floor"
// in words did not work twice; asking for a transparent background removes the floor by construction, because
// there is nothing for the model to stand its scenery on. What comes back is a die-cut silhouette of cave
// mouths and scaffolding with real emptiness between them, so the ground band shows THROUGH it instead of
// being covered by a second one.
// ── THE FOREGROUND TERRACE — THE ONE LAYER I MISSED, AND THE ONE THAT BROKE IT ───────────────────────────────
// .tw-fg sits at bottom:37.5% height:34%, between the ground band and the sky: the back edge of the street,
// the retaining wall the buildings stand behind. The default town's is warm sandstone paving with ornate
// lampposts — dropped into a cave it was a bright, pale terrace directly above a near-black mine floor, which
// is the contrast break Luke called out before anything else.
//
// ⚠️ SO IT IS TONE-MATCHED TO ITS GROUND, NOT JUST THEMED. The prompt names the ground's own value range,
// because "a stone wall" drawn without that instruction comes back lit like a courtyard at noon.
const FOREGROUNDS = {
    rootwood: "A low dry-stone retaining wall edging a woodland path, moss in the joints, a few timber posts "
        + "and a leaning wooden lantern, warm earth tones in the SAME muted range as fallen leaves at dusk",
    deepdelve: "A rough hewn-rock retaining wall at the edge of a mine floor, heavy timber pit props and "
        + "braces along it, iron ore buckets, two dim hanging miner's lanterns. DARK grey-brown stone, the "
        + "same near-black value as an unlit mine, lit only by the lanterns",
    fenhollow: "A low weathered boardwalk edge and mossy stone kerb at a swamp's margin, reed clumps, a "
        + "leaning lantern post, dark damp greens in a muted low-light range",
    saltwrack: "A harbour quay edge of tide-stained stone and timber, mooring bollards, coiled rope, crab "
        + "pots, cool grey-green in a flat overcast range",
    drownedquay: "A broken quay wall of pale cracked masonry half in shallow water, toppled column drums, "
        + "creeping weed, cold desaturated blue-grey",
    gilded: "A low sandstone retaining wall half-buried in drifted sand, broken pilasters, dry scrub, warm "
        + "bleached ochre in a hot flat range",
    ashfall: "A retaining wall of black basalt blocks at the edge of an ash field, iron braces, a thin seam "
        + "of glowing orange between the stones, near-black with ember light only",
};
const FG_BAN = "A long low horizontal band standing against a FULLY TRANSPARENT background — the alpha "
    + "channel is empty above and below it. No sky, no backdrop, no floor extending away behind it, no "
    + "characters, no creatures, no text. It reads as the near edge of a street seen from the side. The left "
    + "and right edges must tile seamlessly against a copy of themselves.";

const BACK_BAN = "A row of structures standing against a FULLY TRANSPARENT background — the alpha channel is "
    + "empty everywhere they are not. Absolutely NO ground, floor, paving, grass, path or baseline across the "
    + "bottom, and no sky or backdrop behind them: only the structures themselves, with transparency around "
    + "and between them. No characters, no creatures, no text, no signage. The left and right edges must sit "
    + "beside a MIRRORED copy of this image without an obvious seam, so keep the composition even.";

// ⚠️ THE STYLE LINE WAS SHARED BY ALL THREE LAYERS AND IT SAID "GROUND BAND".
// Which is why the midground skyline came back with cobbled paving and a strip of grass baked across its
// bottom: the prompt asked for a floor every single time, then BACK_BAN asked for no floor in the next
// sentence, and the picture won. That paved strip then sat on top of the real ground band as a second floor
// with a hard edge — exactly the "layers conflicting with sheer cutoffs" Luke is looking at.
//
// So the two jobs get two descriptions. Nothing shared between them but the house look.
const LOOK = "Painterly cel-shaded 2D video-game art with clean dark outlines, rich saturated colour and "
    + "soft dusk lighting.";
const STYLE = `${LOOK} Seen straight on from the side as a flat horizontal GROUND BAND filling the whole `
    + "frame edge to edge.";
const STYLE_SCENE = `${LOOK} Seen straight on from the side, as a flat backdrop with no perspective floor.`;
// ⚠️ EVERY ONE OF THESE BANS IS A THING THAT WOULD PUT A SECOND TOWN BEHIND THE REAL ONE.
const BAN = "The image must be GROUND ONLY, filling the entire frame: no sky, no horizon line, no buildings, "
    + "no houses, no walls, no characters, no creatures, no signage, no text. Nothing stands up out of it. "
    + "The left and right edges must MATCH so the image can be tiled seamlessly side by side.";

// The far sky IS opaque — it is the backmost thing there is — but it still must not paint a floor, or the
// horizon lands halfway up the street.
const SKY_BAN = "A distant backdrop filling the whole frame. NO ground, floor, paving or path anywhere, and "
    + "nothing in the foreground: only the far distance. No characters, no creatures, no text, no signage. "
    + "The left and right edges must sit beside a MIRRORED copy of this image without an obvious seam.";

/**
 * Fade one edge of an image out to full transparency over `frac` of its height.
 *
 * ⚠️ dest-in, NOT a drawn gradient. Compositing a black-to-clear PNG over the picture would darken it on the
 * way out; dest-in multiplies the ALPHA and leaves every colour untouched, so the layer thins rather than
 * dimming. The mask is built as a raw buffer because a linear-gradient SVG renders at its own gamma and the
 * fade comes out visibly banded at this size.
 */
async function feather(buf, edge, frac) {
    const img = sharp(buf).ensureAlpha();
    const { width, height } = await img.metadata();
    const band = Math.max(1, Math.round(height * frac));
    const mask = Buffer.alloc(width * height * 4, 0);
    for (let y = 0; y < height; y += 1) {
        const d = edge === "bottom" ? height - 1 - y : y;
        const a = d >= band ? 255 : Math.round((d / band) * 255);
        for (let x = 0; x < width; x += 1) {
            const i = (y * width + x) * 4;
            mask[i] = mask[i + 1] = mask[i + 2] = 255;
            mask[i + 3] = a;
        }
    }
    return img
        .composite([{ input: mask, raw: { width, height, channels: 4 }, blend: "dest-in" }])
        .png()
        .toBuffer();
}

const want = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const preview = process.argv.includes("--preview");

if (preview) {
    // Three copies, side by side, so a seam has somewhere to show itself.
    for (const key of Object.keys(GROUNDS)) {
        const f = path.join(OUT, `${key}.webp`);
        if (!fs.existsSync(f)) continue;
        const img = sharp(f);
        const { width, height } = await img.metadata();
        const strip = await sharp({ create: { width: width * 3, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
            .composite([0, 1, 2].map((i) => ({ input: f, left: width * i, top: 0 })))
            .webp({ quality: 88 }).toBuffer();
        const dest = `${OUT}/_seam-${key}.webp`;
        fs.writeFileSync(dest, strip);
        console.log(`${dest}  ${width * 3}x${height}  — look at the two joins`);
    }
    process.exit(0);
}

if (!want.length) { console.log(`pass town ids: ${Object.keys(GROUNDS).join(" ")}`); process.exit(0); }
const todo = want.filter((k) => GROUNDS[k]);
const unknown = want.filter((k) => !GROUNDS[k]);
if (unknown.length) { console.error(`no such town: ${unknown.join(", ")}`); process.exit(1); }

// ⚠️ THREE AT A TIME, IN THE FOREGROUND, AND THE PRICE SAID OUT LOUD. House rule, and it exists because two
// separate runs have cost real money for art that was then thrown away.
if (todo.length > 3) { console.error(`${todo.length} is more than three. Luke's call, three at a time.`); process.exit(1); }
console.log(`drawing ${todo.length}: ${todo.join(", ")}  —  ${IMAGE_MODEL}, medium, ${SIZE}`);

const BACK = process.argv.includes("--back");
const FG = process.argv.includes("--fg");
const SKY = process.argv.includes("--sky");
for (const key of todo) {
    const prompt = FG ? `${FOREGROUNDS[key]}. ${STYLE_SCENE} ${FG_BAN}`
        : SKY ? `${SKIES[key]}. ${STYLE_SCENE} ${SKY_BAN}`
        : BACK ? `${BACKDROPS[key]}. ${STYLE_SCENE} ${BACK_BAN}`
        : `${GROUNDS[key]}. ${STYLE} ${BAN}`;
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
            model: IMAGE_MODEL, prompt, size: SIZE, quality: "medium", n: 1,
            // Transparency is what removes the baked floor from the midground by construction.
            ...(BACK || FG ? { background: "transparent" } : {}),
        }),
    });
    if (!resp.ok) { console.log(`✗ ${key}: ${resp.status} ${(await resp.text()).slice(0, 160)}`); continue; }
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) { console.log(`✗ ${key}: no image back`); continue; }
    const file = path.join(OUT, `${key}${FG ? "-fg" : SKY ? "-sky" : BACK ? "-back" : ""}.webp`);
    let buf = Buffer.from(b64, "base64");
    // ── ⚠️ FEATHER THE EDGE WHERE THIS LAYER MEETS THE NEXT ──────────────────────────────────────────────
    // Luke: "you have layers that are completely conflicting with each other with sheer cutoffs... you might
    // have to do some alpha cutting out to make things blend together properly."
    //
    // Right. Three opaque rectangles stacked make two hard horizontal lines across the street, and no amount
    // of prompting fixes a straight edge — it is a property of the canvas, not the picture. So the bottom of
    // the midground fades to nothing over the last fifth of its height, and the TOP of the ground band fades
    // in over its first tenth. Where they overlap, each is half there, and the join stops being a line.
    if (BACK) buf = await feather(buf, "bottom", 0.22);
    else if (!SKY && !FG) buf = await feather(buf, "top", 0.10);
    fs.writeFileSync(file, await sharp(buf).webp({ quality: 90, alphaQuality: 100 }).toBuffer());
    console.log(`✓ ${key} (${Math.round(fs.statSync(file).size / 1024)}kb)`);
}
console.log("\nnow: node scripts/gen-town-ground.mjs --preview   and look at the joins");
