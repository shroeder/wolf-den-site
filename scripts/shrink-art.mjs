// ── THE GENERATOR WRITES WHAT THE MODEL HANDS BACK, AND THAT IS NEARLY UNCOMPRESSED ──────────────────────────
// gpt-image-1 returns webp at close to lossless, so every backdrop this repo has ever generated landed on
// disk at 1.6 to 1.8 MB — and a zone backdrop is shown at about 1,400px on the widest screen anyone uses.
// Re-encoding the same picture at quality 90 takes zone-stubble from 1,821 KB to 179 KB, and the two are
// indistinguishable side by side at the size they are actually displayed.
//
// That is 1.6 MB a member downloads to walk into a zone, on a phone, on shop wifi.
//
//   node scripts/shrink-art.mjs public/images/grove            # say what it would do
//   node scripts/shrink-art.mjs public/images/grove --apply    # do it
//
// ⚠️ NO VERSION BUMP NEEDED, UNUSUALLY. redrawn-art-must-be-versioned exists because the same path with new
// bytes leaves everyone holding yesterday's picture for a day. Here the old bytes ARE the same picture, just
// larger — a stale cache costs nothing but the bandwidth it already spent.
//
// ⚠️ AND IT NEVER TOUCHES THE SMALL ONES. The alpha-trimmed item sprites are already 20-40 KB; re-encoding
// those buys a few kilobytes and risks the clean edges the drop-shadow depends on. See
// sprite-alpha-floor-drop-shadow-box.
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

const dir = process.argv[2];
const APPLY = process.argv.includes("--apply");
const QUALITY = Number((process.argv.find((a) => a.startsWith("--q=")) || "--q=90").slice(4));
const FLOOR_KB = Number((process.argv.find((a) => a.startsWith("--floor=")) || "--floor=400").slice(8));

if (!dir || !fs.existsSync(dir)) {
    console.log("usage: node scripts/shrink-art.mjs <folder> [--apply] [--q=90] [--floor=400]");
    process.exit(1);
}

const files = fs.readdirSync(dir)
    .filter((f) => /\.(webp|png|jpe?g)$/i.test(f))
    .map((f) => path.join(dir, f))
    .filter((f) => fs.statSync(f).size > FLOOR_KB * 1024);

if (!files.length) {
    console.log(`nothing in ${dir} is over ${FLOOR_KB} KB`);
    process.exit(0);
}

let was = 0;
let now = 0;
let done = 0;
for (const f of files) {
    // ⚠️ READ INTO MEMORY FIRST, THEN ENCODE. Handing sharp a PATH leaves it holding that file open, and
    // writing back to the same path then fails on Windows with a bare "UNKNOWN: unknown error" that names
    // the file and nothing else. Reading the bytes myself releases the handle before the write.
    const input = fs.readFileSync(f);
    const before = input.length;
    // ⚠️ RE-ENCODED FROM THE PIXELS, NOT TRANSCODED. Decoding to a bitmap first is what makes the quality
    // setting mean anything.
    const buf = await sharp(input).webp({ quality: QUALITY }).toBuffer();
    // A re-encode that grows the file is a re-encode worth skipping; it happens on anything already lean.
    if (buf.length >= before) { console.log(`  skip ${path.basename(f)} — already smaller than q${QUALITY}`); continue; }
    was += before;
    now += buf.length;
    done += 1;
    if (APPLY) fs.writeFileSync(f, buf);
    console.log(`  ${path.basename(f).padEnd(28)} ${(before / 1024).toFixed(0).padStart(5)} KB -> ${(buf.length / 1024).toFixed(0).padStart(4)} KB`);
}

console.log(`\n${done} file(s): ${(was / 1048576).toFixed(1)} MB -> ${(now / 1048576).toFixed(1)} MB`
    + `  (${(100 - (now / was) * 100).toFixed(0)}% smaller)`);
if (!APPLY) console.log("dry run — pass --apply to write them");
