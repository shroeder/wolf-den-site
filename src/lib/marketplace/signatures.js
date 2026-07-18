import "server-only";

// SIGNATURE POWERS — unique named effects on marquee legendary/mythic items. Deliberately they only ever
// multiply the player's OWN output (their hit, their crit, their daily strikes) — never a % of the boss's
// max HP — so gear feels special without letting anyone nuke a boss. The combined per-hit multiplier is
// also hard-capped (see SIG_MULT_CAP) so lucky stacks stay a "big moment", not a one-shot.
//
// Each signature is data-driven: it declares its effect via optional params, and the hooks below read them
// generically, so adding a signature is just a catalog entry (no new combat code):
//   firstHitMult  — the day's FIRST manual strike is multiplied by N
//   firstHitCrit  — the day's first strike is a guaranteed critical
//   critMult      — critical hits are multiplied by N (crit "strikes twice", etc.)
//   eruptChance/eruptMult — each hit has a % chance to erupt for ×mult (default ×2)
//   extraStrikes  — grants +N manual boss attacks per day

export const ITEM_SIGNATURES = {
    // --- Originals ---
    windwalkers: { label: "Windwalker's Rush", desc: "Your first attack each day strikes for DOUBLE.", firstHitMult: 2 },
    giants_belt: { label: "Titan's Might", desc: "Grants +2 boss attacks every day.", extraStrikes: 2 },
    eye_eternity: { label: "Perfect Sight", desc: "Your first attack each day is a GUARANTEED critical.", firstHitCrit: true },
    worldender: { label: "Cataclysm", desc: "20% chance on each hit to ERUPT for double damage.", eruptChance: 0.2, eruptMult: 2 },
    godsplitter: { label: "Twin Fang", desc: "Your critical hits strike TWICE.", critMult: 2 },
    // --- Expansion signatures (marquee legendaries + mythics) ---
    heavens_trident: { label: "Tempest", desc: "Your first attack each day strikes for TRIPLE.", firstHitMult: 3 },
    storm_katana: { label: "Chain Lightning", desc: "25% chance on each hit to arc for double damage.", eruptChance: 0.25, eruptMult: 2 },
    reapers_scythe: { label: "Grim Harvest", desc: "Your critical hits strike TWICE.", critMult: 2 },
    executioner_axe: { label: "Decapitate", desc: "20% chance on each hit to erupt for double damage.", eruptChance: 0.2, eruptMult: 2 },
    tidebreaker: { label: "Tidal Surge", desc: "Your first attack each day is a GUARANTEED critical.", firstHitCrit: true },
    worldflame_maul: { label: "Meltdown", desc: "25% chance on each hit to erupt for double damage.", eruptChance: 0.25, eruptMult: 2 },
    void_maelstrom: { label: "Event Horizon", desc: "Your critical hits strike TWICE.", critMult: 2 },
    oracle_diadem: { label: "Foresight", desc: "Your first attack each day is a GUARANTEED critical.", firstHitCrit: true },
    archmage_visage: { label: "Arcane Overload", desc: "Your critical hits strike TWICE.", critMult: 2 },
    dragonheart_sigil: { label: "Dragon's Fury", desc: "Your critical hits strike TWICE.", critMult: 2 },
    galaxy_pendant: { label: "Cosmic Fortune", desc: "Your first attack each day is a GUARANTEED critical.", firstHitCrit: true },
    wolf_totem: { label: "Pack Tactics", desc: "20% chance on each hit to double damage.", eruptChance: 0.2, eruptMult: 2 },
    bear_fang: { label: "Maul", desc: "Your critical hits strike TWICE.", critMult: 2 },
    colossus_belt: { label: "Colossal Might", desc: "Grants +2 boss attacks every day.", extraStrikes: 2 },
    thunderstride: { label: "Thunderstep", desc: "Grants +1 boss attack every day.", extraStrikes: 1 },
    voidwalkers: { label: "Voidstep", desc: "Grants +1 boss attack, and your first strike each day doubles.", extraStrikes: 1, firstHitMult: 2 },
    eternity_band: { label: "Endless", desc: "25% chance on each hit to erupt for double damage.", eruptChance: 0.25, eruptMult: 2 },
};

const SIG_MULT_CAP = 3; // no single hit can be boosted past 3× by signatures (crit is separate + also bounded)

const ids = (equipped) => (Array.isArray(equipped) ? equipped : Object.values(equipped || {}));
const sigsOn = (equipped) => ids(equipped).map((id) => ITEM_SIGNATURES[id]).filter(Boolean);

// Extra daily manual strikes from equipped signatures (summed).
export function signatureStrikeBonus(equipped) {
    return sigsOn(equipped).reduce((n, s) => n + (s.extraStrikes || 0), 0);
}

// Whether this hit (0-based index within today) must crit because of a signature.
export function signatureForcesCrit(equipped, hitIndex = 0) {
    return hitIndex === 0 && sigsOn(equipped).some((s) => s.firstHitCrit);
}

// The signature damage multiplier for a hit + which power "fired" (for the on-hit flavor). rand is
// injectable for tests; defaults to Math.random. Combined multiplier is hard-capped at SIG_MULT_CAP.
export function signatureHit(equipped, { hitIndex = 0, crit = false, rand = Math.random } = {}) {
    let mult = 1;
    const fired = [];
    for (const s of sigsOn(equipped)) {
        if (s.firstHitMult && hitIndex === 0) { mult *= s.firstHitMult; fired.push(s.label); }
        if (s.eruptChance && rand() < s.eruptChance) { mult *= (s.eruptMult || 2); fired.push(`${s.label} ERUPTS`); }
        if (s.critMult && crit) { mult *= s.critMult; fired.push(s.label); }
    }
    mult = Math.min(mult, SIG_MULT_CAP);
    return { mult, proc: fired[0] || null };
}

// The signature attached to an item id (for display on gear cards / the reveal), or null.
export function signatureFor(itemId) {
    return ITEM_SIGNATURES[itemId] || null;
}
