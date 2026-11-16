// ── THE SPRITE BANDS FOR THE GROVE LAUNCH EMAIL ─────────────────────────────────────────────────────────────
// Luke: "It doesn't use our theme, you know, like the dark theme and the yellow primary. It doesn't have any
// cool sprite groupings at all."
//
// ⚠️ COMPOSITED INTO ONE FLAT PNG PER BAND, NOT LAID OUT IN HTML. Outlook renders mail through Word, which
// has no CSS positioning — overlapping sprites laid out in markup either stack vertically or vanish. So each
// band is baked here, with the card colour already behind it, and the email drops in one <img>. Same
// reasoning as the win-back bands (05e4f7d2), which is the only approach in this repo proven on real inboxes.
//
// ⚠️ PNG, NOT WEBP. The source art is webp and Outlook will not render it. sharp converts.
//
// ⚠️ NOTHING IS GENERATED. Every sprite already exists in public/images/grove — 76 creatures, 84 bosses,
// 156 tool rungs, the chests and the armour. See [[check-existing-sprites-first]]. This costs nothing.
//
//   node scripts/gen-grove-email-art.mjs
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

const SRC = "public/images/grove";
const OUT = "public/images/email";
fs.mkdirSync(OUT, { recursive: true });

// The card these sit on. Baked in so the band has no visible edge against it.
const CARD = { r: 18, g: 24, b: 18 };
const W = 1120;              // 560pt at 2x, which is the shell's max width

/** One row of sprites, evenly spaced, baseline-aligned, biggest in the middle. */
async function band(name, files, { h = 300, size = 190, bigIndex = null, tint = null } = {}) {
    const present = files.filter((f) => fs.existsSync(path.join(SRC, f)));
    if (present.length < files.length) {
        console.log(`  ⚠️ ${name}: missing ${files.filter((f) => !present.includes(f)).join(", ")}`);
    }
    if (!present.length) { console.log(`  ✗ ${name}: nothing to draw`); return; }

    const gap = Math.floor(W / present.length);
    const layers = [];
    for (let i = 0; i < present.length; i += 1) {
        const big = bigIndex === i;
        const s = big ? Math.round(size * 1.35) : size;
        const buf = await sharp(path.join(SRC, present[i]))
            .resize({ width: s, height: s, fit: "inside", withoutEnlargement: false })
            .png()
            .toBuffer();
        const m = await sharp(buf).metadata();
        layers.push({
            input: buf,
            left: Math.max(0, Math.round(gap * i + (gap - m.width) / 2)),
            // ⚠️ BASELINE ALIGNED, NOT CENTRED. Creatures are drawn standing on the bottom of their plate,
            // so centring them vertically makes a row of bodies float at different heights.
            top: Math.max(0, h - m.height - 8),
        });
    }

    let img = sharp({ create: { width: W, height: h, channels: 4, background: { ...CARD, alpha: 1 } } })
        .composite(layers);
    if (tint) {
        // A wash of the band's own colour over the whole strip, so three bands read as a set rather than
        // three screenshots. Kept low — the art is the point.
        const wash = await sharp({ create: { width: W, height: h, channels: 4, background: tint } }).png().toBuffer();
        img = sharp(await img.png().toBuffer()).composite([{ input: wash, blend: "overlay" }]);
    }
    const file = path.join(OUT, `${name}.png`);
    await img.png({ quality: 90, compressionLevel: 9 }).toFile(file);
    console.log(`  ✓ ${name}.png  ${Math.round(fs.statSync(file).size / 1024)}kb  (${present.length} sprites)`);
}

console.log("\nbuilding the Grove email bands from art that already exists\n");

// 1. THE FOREST — what you fight. A boss in the middle, bigger, flanked by wanderers.
await band("grove-foes", [
    "foe-bog_walker.webp",
    "foe-cave_crawler.webp",
    "boss-bellowmaw.webp",
    "foe-ashglass_shrike.webp",
    "foe-basalt_golem.webp",
], { h: 320, size: 200, bigIndex: 2 });

// 2. THE GEAR — what it pays. Head, body, feet across the rarities.
await band("grove-gear", [
    "armour-common_head.webp",
    "armour-rare_body.webp",
    "armour-legendary_head.webp",
    "armour-epic_body.webp",
    "armour-uncommon_feet.webp",
], { h: 260, size: 175 });

// 3. THE TOOLS AND THE CHESTS — what the kill bar hands you, and what it becomes.
await band("grove-tools", [
    "tool-banner-t6.webp",
    "chest-mossbound.webp",
    "tool-rod-t6.webp",
    "chest-barrowed.webp",
    "tool-pick-t6.webp",
], { h: 240, size: 165 });

console.log("");
