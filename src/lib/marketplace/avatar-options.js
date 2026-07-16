// Multi-style avatar identity, backed by the generated per-style catalog (avatar-styles-data.js). Members
// pick an art set (Lorelei / Notionists) then customize its native options. Pure module (no DiceBear
// import) so the picker + sanitize + URL building work on client and server alike.

import { AVATAR_STYLES, DEFAULT_STYLE } from "@/lib/marketplace/avatar-styles-data.js";

export { AVATAR_STYLES, DEFAULT_STYLE };
export const STYLE_KEYS = Object.keys(AVATAR_STYLES);

// Precompute a fast lookup per style: field defs + a Set of valid values per field.
const STYLE_DEFS = Object.fromEntries(
    Object.entries(AVATAR_STYLES).map(([style, def]) => [
        style,
        {
            fields: def.fields,
            byKey: Object.fromEntries(def.fields.map((f) => [f.key, { ...f, set: new Set(f.values) }])),
            default: def.default,
        },
    ])
);

export function styleKeyOf(config) {
    const s = config && typeof config === "object" ? config.style : null;
    return AVATAR_STYLES[s] ? s : DEFAULT_STYLE;
}

export function styleFields(styleKey) {
    return (STYLE_DEFS[styleKey] || STYLE_DEFS[DEFAULT_STYLE]).fields;
}

// Keep only fields valid for the config's style; fall back to that style's default for anything invalid.
export function sanitizeAvatarConfig(config) {
    const styleKey = styleKeyOf(config);
    const def = STYLE_DEFS[styleKey];
    const src = config && typeof config === "object" ? config : {};
    const out = { style: styleKey };
    for (const f of def.fields) {
        const val = src[f.key];
        const ok = (f.optional && val === "none") || def.byKey[f.key].set.has(val);
        out[f.key] = ok ? val : def.default[f.key];
    }
    return out;
}

// Config -> query string for the render route (the URL fully determines the image, so it caches forever).
export function avatarConfigToQuery(config) {
    const clean = sanitizeAvatarConfig(config);
    const params = new URLSearchParams();
    params.set("style", clean.style);
    for (const f of STYLE_DEFS[clean.style].fields) params.set(f.key, clean[f.key]);
    return params.toString();
}

// The image URL for a stored config, or null when the member has no built avatar (use photo/initials).
export function avatarUrlFor(config) {
    if (!config || typeof config !== "object" || !Object.keys(config).length) return null;
    return `/api/marketplace/avatar?${avatarConfigToQuery(config)}`;
}

// The vanilla default config (Lorelei) + the ONE shared default avatar URL for members without one.
export const DEFAULT_AVATAR = STYLE_DEFS[DEFAULT_STYLE].default;
export const DEFAULT_AVATAR_URL = `/api/marketplace/avatar?${avatarConfigToQuery(DEFAULT_AVATAR)}`;

// "variant48" -> "Style 48", "happy01" -> "Happy 01", "none" -> "None".
export function humanizeAvatarLabel(value) {
    if (value === "none") return "None";
    return String(value)
        .replace(/^variant/, "Style ")
        .replace(/([a-z])([A-Z0-9])/g, "$1 $2")
        .replace(/([0-9])([A-Za-z])/g, "$1 $2")
        .replace(/^./, (c) => c.toUpperCase())
        .trim();
}
