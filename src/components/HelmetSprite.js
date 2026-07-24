"use client";

import { useItemSprite } from "@/components/ItemArt";

// The Warplate Helm die-cut sprite — the shared "Gear Sets" icon (nav + hub tile). Falls back to a helmet
// emoji until the sprite map loads, so it never renders blank.
export default function HelmetSprite({ size = 18 }) {
    const sprite = useItemSprite("warplate_helm");
    if (sprite) return <img src={sprite} alt="" width={size} height={size} style={{ width: size, height: size, objectFit: "contain", verticalAlign: "middle" }} />;
    return <span aria-hidden="true">🪖</span>;
}
