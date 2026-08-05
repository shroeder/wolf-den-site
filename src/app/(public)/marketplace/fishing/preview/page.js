import { notFound } from "next/navigation";

import FishingHome from "@/components/FishingHome";

// ── DEV ONLY ─────────────────────────────────────────────────────────────────────────────────────────────────
// The real fishing screen needs a session, the owner gate and a live boat row, so the states that matter most
// — out of casts and able to afford a recharge, out of casts and NOT able, all recharges spent — are the ones
// you cannot conveniently reach in a browser. This renders them side by side against the real component.
// 404s unless NODE_ENV is development (allow-list, not deny-list: a preview build is not development).
export const dynamic = "force-dynamic";
export const metadata = { title: "Fishing preview", robots: { index: false, follow: false } };

// The real shape, taken from fishing.js: an ARRAY over the whole species table, each entry carrying whether
// you have caught it. Guessing an object keyed by id is what made the first version of this preview 500.
const LOG = [
    { id: "fish_anglerfish", name: "Sardine", emoji: "🐟", rarity: "common", lb: 0.5, gold: 4, odds: 6, caught: 8, best: 0.5 },
    { id: "fish_cockle", name: "Silver Perch", emoji: "🐟", rarity: "common", lb: 3, gold: 7, odds: 8, caught: 8, best: 2.8 },
    { id: "fish_coelacanth", name: "Mackerel", emoji: "🐟", rarity: "common", lb: 6, gold: 9, odds: 9, caught: 6, best: 5.5 },
    { id: "fish_crab", name: "Blue Marlin", emoji: "🐟", rarity: "legendary", lb: 400, gold: 900, odds: 0.2, caught: 0, best: null },
];

const base = (over = {}) => ({
    available: true,
    speciesKnown: 18, speciesTotal: 34, totalCaught: 63,
    casts: { used: 10, max: 10, left: 0, bought: 0 },
    recharge: { available: true, cost: 100, bought: 0, maxPerDay: 6 },
    log: LOG,
    ...over,
});

const CASES = [
    ["Casts remaining", base({ casts: { used: 3, max: 10, left: 7, bought: 0 }, recharge: { available: false, cost: 100, bought: 0, maxPerDay: 6 } }), 5000],
    ["Out of casts · can afford", base(), 5000],
    ["Out of casts · too poor", base({ recharge: { available: true, cost: 3200, bought: 5, maxPerDay: 6 } }), 400],
    ["Out of casts · all bought", base({ recharge: { available: false, cost: 6400, bought: 6, maxPerDay: 6 } }), 5000],
];

export default function FishingPreviewPage() {
    if (process.env.NODE_ENV !== "development") notFound();
    return (
        <div style={{ display: "grid", gap: 22, padding: 12 }}>
            {CASES.map(([label, fishing, gold]) => (
                <div key={label}>
                    <p style={{ margin: "0 0 6px", font: "900 11px/1 system-ui", letterSpacing: ".14em", textTransform: "uppercase", color: "#ffd75e" }}>
                        {label} · 🪙 {gold.toLocaleString()}
                    </p>
                    <FishingHome fishing={fishing} gold={gold} status="docked" />
                </div>
            ))}
        </div>
    );
}
