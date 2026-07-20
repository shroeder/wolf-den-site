"use client";

import { useEffect, useState } from "react";

import { itemIcon } from "@/lib/marketplace/items.js";

// Renders an item's AI sprite (an <img> die-cut on transparent bg) when one exists, else falls back to the
// item's react-icons glyph. The {id → url} sprite map is fetched ONCE per page and shared across every
// ItemArt via a module-level singleton promise (sprites are static, so no re-fetch). Art is purely
// additive: until the map loads — or for any item without a sprite — the glyph shows, so nothing ever
// renders blank.
let spritesPromise = null;
const listeners = new Set();
let SPRITES = null;

function ensureSprites() {
    if (SPRITES) return;
    if (!spritesPromise) {
        spritesPromise = fetch("/api/marketplace/item-sprites")
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

export function useItemSprite(id) {
    const [, force] = useState(0);
    useEffect(() => {
        if (SPRITES) return undefined;
        ensureSprites();
        const fn = () => force((n) => n + 1);
        listeners.add(fn);
        return () => listeners.delete(fn);
    }, []);
    return SPRITES ? SPRITES[id] || null : null;
}

export default function ItemArt({ id, icon, className = "", alt = "" }) {
    const sprite = useItemSprite(id);
    // Always render the SAME styled box the glyph used (rarity backplate, border, sizing) — just swap the
    // svg glyph for the die-cut <img> so layout is identical whether or not a sprite exists yet.
    return (
        <span className={`${className} item-art${sprite ? " has-sprite" : ""}`}>
            {sprite ? <img src={sprite} alt={alt} className="item-art-img" loading="lazy" /> : (() => { const Icon = itemIcon(icon); return <Icon aria-hidden="true" />; })()}
        </span>
    );
}
