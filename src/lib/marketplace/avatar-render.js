import "server-only";

import { createAvatar } from "@dicebear/core";
import { avataaars } from "@dicebear/collection";

import { AVATAR_STYLE, sanitizeAvatarConfig } from "@/lib/marketplace/avatar-options.js";

// Server-side avatar SVG generation via DiceBear. This is the ONLY module that pulls in the DiceBear
// dependency, so it stays out of page/client bundles — mappings just build the render URL.

// Turn our stored config (one value per field) into DiceBear avataaars options. "none"/"bald" map to the
// probability toggles the style uses to omit a layer.
function toDicebearOptions(config) {
    const c = sanitizeAvatarConfig(config);
    const opts = {
        seed: "wolfden", // all features are explicit, so the seed only settles anything left unset
        size: 240,
        skinColor: [c.skinColor],
        hairColor: [c.hairColor],
        eyes: [c.eyes],
        eyebrows: [c.eyebrows],
        mouth: [c.mouth],
        clothing: [c.clothing],
        clothesColor: [c.clothesColor],
        clothingGraphic: [c.clothingGraphic], // only used when clothing is graphicShirt
        hatColor: [c.hatColor], // only used when top is a hat
    };

    if (c.top === "bald") {
        opts.top = [];
        opts.topProbability = 0;
    } else {
        opts.top = [c.top];
        opts.topProbability = 100;
    }

    if (c.facialHair === "none") {
        opts.facialHairProbability = 0;
    } else {
        opts.facialHair = [c.facialHair];
        opts.facialHairColor = [c.facialHairColor];
        opts.facialHairProbability = 100;
    }

    if (c.accessories === "none") {
        opts.accessoriesProbability = 0;
    } else {
        opts.accessories = [c.accessories];
        opts.accessoriesColor = [c.accessoriesColor];
        opts.accessoriesProbability = 100;
    }

    // "none" background = transparent, so the card's ring/frame shows through.
    opts.backgroundColor = c.backgroundColor && c.backgroundColor !== "none" ? [c.backgroundColor] : [];

    return opts;
}

// The avatar as an SVG string. AVATAR_STYLE is documented for reference; the style object is imported.
export function generateAvatarSvg(config) {
    void AVATAR_STYLE;
    return createAvatar(avataaars, toDicebearOptions(config)).toString();
}

// The avatar rasterized to a PNG buffer (square, transparent) for use as the reference image fed to the
// OpenAI edits endpoint. The head-and-shoulders avatar is placed in the TOP portion of the canvas with
// empty space below, so the model has room to draw a full body (torso/legs/feet) instead of just
// restyling a bust that fills the frame.
export async function renderAvatarPng(config, size = 1024) {
    const { default: sharp } = await import("sharp");
    const svg = generateAvatarSvg(config);
    // The bust sat 3% from the top, all but flush against the edge, and the model copied that framing —
    // 5 of 14 live sprites came back with the helmet crest or the feet cropped off by the canvas. Pulling it
    // down and in leaves visible empty margin on every side of the reference, which is the composition we
    // actually want back: a whole figure with air around it.
    const bust = Math.round(size * 0.36);
    const avatarPng = await sharp(Buffer.from(svg))
        .resize(bust, bust, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
    return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: avatarPng, top: Math.round(size * 0.08), left: Math.round((size - bust) / 2) }])
        .png()
        .toBuffer();
}
