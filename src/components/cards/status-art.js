// ── ONE PICTURE PER MARK, AND ONE PLACE THAT KNOWS WHERE THEY LIVE ───────────────────────────────────────
// The board, the creature note and the guide all draw the same fifteen emblems. Keyed by the RULES' own field
// name (unit.vulnerable, beat.summon) so a screen never has to translate, and paired with the word the
// keyword glossary answers to — see KEYWORD_TEXT — so tapping one can always open its note.
//
// `word` is null for the three that are not keywords: attack, summon and status are things a creature DOES,
// not marks it carries, and there is no glossary entry to open for them.
export const STATUS_ART = {
    strength: { src: "/images/cards/status/strength.png", label: "Strength", word: "Strength" },
    dexterity: { src: "/images/cards/status/dexterity.png", label: "Dexterity", word: "Dexterity" },
    block: { src: "/images/cards/status/block.png", label: "Block", word: "Block" },
    regen: { src: "/images/cards/status/regen.png", label: "Regeneration", word: "Regeneration" },
    artifact: { src: "/images/cards/status/artifact.png", label: "Artifact", word: "Artifact" },
    intangible: { src: "/images/cards/status/intangible.png", label: "Intangible", word: "Intangible" },
    vulnerable: { src: "/images/cards/status/vulnerable.png", label: "Vulnerable", word: "Vulnerable" },
    weak: { src: "/images/cards/status/weak.png", label: "Weak", word: "Weak" },
    frail: { src: "/images/cards/status/frail.png", label: "Frail", word: "Frail" },
    poison: { src: "/images/cards/status/poison.png", label: "Poison", word: "Poison" },
    curse: { src: "/images/cards/status/curse.png", label: "Curse", word: "Curse" },
    heal: { src: "/images/cards/status/heal.png", label: "Healing", word: null },
    attack: { src: "/images/cards/status/attack.png", label: "Attack", word: null },
    // ⚠️ THE LAST TWO EXIST BECAUSE THE INTENT PILL COULD NOT DRAW THEM, and three creatures open a fight
    // with one. The act-one boss's first move shuffles junk into your deck and the pill had no mark for it,
    // so its opening turn rendered EMPTY and Luke read it as "turn 1 the boss does nothing".
    status: { src: "/images/cards/status/status.png", label: "Junk into your deck", word: null },
    summon: { src: "/images/cards/status/summon.png", label: "Calls in more", word: null },
};

/** The marks a fighter is carrying right now, in a fixed order so the row never reshuffles under a thumb. */
export const MARK_ORDER = [
    "strength", "dexterity", "block", "artifact", "regen", "intangible",
    "vulnerable", "weak", "frail", "poison",
];

export const marksOn = (unit = {}) =>
    MARK_ORDER.filter((k) => (Number(unit[k]) || 0) > 0).map((k) => ({ key: k, n: Number(unit[k]) || 0, ...STATUS_ART[k] }));
