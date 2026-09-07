// ── A PICTURE FOR EVERY ROOM THAT IS WRITING ─────────────────────────────────────────────────────────────
// The written rooms were the only ones in the game wearing an ICON. The campfire has a painted fire, the
// chest has a painted chest, the merchant has a painted merchant and his brazier — and a question mark got a
// glyph out of a font, shared between rooms: The Gilded Egg was drawn as an Egyptian hieroglyph of a bird.
// Luke, on a phone: "needs sprites."
//
// He is right, and it is worse than a mismatch. These rooms are the ones you have to READ, and the object is
// the thing that tells you what you are reading about before the sentence does. A hieroglyph tells you
// nothing and, shared between three rooms, actively lies.
//
// ⚠️ THE OBJECT, NOT THE SCENE. Every one of these is the single thing the paragraph is about, drawn the way
// the trinkets are: one object, straight on, no floor under it, no room around it. The room is already drawn
// — the alcove is the screen's background — and a second painted room inside it reads as a picture hung on a
// wall rather than as the thing you are standing in front of.
//
// Run:  node scripts/gen-card-events.mjs [--force] [--only gildedegg,mire]
import fs from "node:fs";
import sharp from "sharp";
import { housePrompt } from "../src/lib/marketplace/art-style.js";
import { EVENTS } from "../src/lib/marketplace/cards-events.js";
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

// Drawn at about 150px on a phone, above two lines of prose. Bigger than a trinket and read for longer, so
// these can carry interior detail a 34px shelf object cannot — but the silhouette still does the work.
const BIG = "Drawn as ONE single object seen straight on from the front, filling most of the frame, lit from "
    + "within or from one side so it reads against a dark stone wall. No floor, no ground shadow, no room "
    + "around it, no scene, no hands, no border and no frame.";

const ART = {
    // ── ACT ONE AND THE ROOMS THAT TURN UP ANYWHERE ──────────────────────────────────────────────────
    tidepool: "A dark still rock pool ringed with barnacled stone, one enormous pale fish turning just under "
        + "the surface with its eye above the water, a single pearl glinting on the sand below it.",
    bonesetter: "A bone-setter's kit laid open: a curved needle threaded with gut, a squat jar of grey "
        + "ointment with its lid beside it, and a roll of linen bandage, on a folded leather wrap.",
    fallen: "A dead runner's pack and cloak slumped against nothing, a hand's worth of bones showing at the "
        + "cuff, a charm on a thong spilling from the open flap.",
    gildedegg: "A large heavy egg of dull beaten gold, chased with fine scrollwork, sitting on a round stone "
        + "pressure plate that is very slightly raised, a hairline gap of shadow beneath it.",
    mire: "A pool of thick black mud with gold coins half-sunk in it, and two grey grasping hands breaking "
        + "the surface, reaching up out of the muck.",
    coalpit: "A grated iron pit set into stone with white-hot coals glowing through the bars, heat shimmer "
        + "rising off it, a pair of long blackened tongs resting across one edge.",
    offering: "A stone offering bowl on a short pillar with a hungry orange flame standing in it, the rim "
        + "scattered with old wax, a half-burnt card curling to ash at its lip.",
    serpent: "A huge dark serpent coiled upright, its head raised and turned toward you with a knowing "
        + "expression, a fat drawstring purse of coins hanging from its jaws.",
    ringcaps: "A ring of tall red-capped mushrooms with pale gills, arranged in a perfect circle, each cap "
        + "tilted to face the viewer, faint spores drifting between them.",
    shrine: "A worn flat whetstone shrine: a broad grey stone dished into a curve by centuries of blades, set "
        + "on a small altar of stacked rock, a thin trickle of water crossing it.",
    ooze: "A slumped mass of grey-green ooze with broken metal suspended inside it — a sword hilt, coins, a "
        + "buckle — some of the metal shifting as if the mass is turning over.",
    // Came back as a minotaur the first time — "old wall" read as a creature, so the subject leads with the
    // material and says outright that nothing is alive in it.
    oldwall: "A flat slab of grey carved stone, close up and filling the frame, its whole face covered edge "
        + "to edge in hundreds of small names chiselled over one another, some fresh and pale and some worn "
        + "almost away, with a single iron chisel wedged into a crack. An inanimate wall of carved text and "
        + "nothing else: no creature, no face, no figure, no character.",
    // ── ACT TWO ──────────────────────────────────────────────────────────────────────────────────────
    drowned_shrine: "A small drowned shrine still burning underwater: a stone niche furred with weed, a lamp "
        + "inside it lit with a steady blue-green flame, bubbles rising off the flame.",
    vampires: "Three tall pale figures in high collars standing shoulder to shoulder in shadow, only their "
        + "eyes and the edges of their teeth catching the light, one making a small polite gesture.",
    tollgate: "A heavy iron chain strung taut across a stone passage at chest height, a brass toll bell "
        + "hanging from it, and a pair of eyes glinting in the dark behind the chain.",
    sunken_library: "A drowned bookshelf of swollen ruined books, most of them pulped and grey, three or four "
        + "pages still bright and legible floating free of the wreck.",
    knowing_skull: "A polished skull mounted on a small iron stand, its jaw slightly open as if mid-sentence, "
        + "a green light burning steadily behind both eye sockets.",
    // ── ACT THREE ────────────────────────────────────────────────────────────────────────────────────
    long_fall: "The broken end of a stone stair over a black drop, the last step cracked away, and far below "
        + "in the dark one small bright glitter of gold.",
    moai: "An enormous carved stone head with heavy brows and a closed grim mouth, far too large for the "
        + "space, its lower face lost in shadow, moss in the seams of the carving.",
    // Came back as a small horned imp — "halls" carried nothing, so the subject is now the architecture
    // itself and says plainly that it is empty.
    winding_halls: "An impossible stone staircase folding back into itself in the manner of an Escher print, "
        + "three identical torchlit archways set at three different angles so the passage cannot be followed, "
        + "cold blue shadow between them. Empty architecture only: no creature, no figure, no character, "
        + "nobody in the corridor.",
    mind_bloom: "A great flower of pale light opening in the dark, its petals showing faint moving scenes "
        + "inside them, a bright seed of white at its centre.",
    spire_watcher: "A single enormous eye set into carved stone, the lid half lowered, the iris a ring of "
        + "burning gold, tally marks scratched into the stone all around it.",
    // ── THE SHRINES ── the fourteen rooms that can turn up in any act ─────────────────────────────────
    clearspring: "A clear spring welling up through a cracked stone floor into a shallow basin, the water lit "
        + "pale from below, a tin drinking cup on the rim.",
    secondmould: "A heavy two-part stone casting mould, hinged open, still glowing faintly orange along the "
        + "inner seam, with a fresh identical copy of a small object lying in each half.",
    embershrine: "A low stone offering shelf heaped with loose glowing coins and cinders, some spilled onto "
        + "the floor, the whole pile giving off a dull orange light.",
    stillroom: "A wooden rack of apothecary bottles, most of them shattered to stubs, three intact and full "
        + "of luminous coloured liquid, glass fragments on the shelf.",
    changingstone: "A flat round altar stone with a spiral groove cut into its face, half of a small object "
        + "sitting on it dissolving into motes of light while a different shape forms out of the other half.",
    scouring: "A narrow slot of white flame burning upward out of a cut in a stone floor, a single card curling "
        + "to black ash at its lip.",
    turningwheel: "A large painted wooden fortune wheel on an iron spindle, its rim divided into segments "
        + "marked with a coin, an open hand, a bottle, a heart, a closed eye and a broken tooth.",
    olddebt: "A tall hooded figure made of shadow holding out an open ledger with a long list of names on it, "
        + "one line near the bottom freshly written and still wet.",
    bottler: "A wooden market tray hung on straps, packed with small stoppered bottles of coloured liquid, a "
        + "brass hand-scale resting on top of it.",
    blackanvil: "A black iron anvil on a scarred stump with a pair of ornate silver tongs hanging on a hook "
        + "beside it, the tongs far finer than everything around them.",
    watchfire: "A properly laid campfire of stacked split logs burning low and steady, a bedroll left unrolled "
        + "beside it and nobody there.",
    draughtsman: "A drawing desk at an angle covered in inked plans of cards, a straightedge and a scalpel "
        + "laid across it, a lamp on a jointed arm leaning in.",
    maskseller: "A stall board hung with a dozen carved face masks on pegs, each one a different expression, "
        + "two of the pegs empty.",
    // ── ACT ONE ──────────────────────────────────────────────────────────────────────────────────────
    litseam: "A jagged seam of blinding white light splitting a slab of dark rock from top to bottom, hard "
        + "light spilling out of the crack.",
    stonewing: "A single carved stone wing set into a wall at head height, every feather edge cut sharp, a "
        + "dark smear on the lowest one.",
    // ── ACT TWO ──────────────────────────────────────────────────────────────────────────────────────
    carvedpage: "A single page of a book carved in relief into a stone wall panel, its lines of text cut deep, "
        + "one corner chipped away.",
    grafter: "A surgeon's tray of grafting tools — hooked needles, a bone saw, a clamp — laid out on rolled "
        + "leather beside a jar of something pale and floating.",
    thepit: "A round fighting pit floor seen from above, sand raked in circles with a dark iron drain grate at "
        + "its centre, the lowest ring of stone seats around the edge.",
    quietones: "Three tall pale translucent figures standing close together with their hands open and lowered, "
        + "their edges fading into the dark.",
    blackbook: "A heavy black book lying open on a lectern, the visible page dense with cramped writing, the "
        + "remaining pages visibly thicker and darker than the ones already turned.",
    rustaltar: "A squat stone altar block streaked with old rust-coloured stains running down its sides into "
        + "a shallow channel cut around its base.",
    thewager: "A leather betting cup upended on a plank table with coins scattered around it and two small "
        + "carved fighting figures set opposite each other, one large and one small.",
    stonecoffin: "A stone sarcophagus with its heavy lid shoved aside at an angle, darkness in the gap, deep "
        + "scrape marks on the rim where the lid was moved.",
    rookery: "A cluster of large twig nests built into a vertical rock shaft, each one lined with rings, "
        + "buckles and a knife handle taken off the dead.",
    beggar: "A begging bowl and a folded blanket on a stone step, a small pair of shears resting in the bowl.",
    kneelingman: "A gaunt kneeling figure in rags with both hands cupped and held out, the stone worn into a "
        + "hollow under his knees.",
    // ── ACT THREE ────────────────────────────────────────────────────────────────────────────────────
    thesphere: "A polished dark metal sphere hanging unsupported at chest height, seams of pale light running "
        + "around it, turning very slowly.",
    listeningstone: "An upright standing stone with two shallow handprints worn into its face at chest height, "
        + "faint light in the grooves of each print.",
    redmask: "A lacquered deep red face mask resting upright on a plain stone block, facing straight forward, "
        + "its eye holes black.",
};

const FORCE = process.argv.includes("--force");
const only = (() => { const i = process.argv.indexOf("--only"); return i > -1 ? new Set(process.argv[i + 1].split(",")) : null; })();

// ⚠️ AND IT SAYS SO, LOUDLY — a room authored without art falls through to the glyph, which is exactly the
// thing this file exists to stop, and it does it silently.
const missing = EVENTS.filter((e) => !ART[e.id]).map((e) => e.id);

const dir = "public/images/cards/events";
fs.mkdirSync(dir, { recursive: true });
let made = 0, skipped = 0;

for (const ev of EVENTS) {
    if (only && !only.has(ev.id)) continue;
    const subject = ART[ev.id];
    if (!subject) { console.log(`  ${ev.id.padEnd(16)} no prompt written — skipped`); continue; }
    const out = `${dir}/${ev.id}.webp`;
    if (fs.existsSync(out) && !FORCE) { skipped += 1; continue; }

    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
            model: "gpt-image-1", prompt: housePrompt(subject, { extra: BIG }),
            size: "1024x1024", background: "transparent", output_format: "png", quality: "medium", n: 1,
        }),
    });
    if (!resp.ok) { console.log(`  ${ev.id}: OpenAI ${resp.status} ${(await resp.text()).slice(0, 160)}`); continue; }
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) { console.log(`  ${ev.id}: no image returned`); continue; }

    // Trimmed to the object and stored at three times the size it is drawn at. `fit: inside` NOT `fill`: a
    // stair and a skull are not the same proportion and squaring them off is how a set stops looking drawn.
    // ⚠️ WEBP, NOT PNG. These are full-screen illustrations rather than 34px shelf objects, and stored as
    // PNG the set came to six megabytes — about 270kb for one room, on a game played on a phone. The card
    // art in this game is already webp for the same reason; at quality 82 the set is a quarter of the size
    // and the difference is invisible at the size it is drawn.
    const img = await sharp(Buffer.from(b64, "base64"))
        .trim({ threshold: 8 })
        .resize(440, 440, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82, effort: 6 })
        .toBuffer();
    fs.writeFileSync(out, img);
    made += 1;
    console.log(`  ${ev.id.padEnd(16)} ${Math.round(img.length / 1024)}kb`);
}

console.log(`\ndrew ${made}, skipped ${skipped} — about $${(made * 0.042).toFixed(2)}`);
if (missing.length) console.log(`⚠️  no prompt for: ${missing.join(", ")} — these still fall back to a glyph`);
