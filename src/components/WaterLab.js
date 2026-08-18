"use client";

import { useState } from "react";

import FishingWater from "@/components/FishingWater";

// The fishing scene's phases, on buttons. Waiting for a real bite to look at the bite is not a workflow.
const PHASES = ["idle", "waiting", "bite", "hauling"];
const HAULS = [
    { art: "/images/fish/fish_kraken.png", name: "Kraken", kind: "fish" },
    { art: "/images/sailing/enc/world_serpent.png", name: "The World Serpent", kind: "monster" },
    { art: "/images/sailing/dig-chest.png", name: "Chest", kind: "treasure" },
];

export default function WaterLab() {
    const [phase, setPhase] = useState("waiting");
    const [haul, setHaul] = useState(null);
    return (
        <div style={{ padding: 12, maxWidth: 720, margin: "0 auto" }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {PHASES.map((p) => (
                    <button key={p} type="button" className="pill" onClick={() => { setPhase(p); if (p !== "hauling") setHaul(null); }}>{p}</button>
                ))}
                {HAULS.map((h) => (
                    <button key={h.name} type="button" className="pill" onClick={() => { setHaul(h); setPhase("hauling"); }}>haul: {h.name}</button>
                ))}
            </div>
            <FishingWater
                phase={phase}
                sky="/images/sailing/sky-goldenhour.png"
                boat="/images/sailing/boat-tier5-galleon.png"
                hero={{ art: "/images/arena/ladder/rung-1.webp", flip: false }}
                haul={haul}
                onStrike={() => setPhase("hauling")}
            />
        </div>
    );
}
