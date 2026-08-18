"use client";

import { useState } from "react";

import FishingWater from "@/components/FishingWater";
import { boatDeck } from "@/lib/marketplace/deck-lines.js";
import FishingScene from "@/components/FishingScene";
import { haulScale } from "@/lib/marketplace/fishing-scale.js";

// The fishing scene's phases, on buttons. Waiting for a real bite to look at the bite is not a workflow.
const PHASES = ["idle", "waiting", "tell", "bite", "hauling"];
// Scale comes from the REAL haulScale, not a number typed here — the whole point of the lab is to look at
// what the game will actually draw.
const HAULS = [
    { art: "/images/fish/fish_sardine.png", name: "Sardine", kind: "fish", lb: 0.6 },
    { art: "/images/fish/fish_kraken.png", name: "Kraken Spawn", kind: "fish", lb: 3400 },
    { art: "/images/sailing/dig-chest.png", name: "Gold Chest", kind: "treasure" },
    { art: "/images/sailing/enc/world_serpent.png", name: "The World Serpent", kind: "monster", tier: 5 },
].map((h) => ({ ...h, scale: haulScale(h) }));

// ?full=1 mounts the WHOLE fishing card at rest — the idle screen a member actually opens, so the polish
// (real scene instead of an emoji, the corrected copy, the no-bait line) can be looked at rather than assumed.
const IDLE_FISHING = {
    available: true,
    casts: { used: 1, max: 4, left: 3, bought: 0 },
    recharge: { available: false, cost: 400, bought: 0, maxPerDay: 6 },
    angling: 0, hooked: null, baits: [],
    biteWindow: { minMs: 4000, maxMs: 20000, graceMs: 12000 },
    tracks: [], totalCaught: 42, speciesKnown: 9, speciesTotal: 34, log: [],
};

export default function WaterLab() {
    const [phase, setPhase] = useState("waiting");
    const [haul, setHaul] = useState(null);
    const full = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("full") === "1";
    if (full) {
        return (
            <FishingScene
                fishing={IDLE_FISHING}
                sky="/images/sailing/sky-goldenhour.png"
                boat="/images/sailing/boat-tier5-galleon.png"
                deck={boatDeck(5)}
                hero={{ art: "/images/arena/ladder/rung-1.webp", flip: false }}
                records={null} gold={12500}
                onCast={async () => ({ ok: false })} onLand={async () => ({ ok: false })}
                onRecharge={async () => ({ ok: true })} onLoadRecords={async () => ({ ok: true })}
                onClose={() => {}}
            />
        );
    }
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
                deck={boatDeck(5)}
                hero={{ art: "/images/arena/ladder/rung-1.webp", flip: false }}
                haul={haul}
                onStrike={() => setPhase("hauling")}
            />
        </div>
    );
}
