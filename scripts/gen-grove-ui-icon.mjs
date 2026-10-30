// ── ONE DOCK ICON FOR THE GROVE ──────────────────────────────────────────────────────────────────────────────
// The dock is the Grove's only navigation and every destination on it is a painted object — map, backpack,
// workbench, emblems. A glyph among them would read as a missing asset, and [[no-icons-or-glyphs-in-the-game]]
// is a standing rule besides: a glyph fallback HIDES the gap rather than showing it.
//
// ⚠️ IT READS AT ABOUT 40 PIXELS. That is the whole brief. Every icon already on the dock is ONE object with a
// loud silhouette and no small print, because at dock size a detailed scene is a smudge. The style string
// below is reverse-engineered from the eight that shipped, so a new one sits in the row rather than beside it.
//
//   node scripts/gen-grove-ui-icon.mjs gear
import fs from "node:fs";
import path from "node:path";
import { register } from "node:module";

import sharp from "sharp";

register("./lib/app-loader.mjs", import.meta.url);
const { IMAGE_MODEL } = await import("@/lib/marketplace/image-model.js");

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const KEY = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();

const OUT = "public/images/grove";
const ICONS = {
    // Distinct from ui-vault (a chest), ui-belt (a belt) and ui-tools (a pick and hammer) at a glance, which
    // is the only test that matters on a row of eight.
    gear: "A suit of adventurer's armour: a steel breastplate with warm brown leather straps and brass "
        + "buckles, standing upright, with the hilt and upper blade of a sword rising behind one shoulder "
        + "and a round shield leaning against its base",
    // ⚠️ THE MENU ROW FOR MONSTER CARDS WAS A GOLD LOCKET. That said the right thing when these were
    // amulets and says nothing now they are cards -- Luke flagged it as the one sprite that does not match
    // the thing it names. A fan of cards has a silhouette nothing else on the menu has (map is a scroll,
    // backpack a bag, gear a breastplate, workbench a bench), which is the only test that matters here.
    // The creature on the face is deliberately vague: at 46px it is a shape, and a specific monster would
    // make the row look like it opens that one card.
    cards: "A small fan of three thick trading cards held together, splayed like a hand of cards, with "
        + "carved dark wooden borders and brass corner studs. The front card shows a simple snarling "
        + "beast's head painted on a deep green field; the two behind it are seen edge-on as thick "
        + "layered card stock",
};

// ── ⚠️ A FRAME IS NOT AN ICON AND NEEDS ITS OWN BRIEF ────────────────────────────────────────────────────────
// These are sliced by CSS border-image: the four corners are pinned and the four EDGES ARE REPEATED to
// whatever length the row needs. That imposes two things no icon prompt cares about:
//   · the middle must be genuinely empty, or the repeat tiles a smear across the card area
//   · each edge must read as a continuous run of the same material, so that repeating it does not produce a
//     visible seam every 128px
// Hence "continuous", "even thickness", "hollow centre" said three ways. The model will not infer any of it
// from the word "frame", which on its own reliably produces a picture frame with a scene inside.
const FRAMES = {
    wood: "An ornate rectangular border of dark thorny brambles, gnarled branches, twisting briar vines and "
        + "sharp curved thorns, with small oak leaves and moss. The border is a CONTINUOUS even-thickness "
        + "band of tangled growth running around all four edges and meeting at four thick knotted corners. "
        + "The centre is COMPLETELY EMPTY — a large hollow rectangular opening with nothing inside it",
};

// Reverse-engineered from the eight that shipped: painterly cel-shade, heavy dark ink contour, two or three
// flat tone steps, warm brown and gold with cool steel-blue metal, chunky and slightly oversized proportions.
const STYLE = "Painterly cel-shaded 2D video-game icon with a heavy dark ink contour around the whole "
    + "silhouette and around each major form, two or three flat tone steps per surface, warm saturated browns "
    + "and golds with cool steel-blue metal, chunky slightly exaggerated proportions, lit from the upper "
    + "left. A SINGLE isolated object, centred, filling the frame, seen from slightly above at three-quarter "
    + "view.";
// Same house hand as STYLE, minus everything that says "one object in the middle of the frame".
const FRAME_STYLE = "Painterly cel-shaded 2D video-game border art with a heavy dark ink contour, two or "
    + "three flat tone steps per surface, deep saturated greens and warm browns, lit from the upper left. "
    + "Drawn flat-on, square to the canvas, filling the whole canvas edge to edge with the band of growth "
    + "touching all four outer edges.";

const BAN = "FULLY TRANSPARENT background — no ground, no cast shadow on any surface, no scene, no sky, no "
    + "characters, no text, no letters, no numbers, no logo, no border, no frame. Nothing but the object.";

// ⚠️ A FRAME MUST NOT BE TRIMMED OR RE-CENTRED. The icon path below trims to the subject and pads it back
// to a square, which for a frame would crop the outer edge of the border and then inset it — border-image
// slices at fixed percentages, so anything that moves the art relative to the canvas moves the slice lines
// off the drawing. Frames are written through at full size, untouched.
const FRAME = process.argv.includes("--frame");

const want = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!want.length) { console.log(`icons: ${Object.keys(ICONS).join(" ")}`); process.exit(0); }
// ⚠️ THREE IS THE CEILING AND IT IS LUKE'S MONEY. See [[batch-max-three-and-foreground]].
if (want.length > 3) { console.error("at most three at a time."); process.exit(1); }

for (const key of want) {
    const table = FRAME ? FRAMES : ICONS;
    if (!table[key]) { console.error(`no such ${FRAME ? "frame" : "icon"}: ${key}`); continue; }
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
            model: IMAGE_MODEL, prompt: `${table[key]}. ${FRAME ? FRAME_STYLE : STYLE} ${BAN}`,
            // ⚠️ MEDIUM. Never high, in this script or any other — see the rule at the top of CLAUDE.md.
            size: "1024x1024", quality: "medium", background: "transparent", n: 1,
        }),
    });
    if (!resp.ok) { console.log(`✗ ${key}: ${resp.status} ${(await resp.text()).slice(0, 200)}`); continue; }
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) { console.log(`✗ ${key}: no image back`); continue; }

    // ⚠️ ALPHA FLOORED BEFORE THE TRIM. "Transparent" from this model is routinely alpha 1-30 around the
    // subject, so a trim without the floor finds the whole plate and crops nothing — the lesson the town
    // foregrounds taught. 40 because gem and metal edges sit as high as 34.
    const { data, info } = await sharp(Buffer.from(b64, "base64")).ensureAlpha().raw()
        .toBuffer({ resolveWithObject: true });
    for (let i = 3; i < data.length; i += 4) if (data[i] <= 40) data[i] = 0;
    const pipe = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
    const out = await (FRAME
        // Full canvas, untouched geometry — see the note on FRAME above.
        ? pipe.resize(512, 512, { fit: "fill" })
        : pipe.trim({ threshold: 1 })
            .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    ).webp({ quality: 92 }).toBuffer();
    const file = path.join(OUT, FRAME ? `frame-${key}.webp` : `ui-${key}.webp`);
    fs.writeFileSync(file, out);
    const m = await sharp(out).metadata();
    console.log(`✓ ${path.basename(file)}  ${m.width}x${m.height}  ${Math.round(out.length / 1024)}kb`);
}
