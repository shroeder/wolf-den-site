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

// The avatar rasterized to a PNG buffer (square, transparent). Used as the reference image fed to the
// OpenAI edits endpoint so the generated sprite matches the member's actual avatar.
export async function renderAvatarPng(config, size = 1024) {
    const { default: sharp } = await import("sharp");
    const svg = generateAvatarSvg(config);
    return sharp(Buffer.from(svg)).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}
