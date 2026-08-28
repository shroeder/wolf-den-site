"use client";

import { useEffect, useState } from "react";
import Glyph from "@/components/Glyph";

// Renders a badge's AI sprite (a small <img>) when one exists, else falls back to the badge's emoji. The
// {slug → url} map is fetched ONCE per page and shared across every BadgeArt via a module-level singleton
// (sprites are static). Additive: until the map loads — or for any badge without art — the emoji shows, so a
// badge never renders blank. Sized in `em` so it matches whatever font-size its badge pill uses.
let spritesPromise = null;
const listeners = new Set();
let SPRITES = null;

function ensureSprites() {
    if (SPRITES) return;
    if (!spritesPromise) {
        spritesPromise = fetch("/api/marketplace/badge-sprites")
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => {
                SPRITES = (j && j.sprites) || {};
                listeners.forEach((fn) => fn());
            })
            .catch(() => {
                SPRITES = {};
                listeners.forEach((fn) => fn());
            });
    }
}

export function useBadgeSprite(slug) {
    const [, force] = useState(0);
    useEffect(() => {
        if (SPRITES) return undefined;
        ensureSprites();
        const fn = () => force((n) => n + 1);
        listeners.add(fn);
        return () => listeners.delete(fn);
    }, []);
    return SPRITES ? SPRITES[slug] || null : null;
}

export default function BadgeArt({ slug, icon, className = "" }) {
    const sprite = useBadgeSprite(slug);
    if (sprite) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sprite} alt="" className={`badge-art-img ${className}`} loading="lazy" style={{ height: "1.5em", width: "auto", verticalAlign: "-0.28em" }} />
        );
    }
    // The fallback glyph is usually an emoji, but three badges are ABOUT coins and the coin emoji is drawn by
    // the device's font — Apple's is a silver quarter. Those rows carry the coin art's path instead, so the
    // fallback has to be able to draw one. Glyph decides by looking at the value.
    return <Glyph value={icon} className={className} size="1.5em" />;
}
