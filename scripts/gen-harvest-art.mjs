// ── THE HARVEST, REDRAWN ─────────────────────────────────────────────────────────────────────────────────────
// Luke: "it needs a full-on rework of all the sprites on all the tiles... right now you're showing like I
// don't know what the hell you're showing, but we want to show really juicy sprites related to farming, and
// we need the high contrast like we have from the other slots with the cool backgrounds."
//
// He is right and the reason is boring: only four of this cabinet's six symbols were ever drawn. The other
// two fell back to another machine's art, so a farm machine was showing a hook and a pomander. A reel with
// two borrowed symbols on it does not read as a theme, it reads as a bug.
//
// WHAT MAKES A SLOT SYMBOL WORK is not detail, it is SILHOUETTE AND HUE — six things that must be told apart
// at 55px, at speed, while they are moving. So every prompt below names one object, one dominant colour, and
// nothing else in frame. They are die-cut: the coloured tile behind them is CSS, off symbolTone, the same way
// the Vault's gems work.
//
// Run:  node scripts/gen-harvest-art.mjs                # preview into .harvest-art/
//       node scripts/gen-harvest-art.mjs --publish      # ship exactly what you looked at
import fs from "node:fs";

import sharp from "sharp";

import { housePrompt } from "../src/lib/marketplace/art-style.js";
import { priceRun, quality, requirePreview } from "./lib/gen-guard.mjs";
import "./lib/ai-trace.mjs";

const ARGV = process.argv.slice(2);
const APPLY = ARGV.includes("--apply");
const PUBLISH = ARGV.includes("--publish");
const ONLY = (ARGV.find((a) => a.startsWith("--only="))?.slice(7) || "").split(",").filter(Boolean);
const Q = quality();

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/^OPENAI_API_KEY=(.+)$/m)?.[1]?.trim();
if (!key && !PUBLISH) throw new Error("no OPENAI_API_KEY");

const PREVIEW = ".harvest-art";
const OUT = "public/images/casino";

// The file names are the SYMBOL IDS, which are shared across the floor — `slot2-bone` is this cabinet's art
// for the id `bone`, and on this cabinet `bone` is a sack of flour. The ids are meaningless; the art is not.
// ── JUICY, NOT RUSTIC ────────────────────────────────────────────────────────────────────────────────────────
// First pass drew an honest farm: a burlap flour sack, an ear of corn, a jar of preserves. Luke: "they need
// to be sexy and really dopamine-inducing icons in the tiles — think about the star fruit and all those cool
// things."
//
// He is right and the miss is a specific one. I drew a FARM; a slot machine wants CANDY. The reference for
// this is not a harvest festival, it is the fruit machines everybody already finds irresistible — every
// symbol glossy, wet-looking, saturated past nature, plump, lit like a sweet under a shop light. Burlap is
// the least appetising surface there is and flour is a powder. Nothing about either says "press it again".
//
// So: fruit, cut where cutting makes it more interesting, every one with a wet specular highlight and a
// water bead or two. Six hues that stay apart at 55px — lime, orange, crimson, violet, amber, silver-blue —
// and six silhouettes to match, since hue alone fails for anybody who cannot separate them.
const GLOSS = "Rendered like glossy translucent CANDY: a hard wet specular highlight on the upper surface, a "
    + "soft glow through the flesh where light passes into it, two or three beads of water on the skin, "
    + "colours pushed well past natural into jewel saturation, plump and heavy and freshly cut. Nothing else "
    + "in frame, no plate, no board, no background. Must read at 55 pixels wide — chunky silhouette, no fine "
    + "detail.";

const ART = {
    // He named this one, and it is the perfect slot symbol: a five-pointed STAR that happens to be a fruit.
    "reels/slot2-bone": {
        prompt: housePrompt(
            "A thick STAR FRUIT slice cut across so it forms a perfect five-pointed star, translucent "
            + "chartreuse-yellow with its seeds glowing at the centre, beside a small wedge of the whole fruit",
            { framing: "sprite", extra: `Vivid chartreuse and lime yellow. ${GLOSS}` }),
    },
    "reels/slot2-doubloon": {
        prompt: housePrompt(
            "A brilliant ORANGE with one segment split away from it, the segment's flesh translucent and "
            + "glowing, juice standing on the cut face and a single glossy leaf at the top",
            { framing: "sprite", extra: `Vivid saturated orange with one green leaf. ${GLOSS}` }),
    },
    "reels/slot2-laurel": {
        prompt: housePrompt(
            "A huge glossy STRAWBERRY, deep crimson and dimpled with golden seeds, with a bright green calyx "
            + "on top and one half cut open beside it showing pale marbled flesh",
            { framing: "sprite", extra: `Deep crimson and hot pink with a green calyx. ${GLOSS}` }),
    },
    // The biggest ordinary payer, so it gets the most presence — a heavy cluster reads as abundance.
    "reels/slot2-chest": {
        prompt: housePrompt(
            "A fat heavy bunch of GRAPES, each grape a swollen translucent violet sphere with a hard white "
            + "glint on it, hanging from a curled vine with two vivid green leaves",
            { framing: "sprite", extra: `Deep violet and magenta with vivid green leaves. ${GLOSS}` }),
    },
    // ── THE BONUS ── deliberately NOT a fruit. Three of it on a line is the whole reason the cabinet exists,
    // so it has to be the one thing on the reel that could never be mistaken for a payer.
    "reels/slot2-moon": {
        prompt: housePrompt(
            "An enormous glowing amber HARVEST MOON, its surface molten gold and blazing from within, with "
            + "two black silhouetted wheat stalks crossing over its lower half",
            { framing: "sprite", extra: "Molten amber and hot gold, glowing from inside like a lantern, "
                + "against pure black silhouettes. The only light source on the reel. Nothing else in "
                + "frame. Must read at 55 pixels wide." }),
    },
    // ── THE WILD ── the Den's animal, and the only cool colour on a reel of hot fruit, which is exactly what
    // makes it pop out of a line of them.
    "reels/slot2-wolf": {
        prompt: housePrompt(
            "A regal WOLF's head in three-quarter view, its fur silvery ice-blue and glossy, wearing a "
            + "braided crown of golden wheat, eyes blazing amber",
            { framing: "sprite", extra: "Cool silver and ice blue fur against a hot gold crown, amber eyes, "
                + "with a crisp specular sheen along the muzzle and crown. Head and shoulders only. Nothing "
                + "else in frame. Must read at 55 pixels wide." }),
    },

    // ══ THE BONUS SCREEN'S FURNITURE ═════════════════════════════════════════════════════════════════════
    // Luke, on the first cut of the pick screen: "that bonus game is absolute garbage, it looks terrible...
    // you're not thinking about all of the juice you need to add — all the sprites, all the border
    // decorations, all the different glints and animations and effects and sounds and music. A lot of it
    // boils down to just the amount of sprites you're not using and the plainness to everything."
    //
    // He is right, and it is the SAME mistake I made on the Vault and did not learn from: I built the frame
    // in CSS again. Look at what the reference actually has and count the drawings — the counters sit in
    // carved cartouches with pillars either side, the tiles are carved stone with painted faces, gods flank
    // the board, there is gold trim on every edge and a decorated band top and bottom. Mine was two rounded
    // rectangles and a brown grid.
    //
    // A `border-radius` is not furniture. Everything below is a thing that gets DRAWN.
    "thf-beam": {
        wide: true,
        prompt: housePrompt(
            "A long horizontal carved OAK BEAM with polished brass end-caps, a bundle of golden wheat bolted "
            + "to each end and a simple carved groove running the length of its plain middle",
            { framing: "sprite", extra: "Wide banner proportions, roughly four times as wide as tall, seen "
                + "straight on and flat with no perspective. Deep oak brown, warm brass, hot gold wheat. The "
                + "middle of the beam is plain carved wood — no plate, no engraving, no ornament on it." }),
    },
    // The counter cartouche. "An EMPTY plate set into a frame" is a real object the model will happily draw
    // empty — asking for "a frame with a blank middle" is what produced a goblin on the Vault's marquee.
    "thf-plaque": {
        prompt: housePrompt(
            "An ornate carved oak plaque with scrolled corners and a beaded brass rim, holding a completely "
            + "EMPTY polished dark brass plate in its centre, with a small bundle of wheat carved at the top",
            { framing: "sprite", extra: "Slightly wider than tall, seen straight on and flat to the viewer. "
                + "Deep oak, warm brass, gold wheat. The plate in the centre is BARE dark metal — no digits, "
                + "no engraving, no symbols, nothing on it at all." }),
    },
    // The corner bracket, used four times mirrored around the board.
    "thf-corner": {
        px: 256,
        prompt: housePrompt(
            "An ornate carved corner bracket of oak and brass scrollwork with a curl of wheat and a single "
            + "ripe berry worked into it, forming a right angle",
            { framing: "sprite", extra: "Seen straight on and flat. Deep oak, warm brass, gold wheat, one "
                + "red berry. Reads as the top-left corner of a frame." }),
    },
    // A hanging lantern for the sides of the board — the reference's torches, in a barn.
    "thf-lantern": {
        px: 256,
        prompt: housePrompt(
            "A brass barn LANTERN hanging from a short chain, its glass blazing with warm amber light and a "
            + "sprig of wheat tied to its handle",
            { framing: "sprite", extra: "Warm brass and blazing amber, glowing from inside. Taller than "
                + "wide. Nothing else in frame." }),
    },

    // ── THE THREE FACES A TILE CAN TURN OVER ─────────────────────────────────────────────────────────────
    // Painted tokens, not words on a brown square. The reveal is the whole screen and it was text.
    "thf-spin": {
        px: 256,
        prompt: housePrompt(
            "A round golden TOKEN embossed with a curling arrow chasing its own tail around the rim, a ripe "
            + "ear of wheat struck into the centre of it, polished and catching a hard highlight",
            { framing: "sprite", extra: "Hot polished gold and warm amber. Circular. Nothing else in frame. "
                + "No text, no numbers, no letters of any kind." }),
    },
    "thf-mult": {
        px: 256,
        prompt: housePrompt(
            "A faceted ice-blue CRYSTAL shard set into a small brass mount, glowing from within with cold "
            + "light and throwing a hard white glint from its top facet",
            { framing: "sprite", extra: "Cold ice blue and cyan against warm brass — the only cool object "
                + "in this set. Nothing else in frame. No text, no numbers." }),
    },
    "thf-begin": {
        px: 256,
        prompt: housePrompt(
            "A blazing round token of molten gold, its face a harvest sun with flames licking off its rim, "
            + "burning white-hot at the centre",
            { framing: "sprite", extra: "Molten gold, orange flame and a white-hot core — the brightest "
                + "thing in this set by a long way. Circular. Nothing else in frame. No text, no numbers." }),
    },

    // ── THE BACK OF A PICK TILE ──────────────────────────────────────────────────────────────────────────
    // Thirty-six of these on screen and it is the thing a finger lands on, so it cannot be a CSS shape — the
    // first cut drew the sheaf as a conic-gradient and it came out invisible against the tile, which is a
    // board of thirty-six blank brown rectangles: nothing to want, nothing to aim at.
    // The WHOLE tile, not a sheaf floating on a CSS gradient: a carved block with its own border, so
    // thirty-six of them read as a board of objects rather than a grid of divs.
    "harvest-sheaf": {
        px: 256,
        prompt: housePrompt(
            "A square carved OAK TILE with a raised beaded brass border running around its edge, a tied "
            + "bundle of golden wheat carved in relief across its face and a twist of red twine at the "
            + "stems, lit from the upper left",
            { framing: "sprite", extra: "Square, seen straight on and flat to the viewer with no "
                + "perspective. Deep oak brown, warm brass border, hot gold wheat, one red twine. Must read "
                + "clearly at 50 pixels wide — chunky, no fine detail." }),
    },

    // ── AND THE ROOM THE BONUS IS PICKED IN ──────────────────────────────────────────────────────────────
    "harvest-barn": {
        wide: true, scene: true,
        prompt: housePrompt(
            "The inside of a great timber BARN at harvest night: stacked hay bales and crates of glossy "
            + "fruit along both side walls, strings of drying corn and herbs hanging from the rafters, a "
            + "warm lantern glowing high in the roof beams and a huge amber harvest moon in the open "
            + "doorway at the back, with the middle of the floor left clear and uncluttered",
            { framing: "scene", extra: "Portrait orientation, seen straight on. Warm amber lantern light, "
                + "deep golden hay, cool blue night through the doorway. The middle of the image must stay "
                + "simple — panels are laid over it — so keep all detail and ornament to the outer edges." }),
    },
};

const names = Object.keys(ART).filter((k) => !ONLY.length || ONLY.includes(k));
fs.mkdirSync(PREVIEW, { recursive: true });
const flat = (k) => k.replace(/\//g, "__");

const PX = { default: 320 };
async function shipped(k, src) {
    if (ART[k].wide) return sharp(src).resize(768, 1152, { fit: "cover" }).webp({ quality: 88 }).toBuffer();
    const t = await sharp(src).trim({ threshold: 10 }).png().toBuffer();
    const px = ART[k].px || PX.default;
    return sharp(t).resize(px, px, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 92 }).toBuffer();
}

if (PUBLISH) {
    let n = 0;
    for (const k of names) {
        const src = `${PREVIEW}/${flat(k)}.png`;
        if (!fs.existsSync(src)) { console.log("skip (no preview):", k); continue; }
        const dest = `${OUT}/${k}.webp`;
        fs.mkdirSync(dest.slice(0, dest.lastIndexOf("/")), { recursive: true });
        fs.writeFileSync(dest, await shipped(k, src));
        n += 1;
        console.log("published", k, `${(fs.statSync(dest).size / 1024).toFixed(0)}kb`);
    }
    console.log(`\n${n} file(s) into ${OUT}`);
    process.exit(0);
}

const bill = priceRun({ count: names.length, quality: Q });
if (APPLY) requirePreview({ count: names.length, total: bill });

for (const k of names) {
    const a = ART[k];
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
            model: "gpt-image-1", prompt: a.prompt,
            size: a.wide ? "1024x1536" : "1024x1024",
            // ONLY THE BARN IS OPAQUE. `wide` was doing double duty — it means "draw it landscape" AND it
            // was deciding transparency, so the carved beam came back on a solid white ground and rendered
            // as a white band across the top of the bonus. Transparency is about whether the thing is a
            // SCENE, not about its shape.
            background: a.scene ? "opaque" : "transparent",
            quality: Q, n: 1,
        }),
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) throw new Error("no image for " + k);
    fs.writeFileSync(`${PREVIEW}/${flat(k)}.png`, Buffer.from(b64, "base64"));
    console.log("drew", k);
}
console.log(`\nPREVIEW ONLY — look at ${PREVIEW}/ then re-run with --publish.`);
