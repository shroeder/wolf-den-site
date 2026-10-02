// ── THE DISC ART AND THE LANDING MATHS MUST AGREE ────────────────────────────────────────────────────────────
//   node scripts/verify-wheel-phase.mjs
//
// There are two prize-wheel discs now — the gold one and the Hallowe'en one — and both are read by the SAME
// wheel-geometry.js. WEDGES, WEDGE_DEG and WEDGE_OFFSET decide where landingRotation() parks the won wedge and
// where iconPos() puts the sprites; the picture underneath is a separate file that nothing checks.
//
// So this checks it. It samples each disc along the icon ring and asserts two things:
//   1. a wedge CENTRE (k·18° + WEDGE_OFFSET) is a flat field of one colour — the sprite is not sitting on a line
//   2. a DIVIDER (centre + 9°) is a local lightness spike — the bone/gold stroke really is there
//
// The failure this exists to catch is silent and expensive: half a wedge of drift shows the pointer stopping
// on the boundary between two prizes, and a member reads the neighbour. wheel-geometry.js already records
// "icons were landing on the divider lines at offset 9" — that bug shipped once.
import sharp from "sharp";

import { WEDGES, WEDGE_DEG, WEDGE_OFFSET } from "../src/lib/marketplace/wheel-geometry.js";

const DISCS = [
    { label: "gold", file: "public/images/spin/wheel-disc.png" },
    { label: "hallowe'en", file: "public/images/spin/wheel-disc-hw.webp" },
];

// Sample at the radius the prize sprites actually sit at. ICON_R is in rotor units where the radius is 50, so
// 34/50 of the way out — and the disc image's own drawn radius is 0.475 of its width.
const SAMPLE_R = (34 / 50) * 0.475;

let bad = 0;
for (const { label, file } of DISCS) {
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: W, height: H, channels: C } = info;
    const cx = W / 2, cy = H / 2, rr = SAMPLE_R * W;

    const lum = (deg) => {
        const a = ((deg - 90) * Math.PI) / 180;
        const x = Math.round(cx + rr * Math.cos(a)), y = Math.round(cy + rr * Math.sin(a));
        const i = (y * W + x) * C;
        return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    };

    const centreSpread = [];     // how much the colour varies across ±3° of a wedge centre
    const dividerLift = [];      // how much brighter the divider is than the wedge either side of it
    for (let k = 0; k < WEDGES; k += 1) {
        const c = k * WEDGE_DEG + WEDGE_OFFSET;
        const near = [-3, -1.5, 0, 1.5, 3].map((d) => lum(c + d));
        centreSpread.push(Math.max(...near) - Math.min(...near));

        const d = c + WEDGE_DEG / 2;
        dividerLift.push(lum(d) - (lum(d - 4) + lum(d + 4)) / 2);
    }

    const worstCentre = Math.max(...centreSpread);
    const weakestDivider = Math.min(...dividerLift);
    const okCentre = worstCentre < 28;          // a flat field; a line through it reads far higher
    const okDivider = weakestDivider > 6;       // the stroke is lighter than the wedges it separates

    console.log(`  ${label.padEnd(11)} ${file}`);
    console.log(`      wedge centres  worst variation ${worstCentre.toFixed(1)}  ${okCentre ? "flat — no divider under a sprite" : "⚠️ A DIVIDER RUNS THROUGH A WEDGE CENTRE"}`);
    console.log(`      dividers       weakest lift ${weakestDivider.toFixed(1)}  ${okDivider ? `found all ${WEDGES}` : "⚠️ A DIVIDER IS NOT WHERE THE GEOMETRY SAYS"}`);
    if (!okCentre || !okDivider) bad += 1;
}

if (bad) {
    console.error(`\nverify-wheel-phase — ${bad} disc(s) disagree with wheel-geometry.js.`);
    console.error("The art and the landing animation are out of phase: the pointer will stop between prizes.");
    process.exit(1);
}
console.log(`\nverify-wheel-phase — both discs are ${WEDGES} wedges on the same phase as the landing maths.`);
