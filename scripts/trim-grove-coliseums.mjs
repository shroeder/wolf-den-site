// ── TRIM EACH COLISEUM FRONT TO THE BUILDING ────────────────────────────────────────────────────────────────
// ⚠️ A SPRITE STANDS ON ITS MEASURED SURFACE, NOT ON ITS CANVAS. [[a-sprite-stands-on-its-measured-surface]].
//
// DIE_CUT asks the model for ~8% empty margin on all four sides so nothing gets cropped, and it obeys —
// unevenly. Measured on the first three fronts:
//
//     rootwood   content 980x761   bottom gap 144px   14.1% of the sprite
//     gilded     content 990x902   bottom gap  83px    8.1%
//     ashen      content 1015x901  bottom gap  83px    8.1%
//
// Dropped into a box whose bottom is the ground line, that gap is the building hovering above the floor —
// by a different amount each, so they do not even float consistently. And because the CONTENT aspect
// differs (980x761 is much wider than it is tall; the other two are nearly square), object-fit: contain
// inside one square box renders all three at different scales. Together that is the whole reason the set
// reads as "meh" rather than planted: not one of the buildings is actually standing on anything.
//
// So: crop to the alpha bounding box, and publish the resulting aspect ratio so the scene can size every
// front by HEIGHT and let width follow. Then all seven are the same height, and all seven touch the floor.
//
//   node scripts/trim-grove-coliseums.mjs            # report only
//   node scripts/trim-grove-coliseums.mjs --apply
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const DIR = "public/images/grove";
const APPLY = process.argv.includes("--apply");
const ALPHA_FLOOR = 8; // "transparent" comes back as alpha 1-2, never 0 — see [[sprite-alpha-floor-drop-shadow-box]]

const files = fs.readdirSync(DIR).filter((f) => /^coliseum-.+\.webp$/.test(f));
if (!files.length) { console.log("no coliseum-*.webp to trim"); process.exit(0); }

const ratios = {};
for (const f of files) {
    const src = path.join(DIR, f);
    // ⚠️ READ THE BYTES FIRST, THEN HAND SHARP A BUFFER. Given a PATH, sharp keeps the file open and
    // writing back to it fails on Windows with EBUSY/UNKNOWN after all the work is already done. From a
    // buffer there is no handle to collide with.
    const bytes = fs.readFileSync(src);
    const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: W, height: H, channels: C } = info;
    let minX = W, minY = H, maxX = 0, maxY = 0;
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            if (data[(y * W + x) * C + 3] > ALPHA_FLOOR) {
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
        }
    }
    const w = maxX - minX + 1, h = maxY - minY + 1;
    const id = f.replace(/^coliseum-|\.webp$/g, "");
    ratios[id] = +(w / h).toFixed(3);
    console.log(`${id.padEnd(11)} ${W}x${H} -> ${w}x${h}  aspect ${ratios[id]}`
        + `   (was floating ${(((H - 1 - maxY) / H) * 100).toFixed(1)}% above its own base)`);
    if (!APPLY) continue;
    const out = await sharp(bytes).extract({ left: minX, top: minY, width: w, height: h })
        .webp({ quality: 92 }).toBuffer();
    fs.writeFileSync(src, out);
}
console.log(`\naspect ratios: ${JSON.stringify(ratios)}`);
if (!APPLY) console.log("nothing written. --apply to trim.");
