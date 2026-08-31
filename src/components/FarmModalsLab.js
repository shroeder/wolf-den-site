"use client";

import { useEffect, useState } from "react";

import { GiftBoxModal, HarvestRecap, ReplantModal } from "@/components/FarmClient";

// ── THE FIXTURES ─────────────────────────────────────────────────────────────────────────────────────────────
// Shaped exactly as the server hands them over, and deliberately at the BUSY end: a sweep that turned up two
// critters, a box with both stacks AND a rare drop, a bag with more seeds than beds. A modal that holds at its
// fullest holds at its emptiest, and the empty cases are the ones that were already being drawn every day.
const RECAP = {
    harvested: 7,
    names: ["Wheat", "Carrot", "Potato", "Pumpkin", "Star Fruit", "Wheat", "Carrot"],
    gold: 1840,
    xp: 412,
    petFed: { petId: "fawn", name: "Fawn", emoji: "🦌", xp: 690, level: 3, leveled: true },
    chests: [{ tier: "iron" }],
    seeds: [{ id: "carrot" }, { id: "pumpkin" }],
    newPets: [{ id: "field_mouse", name: "Field Mouse" }],
    encounters: [
        { key: "raccoon", name: "Masked Raccoon", emoji: "🦝", sprite: null, reward: { xp: 18, gold: 210, loot: { type: "seed", label: "a Pumpkin seed", emoji: "🌱" } } },
        { key: "stag", name: "Golden Stag", emoji: "🦌", sprite: null, reward: { xp: 140, gold: 1900, loot: { type: "parts", label: "4× Gleaming Alloy", emoji: "⚙️" } } },
    ],
};

const BOX = {
    gold: 431,
    crops: { id: "pumpkin", name: "Pumpkin", emoji: "🎃", rarity: "epic", qty: 4 },
    seeds: { id: "carrot", name: "Carrot", emoji: "🥕", rarity: "common", qty: 2 },
    item: { id: "iron_helm", name: "Ironbark Helm", rarity: "rare", slot: "helmet", image: null, isNew: true },
};

// A garden mid-replant: five beds still empty, and a bag that runs out before they do — which is the state the
// "Fill ×n" cap on each row exists for.
const GARDEN = {
    plots: [
        { slot: 0, seedId: "wheat" }, { slot: 1, seedId: null }, { slot: 2, seedId: null },
        { slot: 3, seedId: null }, { slot: 4, seedId: "carrot" }, { slot: 5, seedId: null },
        { slot: 6, seedId: null }, { slot: 7, seedId: "pumpkin" },
    ],
    seedBag: [
        { id: "wheat", name: "Wheat", emoji: "🌾", rarity: "common", count: 12, xp: 14, growMin: 90 },
        { id: "carrot", name: "Carrot", emoji: "🥕", rarity: "common", count: 3, xp: 22, growMin: 240 },
        { id: "pumpkin", name: "Pumpkin", emoji: "🎃", rarity: "epic", count: 2, xp: 68, growMin: 900 },
        { id: "star_fruit", name: "Star Fruit", emoji: "⭐", rarity: "mythic", count: 1, xp: 240, growMin: 2580 },
    ],
};

const SCENES = { recap: "Harvest recap", box: "The gift box", replant: "Replant" };

export default function FarmModalsLab() {
    // Read AFTER hydration. Computed during render the server would pick the default and React would keep that
    // subtree — the same bug the kitchen lab had, where every `?scene=` but the first silently showed scene one.
    const [scene, setScene] = useState("recap");
    useEffect(() => { setScene(new URLSearchParams(window.location.search).get("scene") || "recap"); }, []);
    const noop = () => {};
    return (
        <div style={{ minHeight: "100dvh", padding: 12, background: "#0d0f13" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                {Object.entries(SCENES).map(([k, label]) => (
                    <a key={k} href={`?scene=${k}`} style={{ padding: "7px 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.2)", color: scene === k ? "#0d0f13" : "#cfd6e4", background: scene === k ? "#ffd75e" : "transparent", fontWeight: 800, fontSize: 12.5, textDecoration: "none" }}>{label}</a>
                ))}
            </div>
            {scene === "recap" ? <HarvestRecap recap={RECAP} onClose={noop} /> : null}
            {scene === "box" ? <GiftBoxModal result={BOX} onClose={noop} /> : null}
            {scene === "replant" ? <ReplantModal garden={GARDEN} busy={null} onPlantOne={noop} onFillAll={noop} onClose={noop} /> : null}
        </div>
    );
}
