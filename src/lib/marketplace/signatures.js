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
    meteor_hammer: { label: "Impact", desc: "Your first attack each day strikes for TRIPLE.", firstHitMult: 3 },
    soulflame_sword: { label: "Soulburn", desc: "25% chance on each hit to erupt for double damage.", eruptChance: 0.25, eruptMult: 2 },
    worldshield: { label: "World's Edge", desc: "Your critical hits strike TWICE.", critMult: 2 },
    cultist_hood: { label: "Dark Ritual", desc: "Your first attack each day is a GUARANTEED critical.", firstHitCrit: true },
    deadeye_mask: { label: "Deadeye", desc: "Your critical hits strike TWICE.", critMult: 2 },
    elephant_totem: { label: "Unstoppable", desc: "20% chance on each hit to double damage.", eruptChance: 0.2, eruptMult: 2 },
    spectre_locket: { label: "Haunt", desc: "Your critical hits strike TWICE.", critMult: 2 },
    // --- Gold-shop prestige gear ---
    gs_worldedge: { label: "World's Edge", desc: "25% chance on each hit to erupt for double damage.", eruptChance: 0.25, eruptMult: 2 },
    gs_excalibur: { label: "Sword of Kings", desc: "Your first attack each day strikes for TRIPLE.", firstHitMult: 3 },
    gs_worldbreaker: { label: "Worldbreaker", desc: "Your critical hits strike TWICE.", critMult: 2 },
    gs_omnipotence_ring: { label: "Omnipotence", desc: "Your first attack each day is a GUARANTEED critical, and crits strike TWICE.", firstHitCrit: true, critMult: 2 },
    gs2_dragon_god: { label: "Dragon God", desc: "25% chance on each hit to erupt for double damage.", eruptChance: 0.25, eruptMult: 2 },
    gs2_infinity_ring: { label: "Infinity", desc: "Your first attack each day is a GUARANTEED critical, and crits strike TWICE.", firstHitCrit: true, critMult: 2 },
    // --- Back slot (capes / wings) ---
    shadow_shroud: { label: "Ambush", desc: "Your first attack each day is a GUARANTEED critical.", firstHitCrit: true },
    phoenix_mantle: { label: "Rebirth", desc: "20% chance on each hit to erupt for double damage.", eruptChance: 0.2, eruptMult: 2 },
    wings_of_dawn: { label: "Daybreak", desc: "Your first attack each day strikes for DOUBLE.", firstHitMult: 2 },
    oblivion_wings: { label: "Nightfall", desc: "Your critical hits strike TWICE.", critMult: 2 },
    celestial_cloak: { label: "Starfall", desc: "25% chance on each hit to erupt for double damage.", eruptChance: 0.25, eruptMult: 2 },
    void_shroud: { label: "Eclipse", desc: "Your first attack each day is a GUARANTEED critical, and crits strike TWICE.", firstHitCrit: true, critMult: 2 },
    // --- Signatures added to existing marquee mythics so they play differently, not just bigger ---
    starforged_mail: { label: "Stardust", desc: "20% chance on each hit to erupt for double damage.", eruptChance: 0.2, eruptMult: 2 },
    gs2_energy_blade: { label: "Overcharge", desc: "Your critical hits strike TWICE.", critMult: 2 },
    gs2_star_plate: { label: "Supernova", desc: "Your first attack each day strikes for TRIPLE.", firstHitMult: 3 },
    gs2_crown_supreme: { label: "Coronation", desc: "Your first attack each day is a GUARANTEED critical.", firstHitCrit: true },

    // ===== FULL TOP-TIER PASS — every legendary & mythic now carries a signature, so no marquee item is
    // ever "just a stat stick". Per-hit effects are bounded by SIG_MULT_CAP; extraStrikes lives only on
    // belts/boots (one of each equippable) so daily attacks stay controlled. =====
    // --- Mythics ---
    golden_crown: { label: "Midas Touch", desc: "Your first attack each day is a GUARANTEED critical.", firstHitCrit: true },
    void_orb: { label: "Singularity", desc: "Your critical hits strike TWICE.", critMult: 2 },
    ancient_halo: { label: "Sanctified", desc: "Your first attack each day strikes for TRIPLE.", firstHitMult: 3 },
    celestial_robe: { label: "Astral Veil", desc: "25% chance on each hit to erupt for double damage.", eruptChance: 0.25, eruptMult: 2 },
    cosmic_sash: { label: "Cosmic Girdle", desc: "Grants +2 boss attacks every day.", extraStrikes: 2 },
    featherfall: { label: "Weightless", desc: "Grants +1 boss attack every day.", extraStrikes: 1 },
    infinity_loop: { label: "Eternal Loop", desc: "Your first attack each day is a GUARANTEED critical, and crits strike TWICE.", firstHitCrit: true, critMult: 2 },
    eternal_aegis: { label: "Aegis Eternal", desc: "Your critical hits strike TWICE.", critMult: 2 },
    eternal_shroud: { label: "Shroud of Ages", desc: "25% chance on each hit to erupt for double damage.", eruptChance: 0.25, eruptMult: 2 },
    kings_eternal: { label: "Everking", desc: "Your first attack each day strikes for TRIPLE.", firstHitMult: 3 },
    suncrest: { label: "Solar Flare", desc: "25% chance on each hit to erupt for double damage.", eruptChance: 0.25, eruptMult: 2 },
    world_girdle: { label: "Atlas", desc: "Grants +2 boss attacks every day.", extraStrikes: 2 },
    patrons_crown: { label: "Patron's Blessing", desc: "Your first attack each day is a GUARANTEED critical.", firstHitCrit: true },
    founders_ring: { label: "Founder's Will", desc: "Your first attack each day is a GUARANTEED critical, and crits strike TWICE.", firstHitCrit: true, critMult: 2 },
    bigspender_crown: { label: "Big Spender", desc: "Your first attack each day strikes for TRIPLE.", firstHitMult: 3 },
    whale_crown: { label: "Leviathan", desc: "Your critical hits strike TWICE.", critMult: 2 },
    gs_titan_aegis: { label: "Titan's Bulwark", desc: "Your critical hits strike TWICE.", critMult: 2 },
    gs_god_helm: { label: "Divine Sight", desc: "Your first attack each day is a GUARANTEED critical.", firstHitCrit: true },
    gs_celestial_plate: { label: "Heaven's Plate", desc: "25% chance on each hit to erupt for double damage.", eruptChance: 0.25, eruptMult: 2 },
    gs_eternity_amulet: { label: "Timeless", desc: "Your first attack each day strikes for TRIPLE.", firstHitMult: 3 },
    gs_sovereign_crown: { label: "Sovereign", desc: "Your first attack each day is a GUARANTEED critical, and crits strike TWICE.", firstHitCrit: true, critMult: 2 },
    gs2_void_ward: { label: "Void Bulwark", desc: "Your critical hits strike TWICE.", critMult: 2 },
    gs2_cosmic_amulet: { label: "Cosmos", desc: "25% chance on each hit to erupt for double damage.", eruptChance: 0.25, eruptMult: 2 },
    gs2_apex_crown: { label: "Apex", desc: "Your first attack each day strikes for TRIPLE.", firstHitMult: 3 },
    // --- Legendaries ---
    dragonfang_blade: { label: "Wyrmsbane", desc: "20% chance on each hit to erupt for double damage.", eruptChance: 0.2, eruptMult: 2 },
    overlord_helm: { label: "Overlord", desc: "Your first attack each day is a GUARANTEED critical.", firstHitCrit: true },
    dragonplate: { label: "Dragonhide", desc: "20% chance on each hit to erupt for double damage.", eruptChance: 0.2, eruptMult: 2 },
    warlords_amulet: { label: "Warlord's Call", desc: "Your first attack each day strikes for DOUBLE.", firstHitMult: 2 },
    collectors_signet: { label: "Collector", desc: "Your critical hits strike TWICE.", critMult: 2 },
    soulreaver: { label: "Soul Reaver", desc: "Your critical hits strike TWICE.", critMult: 2 },
    stormcaller: { label: "Storm's Call", desc: "20% chance on each hit to erupt for double damage.", eruptChance: 0.2, eruptMult: 2 },
    aegis: { label: "Aegis", desc: "Your critical hits strike TWICE.", critMult: 2 },
    crown_of_kings: { label: "Regent", desc: "Your first attack each day is a GUARANTEED critical.", firstHitCrit: true },
    aegis_plate: { label: "Bulwark", desc: "20% chance on each hit to erupt for double damage.", eruptChance: 0.2, eruptMult: 2 },
    wolf_heart: { label: "Wolf Heart", desc: "Your first attack each day strikes for DOUBLE.", firstHitMult: 2 },
    kings_ring: { label: "King's Command", desc: "Your first attack each day is a GUARANTEED critical.", firstHitCrit: true },
    bastion_shield: { label: "Bastion", desc: "Your critical hits strike TWICE.", critMult: 2 },
    wolf_crown: { label: "Alpha Howl", desc: "Your first attack each day strikes for DOUBLE.", firstHitMult: 2 },
    ronin_kimono: { label: "Bushido", desc: "Your critical hits strike TWICE.", critMult: 2 },
    star_amulet: { label: "Starlight", desc: "Your first attack each day is a GUARANTEED critical.", firstHitCrit: true },
    bear_girdle: { label: "Bear's Endurance", desc: "Grants +1 boss attack every day.", extraStrikes: 1 },
    ring_titans: { label: "Titan Grip", desc: "Your first attack each day strikes for DOUBLE.", firstHitMult: 2 },
    spiked_wall: { label: "Retribution", desc: "20% chance on each hit to erupt for double damage.", eruptChance: 0.2, eruptMult: 2 },
    shadow_cowl: { label: "Shadowstrike", desc: "Your first attack each day is a GUARANTEED critical.", firstHitCrit: true },
    dragoncape: { label: "Wyrmscale", desc: "20% chance on each hit to erupt for double damage.", eruptChance: 0.2, eruptMult: 2 },
    titan_stompers: { label: "Earthshaker", desc: "Grants +1 boss attack every day.", extraStrikes: 1 },
    serpent_coil: { label: "Venomstrike", desc: "Your critical hits strike TWICE.", critMult: 2 },
    kings_sash: { label: "Royal Girdle", desc: "Grants +1 boss attack every day.", extraStrikes: 1 },
    warlord_ring: { label: "War Banner", desc: "Your first attack each day strikes for DOUBLE.", firstHitMult: 2 },
    runeweave_robe: { label: "Runeweave", desc: "20% chance on each hit to erupt for double damage.", eruptChance: 0.2, eruptMult: 2 },
    highroller_ring: { label: "High Roller", desc: "Your first attack each day is a GUARANTEED critical.", firstHitCrit: true },
    playmat_medallion: { label: "Home Turf", desc: "Your first attack each day strikes for DOUBLE.", firstHitMult: 2 },
    premium_signet: { label: "Prestige", desc: "Your critical hits strike TWICE.", critMult: 2 },
    premium_playmat_medallion: { label: "Grandmaster", desc: "Your first attack each day is a GUARANTEED critical.", firstHitCrit: true },
    credit25_ring: { label: "Investor", desc: "Your first attack each day strikes for DOUBLE.", firstHitMult: 2 },
    credit50_ring: { label: "Benefactor", desc: "Your critical hits strike TWICE.", critMult: 2 },
    gs_runeblade: { label: "Runebite", desc: "20% chance on each hit to erupt for double damage.", eruptChance: 0.2, eruptMult: 2 },
    gs_aegis: { label: "Wardstone", desc: "Your critical hits strike TWICE.", critMult: 2 },
    gs_warlord_crown: { label: "Conqueror", desc: "Your first attack each day is a GUARANTEED critical.", firstHitCrit: true },
    gs_dragonhide: { label: "Scaleguard", desc: "20% chance on each hit to erupt for double damage.", eruptChance: 0.2, eruptMult: 2 },
    gs_champion_amulet: { label: "Champion's Heart", desc: "Your first attack each day strikes for DOUBLE.", firstHitMult: 2 },
    gs_royal_signet: { label: "Royal Seal", desc: "Your critical hits strike TWICE.", critMult: 2 },
    gs2_rune_greatsword: { label: "Runecleave", desc: "20% chance on each hit to erupt for double damage.", eruptChance: 0.2, eruptMult: 2 },
    gs2_dragon_ward: { label: "Dragonguard", desc: "Your critical hits strike TWICE.", critMult: 2 },
    gs2_horned_crown: { label: "Dread Gaze", desc: "Your first attack each day is a GUARANTEED critical.", firstHitCrit: true },
    gs2_plate_of_kings: { label: "King's Plate", desc: "20% chance on each hit to erupt for double damage.", eruptChance: 0.2, eruptMult: 2 },
    gs2_titan_belt: { label: "Titan's Girth", desc: "Grants +1 boss attack every day.", extraStrikes: 1 },
    gs2_swift_striders: { label: "Swiftstride", desc: "Grants +1 boss attack every day.", extraStrikes: 1 },
    gs2_heart_amulet: { label: "Packheart", desc: "Your first attack each day strikes for DOUBLE.", firstHitMult: 2 },
    gs2_kings_band: { label: "Crown Jewel", desc: "Your first attack each day is a GUARANTEED critical.", firstHitCrit: true },
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
