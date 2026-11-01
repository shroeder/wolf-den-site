// ── THE SEVEN COLISEUM FRONTS ────────────────────────────────────────────────────────────────────────────────
// Luke, 2026-11-01: "You understand I want you to build the front of the Coliseum, right? As if you were
// outside going to walk into it with the NPC out front... All I want you to do is build the building. But I
// want it to fit the theme of the map that it's in."
//
// ⚠️ THIS IS NOT arena-*.webp AND IT IS NOT A PORTAL. Two things already exist and neither is this:
//   · arena-<id>.webp is the INSIDE — the backdrop you fight against once you are in.
//   · portal-open.webp is the zone door, and the first cut of this feature recoloured it gold and called it
//     a Coliseum. It is a portal. Luke: "You seem to have misinterpreted that into building orange portals."
// What is missing is the OUTSIDE: a building standing on the level floor, with a way in, that you walk up to.
//
// ⚠️ DIE-CUT, NOT A SCENE. The backdrops are the levels and they are not being touched — Luke again: "I don't
// want you to change the backgrounds. Those are just the fucking levels." So each of these is a transparent
// cut-out structure that gets composited into whatever zone it stands in, exactly like a creature sprite. A
// painted ground, sky or scene behind it would fight the level art underneath.
//
// ⚠️ AND THE DOORWAY MUST READ AS ENTERABLE AT ~13 WORLD UNITS. On a 390px phone the whole building is about
// 130px tall. A beautifully detailed facade whose entrance is a dark smudge at that size has failed at the
// one job it has. Hence the explicit "tall arched opening, clearly a way in" in every prompt.
//
//   node scripts/gen-grove-coliseums.mjs                      # price it and stop
//   node scripts/gen-grove-coliseums.mjs --apply --only 1,6,7 # draw three
import fs from "node:fs";
import path from "node:path";
import { register } from "node:module";

register("./lib/app-loader.mjs", import.meta.url);

import { quality, priceRun } from "./lib/gen-guard.mjs";

const { IMAGE_MODEL } = await import("@/lib/marketplace/image-model.js");
const { housePrompt } = await import("@/lib/marketplace/art-style.js");

const Q = quality();
// Square: a gatehouse is about as wide as it is tall, and the scene box is square too (13x13 units).
const SIZE = "1024x1024";
const OUT = "public/images/grove";
const APPLY = process.argv.includes("--apply");
const ONLY = (process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : "")
    .split(",").map((s) => s.trim()).filter(Boolean);

const KEY = (() => {
    const lp = "C:/Users/Luke/Projects/accounting_app/local.properties";
    const line = fs.readFileSync(lp, "utf8").split(/\r?\n/).find((l) => l.startsWith("OPENAI_API_KEY="));
    return line ? line.slice("OPENAI_API_KEY=".length).trim() : process.env.OPENAI_API_KEY;
})();

// Each front is built out of what its own map HAS, which is the whole reason there are seven of them rather
// than one building recoloured seven times. The materials mirror the arena plates they lead into, so walking
// through the door is not a change of world.
const FRONTS = {
    1: { id: "rootwood", what:
        "the front of a fighting arena grown out of a living forest: an entrance built from vast knotted tree "
        + "roots and weathered timber beams arching over a tall doorway, moss and ferns on the stonework at its "
        + "base, rope-hung cloth banners either side of the opening" },
    2: { id: "undercave", what:
        "the front of an underground fighting pit: a squat gatehouse of rough hewn grey rock built against a "
        + "cave wall, a tall arched mouth leading down into darkness, clusters of pale glowing blue-green "
        + "fungus growing along its lintel and sides like lamps" },
    3: { id: "fen", what:
        "the front of a swamp fighting hall: a dark bog-oak and reed-thatch gatehouse raised on thick timber "
        + "stilts above the waterline, a tall plank doorway, hanging oil lanterns on iron hooks, a brown "
        + "waterline stain across the lower timbers" },
    4: { id: "saltwrack", what:
        "the front of a coastal fighting arena built from a dead sea creature and wreckage: an entrance framed "
        + "by two enormous bleached whale rib bones meeting in an arch, walls of salt-greyed ship planking, "
        + "knotted fishing rope and tattered sailcloth lashed across the top" },
    5: { id: "drowned", what:
        "the front of a sunken stone amphitheatre: a half-submerged classical gatehouse of pale weathered "
        + "masonry, a tall arched entrance, broken fluted columns either side, barnacles and green algae "
        + "crusting the lower third, carved reliefs worn almost smooth" },
    6: { id: "gilded", what:
        "the front of a desert fighting arena: a sandstone gatehouse in the style of a tomb entrance, a tall "
        + "keyhole-arched doorway, hammered gold leaf facing and geometric inlay catching hard sunlight, drifted "
        + "sand banked against its base, a tattered awning on poles" },
    7: { id: "ashen", what:
        "the front of a fighting pit in burned country: a brutal black basalt and slag gatehouse, a tall iron-"
        + "grated archway, live orange embers glowing in the cracks of the stonework, soot staining, thin smoke "
        + "curling from vents in its flanks" },
};

// ⚠️ "SEEN FROM DIRECTLY IN FRONT" IS LOAD-BEARING. The Grove is a side-on platformer, so a building drawn at
// a three-quarter angle has a vanishing point that is only correct if the hero stands in exactly one spot.
// Every other sprite in this world is flat-on for the same reason.
const prompt = (a) => housePrompt(
    `A building: ${a.what}. Seen SQUARE-ON from directly in front at ground level, flat elevation, no corner `
    + `or three-quarter angle and no perspective receding to one side. The building sits flat on its own base `
    + `so it can stand on level ground. Its doorway is a tall dark arched opening in the centre, clearly a way `
    + `in, wide enough for a person and readable as an entrance even when the whole building is small on screen.`,
    { framing: "sprite", extra:
        "No people, no creatures, no figures anywhere — a character sprite stands in front of this separately. "
        + "No ground, no floor, no terrain, no sky and no landscape around the building: the structure only." },
);

const TARGETS = Object.entries(FRONTS).filter(([n]) => !ONLY.length || ONLY.includes(n));

const bill = priceRun({ count: TARGETS.length, size: SIZE, quality: Q });
console.log(`${TARGETS.length} coliseum fronts · ${SIZE} · ${Q} · ${IMAGE_MODEL}`);
console.log(`estimated ${typeof bill === "number" ? `$${bill.toFixed(2)}` : bill}`);
if (!APPLY) { console.log("\nnothing drawn. --apply to draw."); process.exit(0); }
if (!KEY) { console.error("no OPENAI_API_KEY"); process.exit(1); }

fs.mkdirSync(OUT, { recursive: true });
let drew = 0;
for (const [map, a] of TARGETS) {
    const dest = path.join(OUT, `coliseum-${a.id}.webp`);
    process.stdout.write(`  map ${map} ${a.id.padEnd(12)} `);
    const r = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
        // ⚠️ background AND output_format, BOTH — see the long note in gen-grove-npcs.mjs. Omitting them
        // returns a sprite with the transparency checkerboard PAINTED IN as flat grey: three channels, no
        // alpha, and it looks correct in every preview. That mistake cost $1.78 to find once already.
        body: JSON.stringify({
            model: IMAGE_MODEL, prompt: prompt(a), size: SIZE, quality: Q, n: 1,
            background: "transparent", output_format: "webp",
        }),
    });
    const j = await r.json();
    if (!r.ok) { console.log(`FAILED ${j?.error?.message || r.status}`); continue; }
    const b64 = j.data?.[0]?.b64_json;
    if (!b64) { console.log("no image back"); continue; }
    const sharp = (await import("sharp")).default;
    await sharp(Buffer.from(b64, "base64")).webp({ quality: 92 }).toFile(dest);
    const meta = await sharp(dest).metadata();
    if (!meta.hasAlpha) { console.log("NO ALPHA — the background was painted, not transparent"); continue; }
    drew += 1;
    console.log(`→ ${dest}`);
}
console.log(`\ndrew ${drew}/${TARGETS.length}`);
