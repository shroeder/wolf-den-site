// Stack a disc and a frame at the REAL proportions the page uses, so the composite can be judged without
// booting the app. .cw-rotor is 82% of .cw-stage and .cw-frame is 100% of it — getting that ratio wrong is
// what made an earlier ICON_R look right in a mock and wrong on the screen.
//
//   node scripts/preview-spin-wheel.mjs                       the ordinary gold wheel
//   node scripts/preview-spin-wheel.mjs hw                    the Hallowe'en wheel
//   node scripts/preview-spin-wheel.mjs hw --icons            with the prize sprites on their wedges
import sharp from "sharp";

import { WEDGES, WEDGE_DEG, WEDGE_OFFSET, ICON_R } from "../src/lib/marketplace/wheel-geometry.js";

const HW = process.argv[2] === "hw";
const SUFFIX = HW ? "-hw" : "";
// The Hallowe'en pair is WebP (see gen-spin-hw-wheel.mjs); the gold pair is still PNG.
const EXT = HW ? "webp" : "png";
const WITH_ICONS = process.argv.includes("--icons");
const S = 1024, cx = S / 2, cy = S / 2;
const ROTOR = 0.82;                      // .cw-rotor { width: 82% }

const layers = [];

const discPx = Math.round(S * ROTOR);
layers.push({
    input: await sharp(`public/images/spin/wheel-disc${SUFFIX}.${EXT}`).resize(discPx, discPx).png().toBuffer(),
    left: Math.round(cx - discPx / 2), top: Math.round(cy - discPx / 2),
});

// The prize sprites, at the same polar positions iconPos() writes. A wheel preview without them hides the
// only failure that matters: a wedge whose ground is too busy for the icon sitting on it to be read.
if (WITH_ICONS) {
    const SAMPLES = [
        "prizes/coins-small.png", "prizes/gem-jackpot.png", "prizes/xp-orb.png", "prizes/pet-treat.png",
        "prizes/seed-pouch.png", "prizes/potion-red.png", "prizes/chest-gold.png", "prizes/spin-ticket.png",
        "prizes/mystery-box.png", "prizes/dig-shard.png",
    ];
    const icoPx = Math.round(discPx * 0.095 * 1.16);     // .cw-ico 9.5% of the rotor, .cw-ico-img 116% of that
    for (let i = 0; i < WEDGES; i += 1) {
        const th = ((i * WEDGE_DEG + WEDGE_OFFSET) * Math.PI) / 180;
        // iconPos writes percentages of the ROTOR's width, where the radius is 50 units — not 100.
        const px = cx + discPx * (ICON_R / 100) * Math.sin(th);
        const py = cy - discPx * (ICON_R / 100) * Math.cos(th);
        layers.push({
            input: await sharp(`public/images/spin/${SAMPLES[i % SAMPLES.length]}`).resize(icoPx, icoPx, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(),
            left: Math.round(px - icoPx / 2), top: Math.round(py - icoPx / 2),
        });
    }
}

layers.push({ input: await sharp(`public/images/spin/wheel-frame${SUFFIX}.${EXT}`).resize(S, S).png().toBuffer(), left: 0, top: 0 });

// The page's own ground, not white and not transparent — a dark wheel judged on white reads as high-contrast
// when it is about to sit on #11161d.
const out = `out/wheel-preview${SUFFIX}${WITH_ICONS ? "-icons" : ""}.png`;
await sharp({ create: { width: S, height: S, channels: 4, background: { r: 17, g: 22, b: 29, alpha: 1 } } })
    .composite(layers).png().toFile(out);
console.log(out);
