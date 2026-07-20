"use client";

import { useEffect, useState } from "react";

// Renders a consumable's AI sprite (an <img>) when one exists, else falls back to its emoji. The
// {id → url} map is fetched ONCE per page and shared via a module-level singleton (sprites are static).
// Mirrors <ItemArt>/<PetArt>.
let spritesPromise = null;
const listeners = new Set();
let SPRITES = null;

function ensureSprites() {
    if (SPRITES) return;
    if (!spritesPromise) {
        spritesPromise = fetch("/api/marketplace/consumable-sprites")
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => { SPRITES = (j && j.sprites) || {}; listeners.forEach((fn) => fn()); })
            .catch(() => { SPRITES = {}; listeners.forEach((fn) => fn()); });
    }
}

export default function ConsumableArt({ id, emoji = "✨", className = "", alt = "" }) {
    const [, force] = useState(0);
    useEffect(() => {
        if (SPRITES) return undefined;
        ensureSprites();
        const fn = () => force((n) => n + 1);
        listeners.add(fn);
        return () => listeners.delete(fn);
    }, []);

    const url = SPRITES ? SPRITES[id] : null;
    if (url) {
        return <span className={`${className} con-art`}><img src={url} alt={alt} className="con-art-img" loading="lazy" /></span>;
    }
    return <span className={className} aria-hidden="true">{emoji}</span>;
}
