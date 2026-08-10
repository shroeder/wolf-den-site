// SPRITES FOR THE TWENTY THINGS YOU CAN MEET AT SEA.
//
// Encounters used to be an emoji in a modal. They are fights now, drawn on the same stage as a fleet battle,
// which means each one needs a hull or a body the size of a ship — not an icon.
//
// Two shapes, drawn to the same contract as the fleet so they sit on the same water:
//   ship     a hull in profile, facing LEFT (the enemy stands on the right of the stage and the scene does
//            not mirror — mirroring a hull mirrors its lighting with it)
//   monster  the animal breaching, big enough to read as a ship-sized threat, also facing left
//
//   node scripts/gen-encounters.mjs            # only what is missing
//   node scripts/gen-encounters.mjs --force    # redraw everything
//   node scripts/gen-encounters.mjs --only elder_kraken,widowmaker
import fs from "node:fs";
import sharp from "sharp";
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

const OUT = "public/images/sailing/enc";
fs.mkdirSync(OUT, { recursive: true });

const STYLE = "Painterly cel-shaded 2D video-game art, bold clean dark ink outlines, chunky readable "
    + "silhouette, rich saturated colour, dramatic rim light, storybook fantasy pirate style.";
const CUTOUT = "Drawn ENTIRELY INSIDE the frame with clear empty space on all four sides — roughly 8% of the "
    + "image empty above, below, left and right. NO part may touch or run off any edge; draw it SMALLER "
    + "rather than cropped. ISOLATED as a clean die-cut sprite on a FULLY TRANSPARENT background (alpha "
    + "channel) — absolutely NO water, NO sky, NO backdrop, NO scenery, NO cast shadow, NO glow halo, NO "
    + "white sticker rim, NO frame. No text, no words, no letters, no logo, no watermark, no border.";
const SHIP = "A single sailing ship in full side profile, bow pointing to the VIEWER'S LEFT, seen level with "
    + "the waterline. The whole vessel from bowsprit to stern is visible.";
const BEAST = "A single sea creature breaching, its body angled toward the VIEWER'S LEFT, big and heavy "
    + "enough to threaten a ship. No boat, no raft, no vessel of any kind in the image.";
// A swarm is MANY small animals, and the model will quietly collapse it into one big one unless told twice —
// "a single sea creature" in BEAST is enough to turn a flock of petrels into a whale. Ask for the mass.
const SWARM = "MANY small separate animals massed together into one churning shape, drifting toward the "
    + "VIEWER'S LEFT — the swarm itself is the creature. NOT one large animal. NO whale, NO shark, NO single "
    + "big body of any kind. No boat, no raft, no vessel of any kind in the image.";

const SHAPE = { monster: BEAST, swarm: SWARM, ship: SHIP };
const P = (s, kind) => `${s} ${SHAPE[kind]} ${STYLE} ${CUTOUT}`;

const ENC = {
    gull_raiders: ["monster:no", "A tiny battered fishing skiff turned pirate — patched tan sail, one stolen swivel gun lashed to the bow rail, mismatched planks, a rag of a black flag."],
    reef_crabs: ["monster", "An enormous armoured crab with a barnacle-crusted shell, one oversized claw raised, mottled red and green chitin, seaweed hanging off it."],
    salvage_scow: ["monster:no", "A squat filthy salvage barge heaped with wreck timber and coiled rope, a crane arm at the stern, grey weathered wood and rust."],
    gull_swarm: ["swarm", "A flock of grey-and-white storm petrels — dozens of individual seabirds, each with spread wings, a hooked beak and forked tail, packed into one screaming wheeling cloud. A few clutch scraps of rope and torn canvas in their feet."],

    brine_smugglers: ["monster:no", "A low fast smuggler's sloop with a single raked mast, dark green hull, black fore-and-aft sail, crates lashed under a tarpaulin on deck."],
    glass_eels: ["swarm", "A writhing knot of dozens of long thin translucent glass eels braided into one glistening column, each eel a slender ribbon body with a small toothy head, pale blue-green and faintly luminous. Absolutely no whale, no fish, no single large animal — the tangle of eels is the creature."],
    tidewatch: ["monster:no", "A trim naval revenue cutter, white and navy paint, crisp square sail, a brass bow chaser and a pennant at the masthead."],
    shalefin: ["monster", "A vast armoured manta ray with a slate-grey plated back like moving stone, pale underside, long barbed tail, water sheeting off it."],

    gravebell: ["monster:no", "A rotted ghost brig, torn grey sails hanging in ribbons, splintered hull lit from within by cold green light, a corroded bronze bell at the bow."],
    kraken_young: ["monster", "A young kraken, three thick purple tentacles reaching up out of frame's lower edge, one enormous yellow eye, suckers and mottled skin."],
    corsair_wolves: ["monster:no", "A lean black corsair brigantine with blood-red sails, a carved wolf's head at the bowsprit, gun ports open along the side."],
    anglerdeep: ["monster", "A monstrous abyssal anglerfish, huge gaping jaw of glassy needle teeth, a single glowing lure on a stalk above its head, dark blue-black skin."],

    widowmaker: ["monster:no", "A heavy privateer frigate, two full gun decks with ports open, dark oak hull with a gold stripe, tall white sails, a torn ensign."],
    leviathan_old: ["monster", "An ancient grey whale-like leviathan covered in old harpoon scars and barnacles, one milky blind eye, enormous scarred jaw."],
    black_liturgy: ["monster:no", "A cult barque hung with black banners and burning braziers, dark purple sails marked with a pale sigil, robed shapes at the rail."],
    reef_drake: ["monster", "A green-scaled sea drake with a long neck, webbed frills, wet leathery wings half-spread, jaws open, coral growing along its spine."],

    dread_corsair: ["monster:no", "An immense black galleon, three masts of charcoal sails, gilded scrollwork on a jet-black hull, three tiers of gun ports, a skull lantern at the stern."],
    elder_kraken: ["monster", "A colossal elder kraken, vast mottled crimson head and two enormous eyes, thick tentacles filling the frame, ancient scars and clinging wreckage."],
    drowned_admiral: ["monster:no", "A drowned flagship raised from the seabed, waterlogged black timbers streaming weed and silt, shattered stern gallery, ghostly blue lanterns."],
    world_serpent: ["monster", "A colossal sea serpent, immense coils of blue-green scales looping above the frame's lower edge, a horned reptilian head with jaws wide open. The HEAD must point to the VIEWER'S LEFT and the creature must face LEFT, never right."],
};

const args = process.argv.slice(2);
const force = args.includes("--force");
const only = (() => { const i = args.indexOf("--only"); return i > -1 ? new Set(args[i + 1].split(",")) : null; })();

async function frame(buf) {
    const t = await sharp(buf).trim({ threshold: 10 }).png().toBuffer();
    const m = await sharp(t).metadata();
    const pad = Math.round(Math.max(m.width, m.height) * 0.08);
    const padded = await sharp(t).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    return sharp(padded).resize(640, 640, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9 }).toBuffer();
}

let made = 0, skipped = 0;
for (const [id, [kindTag, subject]] of Object.entries(ENC)) {
    if (only && !only.has(id)) continue;
    const dest = `${OUT}/${id}.png`;
    if (fs.existsSync(dest) && !force) { skipped += 1; continue; }
    const kind = kindTag === "monster" || kindTag === "swarm" ? kindTag : "ship";
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "gpt-image-1", prompt: P(subject, kind), size: "1024x1024", background: "transparent", output_format: "png", quality: "medium", n: 1 }),
    });
    if (!resp.ok) { console.log(`  ${id}: OpenAI ${resp.status} ${(await resp.text()).slice(0, 120)}`); continue; }
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) { console.log(`  ${id}: no image`); continue; }
    fs.writeFileSync(dest, await frame(Buffer.from(b64, "base64")));
    made += 1;
    console.log(`  ${id.padEnd(18)} ${(fs.statSync(dest).size / 1024).toFixed(0)}kb`);
}
console.log(`\ndrew ${made}, skipped ${skipped}`);
