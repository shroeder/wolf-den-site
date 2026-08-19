"use client";

import { useState } from "react";

import CompendiumClient from "@/components/CompendiumClient";
import JewellerClient from "@/components/JewellerClient";
import SetsClient from "@/components/SetsClient";
import CollectionPanel from "@/components/CollectionPanel";
import InspectableGear from "@/components/InspectableGear";
import PetsClient from "@/components/PetsClient";
import EquipmentClient from "@/components/EquipmentClient";
import ChestOpener from "@/components/ChestOpener";
import MiningMinigame from "@/components/MiningMinigame";

// The six surfaces that only exist behind a signed-in fetch. The payloads come off the real server functions
// (see the page), so what is on screen is a real member's real gear — the answer to "does what somebody
// actually owns read correctly", which a fixture cannot give.
//
// STUBBED DURING RENDER, NOT IN AN EFFECT. React runs CHILD effects before PARENT effects, so a stub installed
// in this component's useEffect arrives after the child has already fetched, taken a signed-out answer and
// shut itself.
let PAYLOADS = null;
if (typeof window !== "undefined" && !window.__itemLabStub) {
    window.__itemLabStub = true;
    const real = window.fetch.bind(window);
    const json = (body) => Promise.resolve(new Response(JSON.stringify(body), {
        status: 200, headers: { "content-type": "application/json" } }));
    window.fetch = (url, opts) => {
        const u = String(url);
        const p = PAYLOADS || {};
        if (u.includes("/api/marketplace/inventory")) return json(p.inventory || {});
        if (u.includes("/api/marketplace/compendium")) return json(p.compendium || {});
        if (u.includes("/api/marketplace/jeweller")) return json(p.jeweller || {});
        if (u.includes("/api/marketplace/pets")) return json(p.pets || {});
        if (u.includes("/api/marketplace/sets")) return json({ ok: true });
        if (u.includes("/api/marketplace/chests")) {
            const post = (opts?.method || "GET").toUpperCase() === "POST";
            const chests = [{ tier: "legendary", count: 3, color: "#ffb52e", label: "Legendary chest" }];
            return json(post ? { item: CHEST_ITEM, chests } : { chests });
        }
        return real(url, opts);
    };
}

// The three reveals. A chest, a seam and the sea floor all print the same one-line stat string, and all three
// are behind an animation you cannot reach by loading a URL — the chest wants a tap and a second and a half,
// the seam wants a swing. Their payloads are callbacks and a fetch, both of which a lab can answer.
const CHEST_ITEM = { id: "godsplitter", name: "Godsplitter", icon: "GiBroadsword", slot: "main_hand",
    rarity: "mythic", stats: { base_damage: 31, speed: 0.83, might: 12, crit_chance: 8, crit_power: 11,
        vitality: 9, pierce: 6, stun: 8, haste: 5 } };
const CRACKED = { rank: "Rich seam", rankColor: "#8fe3ff", parts: [], tier: 4,
    bonus: { kind: "gear", id: "eternal_timeless_orb", name: "Timeless Orb", icon: "GiCrystalShine",
        rarity: "eternal", stats: { armor: 354, block_chance: 0.44, vitality: 26, tenacity: 7, pierce: 7, counter: 9 } } };

const TABS = ["gear", "inspect", "compendium", "jeweller", "sets", "collections", "pets", "chest", "mine"];

export default function ItemLab({ who, equipped, bag, sets, inventory, compendium, jeweller, pets }) {
    PAYLOADS = { inventory, compendium, jeweller, pets };
    const [tab, setTab] = useState("gear");


    return (
        <main style={{ background: "#0d0c0b", minHeight: "100vh", padding: "10px 10px 60px" }}>
            <p style={{ font: "800 .72rem/1.3 system-ui", letterSpacing: ".08em", textTransform: "uppercase", color: "#ffb347", margin: "0 0 8px" }}>
                Item Lab · {who}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                {TABS.map((t) => (
                    <button key={t} type="button" onClick={() => setTab(t)} data-tab={t}
                        style={{ font: "800 .72rem system-ui", padding: "6px 11px", borderRadius: 999, cursor: "pointer",
                            border: "1px solid " + (tab === t ? "#ffb347" : "#3a3630"),
                            background: tab === t ? "#ffb347" : "#191713", color: tab === t ? "#1a1206" : "#c9c0b2" }}>
                        {t}
                    </button>
                ))}
            </div>
            {tab === "gear" ? <EquipmentClient displayLabel={who} level={60} /> : null}
            {tab === "inspect" ? <InspectableGear equipped={equipped} inventory={bag} /> : null}
            {tab === "compendium" ? <CompendiumClient /> : null}
            {tab === "jeweller" ? <JewellerClient initial={jeweller} /> : null}
            {tab === "sets" ? <SetsClient sets={sets} /> : null}
            {tab === "collections" ? <CollectionPanel sets={(sets || []).filter((s) => s.collection)} /> : null}
            {tab === "pets" ? <PetsClient /> : null}
            {tab === "chest" ? <ChestOpener /> : null}
            {tab === "mine" ? (
                <MiningMinigame
                    node={{ name: "Deep Cobalt Seam", art: "/images/mining/seam-cobalt.png", color: "#8fe3ff",
                        partTier: 4, pct: 100, mySwings: 0, widen: 0.4 }}
                    pick={{ name: "Runed Pick", tier: 4 }}
                    onSwing={async () => ({ ok: true, grade: "perfect", gradeLabel: "PERFECT", damage: 980, combo: 1, hits: 1, score: 980, pct: 0, quality: 3, cracked: CRACKED })}
                    onDone={() => {}}
                />
            ) : null}
        </main>
    );
}
