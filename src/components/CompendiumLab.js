"use client";

import { useEffect, useState } from "react";

import CompendiumClient from "@/components/CompendiumClient";
import { RARITIES } from "@/lib/marketplace/rarity.js";

// ── THE COMPENDIUM LAB ───────────────────────────────────────────────────────────────────────────────────────
// The real CompendiumClient against fixture data, with window.fetch stubbed for its one endpoint — the same
// arrangement ArenaLab uses, and for the same reason: the screen is a WALL, and a wall's problems (ragged
// rows, tiles of unequal height, a tier that reads as the wrong colour) only appear at full population. You
// cannot judge it from a component in isolation and you cannot get to the real one without an account, a
// login and somebody else's collection.
//
// Dev only. See the page that mounts it.

const SLOTS = ["main_hand", "off_hand", "helmet", "chest", "belt", "boots", "back", "amulet", "ring"];
const NAMES = [
    "Ashfall Cleaver", "Tidecaller", "Gravewalker's Shroud", "Emberheart", "The Long Watch", "Rimeguard",
    "Hollow Crown", "Sunder", "Wolfsbane", "Deepcurrent Band", "Ironwood Bulwark", "Nightsoil Wraps",
    "The Purser's Ledger", "Stormcallers", "Bone Lantern", "Saltbitten Mail",
];

// A believable collection: nearly all the commons, almost none of the top tiers. That gradient is the thing
// the tier bars have to make legible.
const HAVE_RATE = { common: 0.92, rare: 0.74, epic: 0.5, legendary: 0.3, mythic: 0.14, ascendant: 0.08, eternal: 0.04, celestial: 0, primordial: 0 };

function fixture() {
    const items = [];
    let n = 0;
    for (const rarity of RARITIES) {
        const count = rarity === "common" ? 22 : rarity === "rare" ? 20 : rarity === "primordial" ? 4 : 12;
        for (let i = 0; i < count; i += 1) {
            n += 1;
            // Deterministic, so two runs of the lab are comparable pictures.
            const collected = ((i * 37) % 100) / 100 < (HAVE_RATE[rarity] ?? 0.2);
            items.push({
                id: `fx_${n}`,
                name: `${NAMES[n % NAMES.length]}${i > NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : ""}`,
                slot: SLOTS[n % SLOTS.length],
                rarity,
                art: null,             // no sprite: exercises the .cmp-tile-none placeholder path
                stats: { might: 4 + (n % 30), fortune: n % 7 },
                reqLevel: 1 + (n % 40),
                flavor: "Pulled off the seabed with the rope still on it.",
                collected,
            });
        }
    }
    const count = items.filter((i) => i.collected).length;
    return {
        items, count, total: items.length,
        milestones: [25, 50, 100, 150].map((at) => ({ at, label: `+${at / 5} Might`, reached: count >= at })),
        bonus: { might: 12, fortune: 3 },
        next: { at: 150, toGo: Math.max(0, 150 - count), label: "+30 Might" },
    };
}

export default function CompendiumLab() {
    const [ready, setReady] = useState(false);
    useEffect(() => {
        const real = window.fetch;
        const data = fixture();
        window.fetch = async (url, opts) => {
            if (String(url).includes("/api/marketplace/compendium")) {
                return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
            }
            return real(url, opts);
        };
        setReady(true);
        return () => { window.fetch = real; };
    }, []);
    if (!ready) return null;   // mounting the client before the stub is installed races the real endpoint
    return <CompendiumClient />;
}
