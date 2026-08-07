"use client";

import { ELEMENTS } from "@/lib/marketplace/boss-weakness.js";

// ── THE MINI ELEMENT MARKER ──────────────────────────────────────────────────────────────────────────────────
// Asked for in global chat: "mini elemental markers on our gear icons so we can tell what element a piece is
// just from the overview without having to click into each piece." Before this the element existed only as a
// text chip on the slot picker and the detail sheet — so the bag, the Forge, the auction house and a public
// profile all showed you a wall of gear with no way to tell a fire piece from a shadow one without opening
// every single one. Against a boss with a rotating weakness that is the single stat you most want to scan for.
//
// The marker is our own drawn SPRITE (scripts/gen-element-sprites.mjs), not the element's emoji and not an
// icon-font glyph. ELEMENTS carries an emoji for chat and log lines, where the OS is already doing the drawing;
// on our own surfaces the art is ours. Six distinct silhouettes — flame, droplet, leaf, bolt, sunburst,
// crescent — so the six stay apart by SHAPE at 14px and for a colourblind player, not by colour alone.
const SPRITE = {
    fire: "/images/elements/fire.png",
    water: "/images/elements/water.png",
    earth: "/images/elements/earth.png",
    storm: "/images/elements/storm.png",
    light: "/images/elements/light.png",
    shadow: "/images/elements/shadow.png",
};

/** Accepts either ["fire"] or the server's [{ key, label, color }] — both shapes reach the UI today. */
function normalize(elements) {
    if (!Array.isArray(elements)) return [];
    const out = [];
    for (const e of elements) {
        const key = typeof e === "string" ? e : e?.key;
        if (ELEMENTS[key] && !out.some((o) => o.key === key)) out.push(ELEMENTS[key]);
    }
    return out;
}

/**
 * A corner cluster of element markers, sized in `em` so it scales with whatever glyph box it lands in — a
 * 46px bag tile and a 76px forge card both get a marker in proportion rather than one fixed pixel size that
 * is too big on one and invisible on the other.
 *
 * Renders NOTHING for a neutral item (about one in five), which is the correct answer: an "unaligned" badge on
 * a fifth of everything you own is noise, and the absence of a marker already reads as no affinity.
 *
 * A piece can carry up to six elements after enchant scrolls, and six sprites would bury the art they sit on —
 * so two show and the rest become a count.
 */
export default function ElementPip({ elements, max = 2, className = "" }) {
    const els = normalize(elements);
    if (!els.length) return null;
    const shown = els.slice(0, max);
    const extra = els.length - shown.length;
    const title = `${els.map((e) => e.label).join(" + ")} affinity — bonus damage against a boss weak to ${els.length > 1 ? "either" : "it"}`;
    return (
        <span className={`el-pips ${className}`} title={title} aria-label={title}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {shown.map((e) => <img key={e.key} className="el-pip" src={SPRITE[e.key]} alt="" loading="lazy" draggable="false" />)}
            {extra > 0 ? <span className="el-pip-more">+{extra}</span> : null}
        </span>
    );
}
