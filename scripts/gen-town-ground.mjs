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

const BACK_BAN = "A wide background scene filling the frame. NO ground, floor or path across the bottom — the "
    + "bottom of the image is the base of whatever stands in it. No characters, no creatures, no text, no "
    + "signage, no user interface. The left and right edges must be able to sit beside a MIRRORED copy of this "
    + "same image without an obvious seam, so keep the composition even rather than leaning to one side.";

const STYLE = "Painterly cel-shaded 2D video-game art with clean dark outlines, rich saturated colour and "
    + "soft dusk lighting. Seen straight on from the side as a flat horizontal GROUND BAND filling the whole "
    + "frame edge to edge.";
// ⚠️ EVERY ONE OF THESE BANS IS A THING THAT WOULD PUT A SECOND TOWN BEHIND THE REAL ONE.
const BAN = "The image must be GROUND ONLY, filling the entire frame: no sky, no horizon line, no buildings, "
    + "no houses, no walls, no characters, no creatures, no signage, no text. Nothing stands up out of it. "
    + "The left and right edges must MATCH so the image can be tiled seamlessly side by side.";

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
const SKY = process.argv.includes("--sky");
for (const key of todo) {
    const prompt = SKY ? `${SKIES[key]}. ${STYLE} ${BACK_BAN}`
        : BACK ? `${BACKDROPS[key]}. ${STYLE} ${BACK_BAN}`
        : `${GROUNDS[key]}. ${STYLE} ${BAN}`;
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ model: IMAGE_MODEL, prompt, size: SIZE, quality: "medium", n: 1 }),
    });
    if (!resp.ok) { console.log(`✗ ${key}: ${resp.status} ${(await resp.text()).slice(0, 160)}`); continue; }
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) { console.log(`✗ ${key}: no image back`); continue; }
    const file = path.join(OUT, `${key}${SKY ? "-sky" : BACK ? "-back" : ""}.webp`);
    fs.writeFileSync(file, await sharp(Buffer.from(b64, "base64")).webp({ quality: 90 }).toBuffer());
    console.log(`✓ ${key} (${Math.round(fs.statSync(file).size / 1024)}kb)`);
}
console.log("\nnow: node scripts/gen-town-ground.mjs --preview   and look at the joins");
