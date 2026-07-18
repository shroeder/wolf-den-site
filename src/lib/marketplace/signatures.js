import "server-only";

// SIGNATURE POWERS — unique named effects on marquee legendary/mythic items. Deliberately they only ever
// multiply the player's OWN output (their hit, their crit, their daily strikes) — never a % of the boss's
// max HP — so gear feels special without letting anyone nuke a boss. The combined per-hit multiplier is
// also hard-capped (see SIG_MULT_CAP) so lucky stacks stay a "big moment", not a one-shot.

export const ITEM_SIGNATURES = {
    windwalkers: { label: "Windwalker's Rush", desc: "Your first attack each day strikes for DOUBLE." },
    giants_belt: { label: "Titan's Might", desc: "Grants +2 boss attacks every day." },
    eye_eternity: { label: "Perfect Sight", desc: "Your first attack each day is a GUARANTEED critical." },
    worldender: { label: "Cataclysm", desc: "20% chance on each hit to ERUPT for double damage." },
    godsplitter: { label: "Twin Fang", desc: "Your critical hits strike TWICE." },
};

const SIG_MULT_CAP = 3; // no single hit can be boosted past 3× by signatures (crit is separate + also bounded)

const ids = (equipped) => (Array.isArray(equipped) ? equipped : Object.values(equipped || {}));

// Extra daily manual strikes from equipped signatures.
export function signatureStrikeBonus(equipped) {
    return ids(equipped).includes("giants_belt") ? 2 : 0;
}

// Whether this hit (0-based index within today) must crit because of a signature.
export function signatureForcesCrit(equipped, hitIndex = 0) {
    return ids(equipped).includes("eye_eternity") && hitIndex === 0;
}

// The signature damage multiplier for a hit + which power "fired" (for the on-hit flavor). rand is
// injectable for tests; defaults to Math.random.
export function signatureHit(equipped, { hitIndex = 0, crit = false, rand = Math.random } = {}) {
    const have = ids(equipped);
    let mult = 1;
    const fired = [];
    if (have.includes("windwalkers") && hitIndex === 0) { mult *= 2; fired.push(ITEM_SIGNATURES.windwalkers.label); }
    if (have.includes("worldender") && rand() < 0.2) { mult *= 2; fired.push("Cataclysm ERUPTS"); }
    if (have.includes("godsplitter") && crit) { mult *= 2; fired.push(ITEM_SIGNATURES.godsplitter.label); }
    mult = Math.min(mult, SIG_MULT_CAP);
    return { mult, proc: fired[0] || null };
}

// The signature attached to an item id (for display on gear cards / the reveal), or null.
export function signatureFor(itemId) {
    return ITEM_SIGNATURES[itemId] || null;
}
