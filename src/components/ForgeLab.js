"use client";

import { EnhanceResultModal, FORGE_CSS } from "@/components/BlacksmithClient";

// The reveal, mounted against a fixture that looks like a real successful enhance on a weapon: the piece's own
// damage went up, two affixes went up, and one is brand new. Everything here is the shape crafting.js returns.
const RES = {
    id: "soulflame_sword", icon: "GiFlamedLeaf", name: "Soulflame Sword", rarity: "legendary",
    level: 6, grade: "perfect", xp: 120, quality: 0.92, combo: 5, score: 880, maxScore: 1000,
    hits: { pixel: 3, perfect: 2, great: 1, good: 0, miss: 0 },
    scenario: 3, allMaxed: false, doubled: false, attune: null, util: null,
    gained: "+1 Damage · +1 Might · +2 Crit Power · +1 Pierce",
    statLines: [
        { key: "base_damage", label: "Damage", icon: "⚔️", suffix: "", base: 19, forge: 5, gained: 1, isNew: false, intrinsic: true },
        { key: "speed", label: "Attack Speed", icon: "⏱️", suffix: "/s", base: 0.74, forge: 0, gained: 0, isNew: false, intrinsic: true },
        { key: "might", label: "Might", icon: "⚔️", suffix: "", base: 8, forge: 4, gained: 1, isNew: false },
        { key: "crit_power", label: "Crit Power", icon: "💥", suffix: "", base: 14, forge: 6, gained: 2, isNew: false },
        { key: "vitality", label: "Vitality", icon: "❤️", suffix: "", base: 7, forge: 2, gained: 0, isNew: false },
        { key: "pierce", label: "Pierce", icon: "🗡️", suffix: "", base: 5, forge: 1, gained: 1, isNew: false },
        { key: "lifesteal", label: "Lifedrink", icon: "🩸", suffix: "", base: 0, forge: 2, gained: 2, isNew: true },
    ],
};

export default function ForgeLab() {
    // FORGE_CSS is a plain global style tag owned by BlacksmithClient, so mounting the modal on its own
    // renders it completely unstyled. The lab has to bring the stylesheet with it.
    return (
        <>
            <style>{FORGE_CSS}</style>
            <EnhanceResultModal res={RES} onClose={() => {}} />
        </>
    );
}
