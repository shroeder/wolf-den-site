// ── WHICH WAY IS EVERY ROAD FIGHTER FACING ───────────────────────────────────────────────────────────────────
// Emits sheets that pair each rung, mirrored exactly as the ring draws it, with the HERO standing on the left.
// Read them by eye. Anything not looking at the king is a bug: `node scripts/gen-ladder-rungs.mjs --flip N`.
//
// ── WHY IT IS A HUMAN SHEET AND NOT A CHECK ──────────────────────────────────────────────────────────────────
// Three automated attempts failed on this, and the way each failed is worth keeping:
//
//   1. `facesLeft()` in fighter-sprite.mjs — one gpt-4o call per sprite, asked which way the figure points. It
//      is what put half of these the wrong way round in the first place, and it re-broke rung 9 on three
//      separate redraws. Every regeneration re-rolls it, so a sprite you flipped by hand can come back flipped.
//   2. A three-vote majority on a HEAD CROP. Better question, still wrong: it called rungs 15 and 16 backwards
//      3-0 immediately after both were fixed.
//   3. A three-vote majority on the PAIR — this exact image, asking "is the right-hand fighter turned toward
//      the king or away". It answered "toward" for a sprite deliberately reversed as a control. No
//      discriminative power at all.
//
// Reading them by eye is not the fallback, it is the method. And the pairing is the part that makes it work:
// judging a lone sprite means holding "art faces right, the ring mirrors it" in your head and re-deriving the
// answer a hundred times — I got that wrong repeatedly, at 400px AND at 620px, including twice on the same
// fighter. Put the hero in the frame and the question becomes "are these two looking at each other", which is
// a fact about one picture. That is the question Luke answers in a glance from a phone screenshot, which is
// why he found six that two of my audits passed.
//
// Usage: node scripts/audit-facing.mjs [--hero <path-or-url>]
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";

const DIR = "public/images/arena/ladder";
const OUT = path.join(os.tmpdir(), "road-facing");
const CELL_W = 520, CELL_H = 262, COLS = 2, ROWS = 4, PER = COLS * ROWS, FIG = 250;

// Any full-body sprite that faces RIGHT works as the reference; a member avatar is the honest one because it
// is literally who stands there. Falls back to a rung known to be correct so the tool runs with no arguments.
const heroArg = process.argv[process.argv.indexOf("--hero") + 1];
let heroSrc = heroArg && !heroArg.startsWith("--") ? heroArg : path.join(DIR, "rung-1.webp");
if (/^https?:/.test(heroSrc)) {
    const tmp = path.join(os.tmpdir(), "facing-hero.webp");
    fs.writeFileSync(tmp, Buffer.from(await (await fetch(heroSrc)).arrayBuffer()));
    heroSrc = tmp;
}
// The reference must face RIGHT, since it stands on the left. A rung is stored facing right by convention.
const hero = await sharp(heroSrc).trim({ threshold: 10 })
    .resize(FIG, FIG, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } }).toBuffer();

fs.mkdirSync(OUT, { recursive: true });
const nums = [];
for (let n = 1; n <= 100; n += 1) if (fs.existsSync(path.join(DIR, `rung-${n}.webp`))) nums.push(n);

for (let g = 0; g * PER < nums.length; g += 1) {
    const part = nums.slice(g * PER, (g + 1) * PER);
    const comp = [];
    for (let i = 0; i < part.length; i += 1) {
        // .flop() IS THE POINT — it is what ArenaClient does to every foe (scaleX(-1), baked into
        // arBreatheFoe). Auditing the stored art instead is auditing a picture no player ever sees.
        const foe = await sharp(path.join(DIR, `rung-${part[i]}.webp`)).flop().trim({ threshold: 10 })
            .resize(FIG, FIG, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } }).toBuffer();
        const cx = (i % COLS) * CELL_W, cy = Math.floor(i / COLS) * CELL_H;
        comp.push({ input: hero, left: cx + 4, top: cy + 6 });
        comp.push({ input: foe, left: cx + FIG + 12, top: cy + 6 });
    }
    await sharp({ create: { width: COLS * CELL_W, height: ROWS * CELL_H, channels: 3, background: { r: 246, g: 246, b: 250 } } })
        .composite(comp).png().toFile(path.join(OUT, `pair-${g}.png`));
    console.log(`pair-${g}.png — rungs ${part[0]}-${part[part.length - 1]} (left to right, then down)`);
}
console.log(`\n${OUT}\nEvery right-hand fighter should be looking AT the hero. Flip any that are not.`);
