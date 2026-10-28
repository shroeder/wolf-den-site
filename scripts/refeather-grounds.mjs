// ── SOFTEN THE TOP EDGE OF EVERY GROUND BAND ─────────────────────────────────────────────────────────────────
// The seven grounds were drawn before the feathering existed, and a ground band with a hard top edge draws a
// straight line across the street where it meets the midground. This fades the top tenth of each to nothing.
//
// ⚠️ FREE, AND IT MUST STAY FREE. This is post-processing on files that already exist — it never calls the
// image API. Re-running it twice would feather an already-feathered edge, so it skips anything that already
// has transparency at the top.
import fs from "node:fs";
import sharp from "sharp";

const DIR = "public/images/town/ground";
const FRAC = 0.10;

async function feather(file) {
    // ⚠️ READ THE WHOLE FILE INTO MEMORY FIRST. sharp holds the path open lazily, and on Windows writing back
    // to a path it is still reading throws EUNKNOWN on the open. Decode from a buffer and the handle is gone
    // before the write starts.
    const src = fs.readFileSync(file);
    const img = sharp(src).ensureAlpha();
    const { width, height } = await img.metadata();
    const { data } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let top = 0;
    for (let x = 0; x < width; x += 1) top += data[x * 4 + 3];
    if (Math.round(top / width) < 250) return false;   // already soft

    const band = Math.max(1, Math.round(height * FRAC));
    const mask = Buffer.alloc(width * height * 4, 0);
    for (let y = 0; y < height; y += 1) {
        const a = y >= band ? 255 : Math.round((y / band) * 255);
        for (let x = 0; x < width; x += 1) {
            const i = (y * width + x) * 4;
            mask[i] = mask[i + 1] = mask[i + 2] = 255;
            mask[i + 3] = a;
        }
    }
    const out = await img.composite([{ input: mask, raw: { width, height, channels: 4 }, blend: "dest-in" }])
        .webp({ quality: 90, alphaQuality: 100 }).toBuffer();
    fs.writeFileSync(file, out);
    return true;
}

for (const f of fs.readdirSync(DIR)) {
    if (!f.endsWith(".webp") || f.includes("-back") || f.includes("-sky") || f.startsWith("_")) continue;
    const done = await feather(`${DIR}/${f}`);
    console.log(`${done ? "softened" : "already soft"}  ${f}`);
}
