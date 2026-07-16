import "server-only";

import { createAvatar } from "@dicebear/core";
import { lorelei, notionists } from "@dicebear/collection";

import { sanitizeAvatarConfig, styleFields } from "@/lib/marketplace/avatar-options.js";

// Server-side avatar SVG generation via DiceBear. The ONLY module that pulls in the DiceBear dependency,
// so it stays out of page/client bundles. One entry per supported style.
const STYLE_MODULES = { lorelei, notionists };

// Map our stored config to DiceBear options for its style. Colors -> [hex]; optional features use the
// style's <field>Probability (100 to show the chosen variant, 0 for "none").
function toDicebearOptions(config) {
    const clean = sanitizeAvatarConfig(config);
    const opts = { seed: "wolfden", backgroundColor: [] };
    for (const f of styleFields(clean.style)) {
        const val = clean[f.key];
        if (f.type === "color") {
            opts[f.key] = [val];
        } else if (f.optional && val === "none") {
            opts[`${f.key}Probability`] = 0;
        } else {
            opts[f.key] = [val];
            if (f.optional) opts[`${f.key}Probability`] = 100;
        }
    }
    return { style: clean.style, opts };
}

// The avatar as an SVG string, in the config's chosen style.
export function generateAvatarSvg(config) {
    const { style, opts } = toDicebearOptions(config);
    const mod = STYLE_MODULES[style] || STYLE_MODULES.lorelei;
    return createAvatar(mod, { ...opts, size: 240 }).toString();
}

// The avatar rasterized to a PNG buffer for the OpenAI edits endpoint (the AI sprite reference). The
// head-and-shoulders avatar is placed in the TOP portion with empty space below, so the model has room to
// draw a full body instead of just restyling a bust that fills the frame.
export async function renderAvatarPng(config, size = 1024) {
    const { default: sharp } = await import("sharp");
    const svg = generateAvatarSvg(config);
    const bust = Math.round(size * 0.42);
    const avatarPng = await sharp(Buffer.from(svg))
        .resize(bust, bust, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
    return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: avatarPng, top: Math.round(size * 0.03), left: Math.round((size - bust) / 2) }])
        .png()
        .toBuffer();
}
