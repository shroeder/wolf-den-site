"use client";

import { useEffect, useState } from "react";

import { collectibleById } from "@/lib/marketplace/collectibles.js";

// Renders a pet's AI battle sprite (an <img>) when one exists, else falls back to the pet's react-icons
// glyph. The {petId → {url, flip}} map is fetched ONCE per page and shared across every PetArt via a
// module-level singleton (sprites are static). Mirrors <ItemArt> for gear. Pass a pet id; it looks up the
// glyph + color for the fallback itself.
let spritesPromise = null;
const listeners = new Set();
let SPRITES = null;

function ensureSprites() {
    if (SPRITES) return;
    if (!spritesPromise) {
        spritesPromise = fetch("/api/marketplace/pet-sprites")
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => { SPRITES = (j && j.sprites) || {}; listeners.forEach((fn) => fn()); })
            .catch(() => { SPRITES = {}; listeners.forEach((fn) => fn()); });
    }
}

export default function PetArt({ id, className = "", alt = "" }) {
    const [, force] = useState(0);
    useEffect(() => {
        if (SPRITES) return undefined;
        ensureSprites();
        const fn = () => force((n) => n + 1);
        listeners.add(fn);
        return () => listeners.delete(fn);
    }, []);

    const pet = id ? collectibleById(id) : null;
    const sprite = SPRITES ? SPRITES[id] : null;
    if (sprite?.url) {
        return (
            <span className={`${className} pet-art has-sprite`}>
                <img src={sprite.url} alt={alt || pet?.name || ""} className="pet-art-img" loading="lazy" style={sprite.flip ? { transform: "scaleX(-1)" } : undefined} />
            </span>
        );
    }
    if (!pet) return null;
    const Icon = pet.Icon;
    return (
        <span className={`${className} pet-art`} style={{ color: pet.color }}>
            {Icon ? <Icon aria-hidden="true" /> : "🐾"}
        </span>
    );
}
