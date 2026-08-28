// ── ARENA UPGRADE TRACKS ─────────────────────────────────────────────────────────────────────────────────────
// Pure. Gold-bought tracks in exactly the shape the boat, dig and rail tracks use, so the screen can render
// them with the same card, the same level pips, the same now → next line and the same CoinCta.
//
// These are deliberately NOT the skill tree. The tree is a BUILD — a choice with an opportunity cost, bought
// with a currency you cannot farm. These are the flat, boring, always-good numbers you buy with gold, the
// same way every other feature in the Den lets you spend gold on a slow grind. Keeping them apart is what
// stops the tree from turning into "spend gold to win": no amount of gold buys a skill point.
export const ARENA_UPGRADES = [
    {
        id: "conditioning", name: "Conditioning", icon: "/images/arena/track/conditioning.webp", max: 20, base: 240, stat: "health", per: 30,
        desc: "Ring fitness. More health to spend before somebody takes it off you.",
        unit: (v) => `+${Math.round(v)} health`,
    },
    {
        // stat renamed block -> dr alongside the tree node of the same name. Purchased ranks are stored by
        // TRACK ID, not by stat, so every level anyone has bought carries over untouched.
        id: "footwork", name: "Footwork", icon: "/images/arena/track/footwork.webp", max: 20, base: 260, stat: "dr", per: 0.006,
        desc: "Reading a swing early. Less of every blow gets through.",
        unit: (v) => `+${(v * 100).toFixed(1)}% damage reduction`,
    },
    {
        id: "edge", name: "Whetstone", icon: "/images/arena/track/edge.webp", max: 20, base: 280, stat: "might", per: 0.8,
        desc: "A sharper edge on everything you bring into the ring.",
        unit: (v) => `+${v.toFixed(1)} might`,
    },
    {
        // ⚠️ THIS TRACK SOLD A STAT THE GAME DOES NOT READ. It granted `accuracy`, and accuracy is referenced
        // in exactly two functions — throwBlows and counterBlow — both simulator-only with no caller in the
        // game. The ring never rolls to hit. Twenty members had bought 63 levels of it for 70,800 gold, JT
        // alone 21,000, and every one of those levels did nothing.
        //
        // Repointed rather than removed, and the id is kept, so every level already paid for starts working
        // instead of needing a refund. PIERCE is live (resolveSwing reads it through drFrom on every blow) and
        // it fits what the card always promised: a blade that goes where you send it now goes THROUGH what
        // they are wearing. 2 points a level against PIERCE_PER_POINT 0.005 is 12% at max — the same
        // magnitude as Footwork's 12% damage reduction, so it sits level with its siblings rather than
        // becoming the obvious buy.
        id: "aim", name: "Steady Hand", icon: "/images/arena/track/instinct.webp", max: 12, base: 300, stat: "pierce", per: 2,
        desc: "A blade that goes where you send it — straight through what they are wearing.",
        unit: (v) => `+${(v * 0.5).toFixed(1)}% of their armour ignored`,
    },
    {
        id: "instinct", name: "Instinct", icon: "/images/arena/track/instinct.webp", max: 15, base: 340, stat: "crit", per: 0.006,
        desc: "Finding the seam. Raises the chance a blow lands critical.",
        unit: (v) => `+${(v * 100).toFixed(1)}% crit`,
    },
    {
        id: "stamina", name: "Stamina", icon: "/images/arena/track/stamina.webp", max: 5, base: 900, stat: "fights", per: 1,
        desc: "One more challenge in you each day.",
        unit: (v) => `+${Math.round(v)} challenge${v === 1 ? "" : "s"}/day`,
    },
    {
        id: "renown", name: "Renown", icon: "/images/arena/track/renown.webp", max: 15, base: 300, stat: "laurels", per: 0.04,
        desc: "A name worth watching. Every bout pays more laurels.",
        unit: (v) => `+${(v * 100).toFixed(0)}% laurels`,
    },
];

// Same escalating shape the other tracks use: cost grows with the square of the level, so early ranks are
// cheap enough to feel generous and the last ones are a real commitment.
export const upgradeCost = (def, level = 0) => Math.round(def.base * (level + 1) * (level + 1) * 0.5);

export const upgradeById = (id) => ARENA_UPGRADES.find((u) => u.id === id) || null;

/** The whole track list for a member, in the shape the shared upgrade card renders. */
export function upgradeView(ups = {}) {
    return ARENA_UPGRADES.map((u) => {
        const level = Number(ups[u.id]) || 0;
        const maxed = level >= u.max;
        return {
            id: u.id, name: u.name, icon: u.icon, desc: u.desc,
            level, max: u.max, maxed,
            cost: maxed ? 0 : upgradeCost(u, level),
            now: u.unit(u.per * level),
            next: u.unit(u.per * (level + 1)),
        };
    });
}

/** Flat effects from the tracks, merged with the tree's the same way. */
export function upgradeEffects(ups = {}) {
    const out = {};
    for (const u of ARENA_UPGRADES) {
        const level = Number(ups[u.id]) || 0;
        if (level > 0) out[u.stat] = (out[u.stat] || 0) + u.per * level;
    }
    return out;
}
