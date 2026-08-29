"use client";

import EquipmentClient from "@/components/EquipmentClient";
import { describeStats } from "@/lib/marketplace/items.js";

// ── THE GEAR SCREEN, AGAINST FIXTURES ────────────────────────────────────────────────────────────────────────
// One weapon, one shield and one chest piece, each carrying the numbers that were added today — a weapon's own
// damage and attack speed, a shield's armour and block chance, and the rare affixes. If a stat is missing from
// a card here it is missing from the game.
const item = (o) => ({ owned: true, bound: false, enhanceLevel: 0, socket: false, gem: null,
    elements: [], sea: null, farm: null, depth: null, signature: null, setName: null,
    ...o, statsText: describeStats(o.stats) });

const ITEMS = [
    item({ id: "soulflame_sword", name: "Soulflame Sword", slot: "main_hand", rarity: "legendary",
        icon: "GiFlamedLeaf", equipped: true, enhanceLevel: 6,
        stats: { base_damage: 24, speed: 0.74, might: 12, crit_power: 20, vitality: 9, pierce: 6, lifesteal: 2 },
        forgeStats: describeStats({ base_damage: 5, might: 4, crit_power: 6 }) }),
    item({ id: "dragon_shield", name: "Dragon Shield", slot: "off_hand", rarity: "epic",
        icon: "GiDragonShield", equipped: true,
        stats: { armor: 52, block_chance: 0.2, might: 5, ferocity: 3, vitality: 12, tenacity: 2, counter: 7 } }),
    item({ id: "dragonplate", name: "Dragonplate Armor", slot: "chest", rarity: "legendary",
        icon: "GiBreastplate", equipped: false,
        stats: { armor: 146, might: 5, ferocity: 5, vitality: 16, tenacity: 3, stun: 8, haste: 5 } }),
];

const PAYLOAD = {
    items: ITEMS, pieces: [], slots: [], setBonuses: [], setsOverview: [], shop: [], gold: 12500, coupon: null,
    equipped: { main_hand: "soulflame_sword", off_hand: "dragon_shield" },
    stats: { base_damage: 29, speed: 0.74, armor: 475, block_chance: 0.2, might: 99, vitality: 82,
        ferocity: 43, tenacity: 17, crit_chance: 50, crit_power: 54, pierce: 8, lifesteal: 3,
        counter: 7, stun: 8, haste: 5 },
};

// ── STUBBED DURING RENDER, NOT IN AN EFFECT ──────────────────────────────────────────────────────────────────
// React runs CHILD effects before PARENT effects, so a stub installed in this component's useEffect arrives
// AFTER EquipmentClient has already fetched, got a signed-out answer and shut itself. It has to be in place
// before the child mounts, which means during render.
if (typeof window !== "undefined" && !window.__gearLabStub) {
    window.__gearLabStub = true;
    const real = window.fetch.bind(window);
    window.fetch = (url, opts) => {
        if (String(url).includes("/api/marketplace/inventory")) {
            return Promise.resolve(new Response(JSON.stringify(PAYLOAD), {
                status: 200, headers: { "content-type": "application/json" },
            }));
        }
        return real(url, opts);
    };
}

export default function GearLab() {
    return <EquipmentClient displayLabel="Hero" level={31} />;
}
