import "server-only";

import { itemById } from "@/lib/marketplace/items.js";

// SIGNATURE POWERS — unique named effects on marquee legendary/mythic/elite gear. Historically these were
// all variations of "crit twice / erupt / first-hit double", which made most items feel identical. This
// catalog spans real ARCHETYPES so gear defines a playstyle, not just a bigger number:
//   • Damage procs   — first-hit, erupt, crit (the classics, kept for variety)
//   • Conditional    — opportunist (low-HP boss), giantSlayer (high-HP boss), bloodlust (attack streak),
//                      packTactics (how many allies attacked today)
//   • Burst          — overcharge (every 5th hit nukes), highroller (coin-flip swing)  [mythic+ only]
//   • Reward/utility — xpOnHit (Scholar), goldOnHit (Prospector), ticketOnCrit (Lucky Strike)
//   • Synergy        — beastbond (boosts your equipped pet's strike), warbanner (buffs the WHOLE server) [myth+]
//
// RAILS: magnitudes auto-scale by the item's rarity (legendary→eternal), and the swingy/generative effects
// (overcharge, highroller, warbanner) are gated to the top 3 tiers. Per-hit output is bounded by SIG_MULT_CAP
// (always-on procs) and BURST_CAP (overcharge/highroller), so a lucky spike is a moment, never a one-shot.

const RANK = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4, ascendant: 5, eternal: 6 };
const rankOf = (id) => RANK[itemById(id)?.rarity] ?? 3;
const tierIdx = (id) => Math.max(0, Math.min(3, rankOf(id) - 3)); // 0=legendary … 3=eternal
const isTop3 = (id) => rankOf(id) >= 4; // mythic+

// Per-mechanic magnitude by tier index [legendary, mythic, ascendant, eternal].
const MAG = {
    opportunist: [0.4, 0.55, 0.7, 0.85], // + damage while boss ≤25% HP
    giantSlayer: [0.3, 0.4, 0.5, 0.6], //  + damage vs colossal (high-HP) bosses
    streakCap: [0.3, 0.4, 0.45, 0.5], //   bloodlust cap
    packCap: [0.15, 0.2, 0.22, 0.25], //   pack-tactics cap
    overcharge: [3, 4, 4.5, 5], //         every-5th-hit nuke ×mult (mythic+ meaningful)
    xpOnHit: [3, 5, 7, 10], //             flat XP per boss attack
    goldOnHit: [30, 50, 70, 100], //       gold per Prospector proc
    warbanner: [0.06, 0.08, 0.12, 0.15], // global damage aura (mythic+ meaningful)
    beastbond: [1.5, 1.75, 2.0, 2.25], //  equipped-pet strike-power multiplier
};
// LOGIN procs — "merchant"/utility items that roll a chance for a reward at the daily check-in (not combat).
// Generative, so chance + value scale with rarity and they're gated to legendary+ (petGamble is self-costing
// — it destroys the item — so it's allowed anywhere).
const LOGIN = {
    goldChance: [0.15, 0.2, 0.25, 0.3],
    goldAmt: [120, 180, 260, 360],
    potionChance: [0.1, 0.14, 0.18, 0.22],
    couponChance: [0.08, 0.1, 0.13, 0.16],
    gambleChance: [0.03, 0.05, 0.07, 0.1],
};
export const COUPON_PCT = 50; //   discount a login coupon grants
export const COUPON_MAX = 4000; // it only applies to shop items at/under this gold price
// CHEER procs — bonuses that roll when the wearer CHEERS a hero in the boss fight (see cheer() in boss.js).
// firstStrike + fragment only fire on your FIRST cheer of the day; fragment (a Sailing treasure-chest piece)
// is the rarest and gated to elite gear by where it's attached.
const CHEER = {
    gold: [8, 12, 16, 22], //          flat bonus gold per cheer
    xp: [4, 6, 8, 12], //              flat bonus XP per cheer
    petXpChance: [0.3, 0.4, 0.5, 0.65], // chance to feed the equipped pet
    petXpAmt: [4, 6, 8, 12],
    firstStrike: [45, 70, 100, 140], // damage YOU deal on your first cheer of the day
    fragmentChance: [0.03, 0.05, 0.07, 0.1], // first cheer of the day only
};

const STREAK_PER = 0.04; // per consecutive attack-day
const PACK_PER = 0.02; //   per distinct ally who attacked today
const GOLD_CHANCE = 0.12;
const GIANT_HP = 5_000_000; // "colossal" boss threshold for giantSlayer
const OVERCHARGE_EVERY = 5;
const SIG_MULT_CAP = 3; // always-on procs combine up to ×3
const BURST_CAP = 5; //    overcharge/highroller burst up to ×5 on top

const mag = (key, id) => MAG[key][tierIdx(id)];
const pct = (f) => `${Math.round(f * 100)}%`;

// ── The catalog. Each entry: { label, <one or more effect flags/params> }. Magnitudes for the flag-based
// mechanics are derived from the item's rarity at read time (see hooks below). ────────────────────────────
export const ITEM_SIGNATURES = {
    // ===== Legendary / Mythic weapons (main_hand) — aggressive, high variety =====
    worldender: { label: "Cataclysm", overcharge: true }, // mythic
    godsplitter: { label: "Godsplitter", giantSlayer: true }, // mythic
    heavens_trident: { label: "Tempest", highroller: true }, // mythic
    storm_katana: { label: "Chain Lightning", eruptChance: 0.25, eruptMult: 2 }, // legendary
    reapers_scythe: { label: "Grim Harvest", opportunist: true }, // legendary — reaper = finisher
    executioner_axe: { label: "Decapitate", opportunist: true }, // legendary
    tidebreaker: { label: "Tidal Surge", bloodlust: true }, // legendary
    worldflame_maul: { label: "Meltdown", overcharge: true }, // mythic
    meteor_hammer: { label: "Impact", giantSlayer: true }, // mythic
    soulflame_sword: { label: "Soulburn", eruptChance: 0.25, eruptMult: 2 }, // legendary
    dragonfang_blade: { label: "Wyrmsbane", giantSlayer: true }, // legendary — slays dragons
    soulreaver: { label: "Soul Reaver", opportunist: true }, // legendary
    stormcaller: { label: "Storm's Call", eruptChance: 0.22, eruptMult: 2 }, // legendary
    gs_worldedge: { label: "World's Edge", highroller: true }, // mythic
    gs_excalibur: { label: "Sword of Kings", firstHitMult: 3 }, // mythic — kept classic
    gs_worldbreaker: { label: "Worldbreaker", giantSlayer: true }, // mythic
    gs2_dragon_god: { label: "Dragon God", overcharge: true }, // mythic
    gs2_energy_blade: { label: "Overcharge", overcharge: true }, // mythic
    gs2_rune_greatsword: { label: "Runecleave", eruptChance: 0.2, eruptMult: 2 }, // legendary
    gs_runeblade: { label: "Runebite", ticketOnCrit: true }, // legendary — luck

    // ===== Off-hands / shields — SUPPORT & defense identity (no more "shield that crits twice") =====
    void_maelstrom: { label: "Event Horizon", warbanner: true }, // mythic
    worldshield: { label: "Rally Standard", warbanner: true }, // mythic — the pack banner
    eternal_aegis: { label: "Aegis Eternal", warbanner: true }, // mythic
    gs_titan_aegis: { label: "Titan's Bulwark", packTactics: true }, // mythic
    gs2_void_ward: { label: "Void Bulwark", packTactics: true }, // mythic
    void_orb: { label: "Singularity", beastbond: true }, // mythic
    aegis: { label: "Aegis", packTactics: true }, // legendary
    bastion_shield: { label: "Bastion", packTactics: true }, // legendary
    aegis_plate: { label: "Bulwark", goldOnHit: true }, // legendary — off_hand? (chest actually) handled by slot theme
    spiked_wall: { label: "Retribution", opportunist: true }, // legendary off_hand
    gs_aegis: { label: "Wardstone", packTactics: true }, // legendary
    gs2_dragon_ward: { label: "Dragonguard", opportunist: true }, // legendary — differentiated from the other shield!

    // ===== Helmets — sight / mind: guaranteed first crit, scholar, foresight =====
    eye_eternity: { label: "Perfect Sight", firstHitCrit: true }, // mythic
    oracle_diadem: { label: "Foresight", firstHitCrit: true }, // mythic
    archmage_visage: { label: "Arcane Overload", xpOnHit: true }, // mythic — scholar
    deadeye_mask: { label: "Deadeye", ticketOnCrit: true }, // mythic — luck
    cultist_hood: { label: "Dark Ritual", xpOnHit: true }, // legendary — scholar
    gs2_crown_supreme: { label: "Coronation", firstHitCrit: true }, // mythic
    golden_crown: { label: "Midas Touch", goldOnHit: true }, // mythic — gold
    ancient_halo: { label: "Sanctified", xpOnHit: true }, // mythic
    patrons_crown: { label: "Patron's Blessing", firstHitCrit: true }, // mythic
    bigspender_crown: { label: "Big Spender", creditBonus: 0.09 }, // mythic — +9% coins on store-credit buys
    whale_crown: { label: "Leviathan", giantSlayer: true }, // mythic
    gs_god_helm: { label: "Divine Sight", firstHitCrit: true }, // mythic
    gs_sovereign_crown: { label: "Sovereign", warbanner: true }, // mythic — rally the realm
    gs2_apex_crown: { label: "Apex", firstHitMult: 3 }, // mythic
    overlord_helm: { label: "Overlord", firstHitCrit: true }, // legendary
    crown_of_kings: { label: "Regent", packTactics: true }, // legendary
    wolf_crown: { label: "Alpha Howl", packTactics: true }, // legendary
    shadow_cowl: { label: "Shadowstrike", firstHitCrit: true }, // legendary
    gs_warlord_crown: { label: "Conqueror", packTactics: true }, // legendary
    gs2_horned_crown: { label: "Dread Gaze", opportunist: true }, // legendary

    // ===== Chest — endurance / scaling: bloodlust, giant slayer, pack =====
    starforged_mail: { label: "Stardust", bloodlust: true }, // mythic
    gs2_star_plate: { label: "Supernova", overcharge: true }, // mythic
    celestial_robe: { label: "Astral Veil", xpOnHit: true }, // mythic
    eternal_shroud: { label: "Shroud of Ages", bloodlust: true }, // mythic
    gs_celestial_plate: { label: "Heaven's Plate", packTactics: true }, // mythic
    dragonplate: { label: "Dragonhide", giantSlayer: true }, // legendary
    ronin_kimono: { label: "Bushido", bloodlust: true }, // legendary
    dragoncape: { label: "Wyrmscale", giantSlayer: true }, // legendary (chest)
    runeweave_robe: { label: "Runeweave", xpOnHit: true }, // legendary — scholar
    gs_dragonhide: { label: "Scaleguard", giantSlayer: true }, // legendary
    gs2_plate_of_kings: { label: "King's Plate", packTactics: true }, // legendary

    // ===== Belts — the STRIKE slot (kept) + a couple of giants =====
    giants_belt: { label: "Titan's Might", extraStrikes: 2 }, // legendary
    colossus_belt: { label: "Colossal Might", extraStrikes: 2 }, // mythic
    cosmic_sash: { label: "Cosmic Girdle", extraStrikes: 2 }, // mythic
    world_girdle: { label: "Atlas", giantSlayer: true }, // mythic
    bear_girdle: { label: "Bear's Endurance", extraStrikes: 1 }, // legendary
    kings_sash: { label: "Royal Girdle", extraStrikes: 1 }, // legendary
    gs2_titan_belt: { label: "Titan's Girth", extraStrikes: 1 }, // legendary

    // ===== Boots — speed / first-move / extra strikes =====
    windwalkers: { label: "Windwalker's Rush", firstHitMult: 2 }, // legendary
    thunderstride: { label: "Thunderstep", extraStrikes: 1 }, // legendary
    voidwalkers: { label: "Voidstep", extraStrikes: 1, firstHitMult: 2 }, // mythic
    featherfall: { label: "Weightless", extraStrikes: 1 }, // mythic
    titan_stompers: { label: "Earthshaker", giantSlayer: true }, // legendary
    gs2_swift_striders: { label: "Swiftstride", extraStrikes: 1 }, // legendary

    // ===== Back (capes / wings) — scholar / prospector / opener / streak =====
    shadow_shroud: { label: "Ambush", firstHitCrit: true }, // epic
    phoenix_mantle: { label: "Rebirth", bloodlust: true }, // legendary — rises over time
    wings_of_dawn: { label: "Daybreak", firstHitMult: 2 }, // legendary
    oblivion_wings: { label: "Nightfall", xpOnHit: true, cheerXp: true }, // mythic — scholar (XP on hits + on cheers)
    celestial_cloak: { label: "Starfall", goldOnHit: true }, // legendary — prospector
    void_shroud: { label: "Eclipse", bloodlust: true }, // mythic

    // ===== Amulets — fortune / arcane / synergy =====
    dragonheart_sigil: { label: "Dragon's Fury", beastbond: true }, // mythic — heart = pet bond
    galaxy_pendant: { label: "Cosmic Fortune", loginGold: true, cheerGold: true }, // mythic — daily gold on check-in + bonus gold on cheers
    wolf_totem: { label: "Pack Tactics", packTactics: true }, // legendary — finally literal!
    bear_fang: { label: "Maul", beastbond: true, cheerPetXp: true }, // legendary — pet bond (strike boost + pet XP on cheers)
    spectre_locket: { label: "Haunt", ticketOnCrit: true }, // mythic
    suncrest: { label: "Solar Flare", overcharge: true }, // mythic
    gs_eternity_amulet: { label: "Timeless", bloodlust: true }, // mythic
    gs2_cosmic_amulet: { label: "Cosmos", warbanner: true }, // mythic
    elephant_totem: { label: "Unstoppable", giantSlayer: true }, // legendary
    warlords_amulet: { label: "Warlord's Call", packTactics: true, cheerFirstStrike: true }, // legendary — rally leader (first cheer of the day also strikes)
    wolf_heart: { label: "Wolf Heart", beastbond: true, cheerPetXp: true }, // legendary — pet bond (strike boost + pet XP on cheers)
    star_amulet: { label: "Starlight", ticketOnCrit: true }, // legendary
    serpent_coil: { label: "Venomstrike", beastbond: true }, // legendary
    gs_champion_amulet: { label: "Champion's Heart", packTactics: true }, // legendary
    gs2_heart_amulet: { label: "Packheart", beastbond: true }, // legendary
    playmat_medallion: { label: "Home Turf", loginCoupon: true }, // legendary — chance at a shop coupon
    premium_playmat_medallion: { label: "Grandmaster", loginCoupon: true }, // legendary — chance at a shop coupon

    // ===== Rings — luck / prospector / prestige / bursts =====
    eternity_band: { label: "Endless", bloodlust: true }, // mythic
    gs_omnipotence_ring: { label: "Omnipotence", firstHitCrit: true, critMult: 2 }, // mythic (prestige combo)
    gs2_infinity_ring: { label: "Infinity", highroller: true }, // mythic
    infinity_loop: { label: "Eternal Loop", bloodlust: true }, // mythic
    kings_eternal: { label: "Everking", warbanner: true, cheerFirstStrike: true }, // mythic — rally leader (first cheer of the day also strikes)
    founders_ring: { label: "Founder's Will", warbanner: true }, // mythic
    collectors_signet: { label: "Collector", loginPetGamble: true }, // legendary — gamble a pet (destroys the item)
    kings_ring: { label: "King's Command", packTactics: true }, // legendary
    ring_titans: { label: "Titan Grip", giantSlayer: true }, // legendary
    warlord_ring: { label: "War Banner", packTactics: true }, // legendary
    highroller_ring: { label: "High Roller", dailySpin: true }, // legendary — a guaranteed extra wheel spin each day
    premium_signet: { label: "Prestige", loginPotion: true, cheerXp: true }, // legendary — daily gift consumable + bonus XP on cheers
    credit25_ring: { label: "Investor", creditBonus: 0.03 }, // legendary — +3% coins on store-credit buys
    credit50_ring: { label: "Benefactor", creditBonus: 0.06 }, // legendary — +6% coins on store-credit buys
    gs_royal_signet: { label: "Royal Seal", goldOnHit: true }, // legendary
    gs2_kings_band: { label: "Crown Jewel", ticketOnCrit: true }, // legendary

    // ===== ELITE (Ascendant / Eternal) — the strongest signatures in the game =====
    ascendant_crown: { label: "Ascension", warbanner: true, cheerFragment: true }, // ascendant — rare fragment chance on first cheer of the day
    ascendant_blade: { label: "Worldrender", overcharge: true }, // ascendant
    ascendant_aegis: { label: "Unbreakable", warbanner: true }, // ascendant
    eternal_wolf_crown: { label: "Apex Predator", opportunist: true, firstHitCrit: true, cheerFragment: true }, // eternal — rare fragment chance on first cheer of the day
    eternal_infinity: { label: "Infinite", overcharge: true, extraStrikes: 1 }, // eternal
};

const ids = (equipped) => (Array.isArray(equipped) ? equipped : Object.values(equipped || {}));
const sigsOn = (equipped) => ids(equipped).map((id) => (ITEM_SIGNATURES[id] ? { id, ...ITEM_SIGNATURES[id] } : null)).filter(Boolean);

// Extra daily manual strikes from equipped signatures (summed).
export function signatureStrikeBonus(equipped) {
    return sigsOn(equipped).reduce((n, s) => n + (s.extraStrikes || 0), 0);
}

// Whether this hit must crit because of a signature (first-hit-crit on the day's first strike).
export function signatureForcesCrit(equipped, hitIndex = 0) {
    return hitIndex === 0 && sigsOn(equipped).some((s) => s.firstHitCrit);
}

// The signature damage multiplier for a hit. ctx carries the fight state the conditional/streak procs need.
// Returns { mult, proc } where proc is a short flavor label for the first effect that fired.
export function signatureHit(equipped, ctx = {}) {
    const { hitIndex = 0, crit = false, bossHpFrac = 1, bossMaxHp = 0, streakDays = 0, hittersToday = 1, rand = Math.random } = ctx;
    let mult = 1; // always-on / conditional procs (capped at SIG_MULT_CAP)
    let burst = 1; // overcharge / highroller (capped at BURST_CAP)
    const fired = [];
    for (const s of sigsOn(equipped)) {
        const i = tierIdx(s.id);
        if (s.firstHitMult && hitIndex === 0) { mult *= s.firstHitMult; fired.push(s.label); }
        if (s.eruptChance && rand() < s.eruptChance) { mult *= s.eruptMult || 2; fired.push(`${s.label} ERUPTS`); }
        if (s.critMult && crit) { mult *= s.critMult; fired.push(s.label); }
        if (s.opportunist && bossHpFrac <= 0.25) { mult *= 1 + MAG.opportunist[i]; fired.push(`${s.label} — EXECUTE`); }
        if (s.giantSlayer && bossMaxHp >= GIANT_HP) { mult *= 1 + MAG.giantSlayer[i]; fired.push(s.label); }
        if (s.bloodlust) { const b = Math.min(MAG.streakCap[i], STREAK_PER * Math.max(0, streakDays)); if (b > 0) { mult *= 1 + b; fired.push(`${s.label} ×${streakDays}d`); } }
        if (s.packTactics) { const b = Math.min(MAG.packCap[i], PACK_PER * Math.max(0, hittersToday - 1)); if (b > 0) { mult *= 1 + b; fired.push(s.label); } }
        // Bursts — gated to mythic+ (below that the flag is inert).
        if (s.overcharge && isTop3(s.id) && (hitIndex + 1) % OVERCHARGE_EVERY === 0) { burst *= MAG.overcharge[i]; fired.push(`${s.label} — OVERCHARGE!`); }
        if (s.highroller && isTop3(s.id)) { const win = rand() < 0.5; burst *= win ? 3 : 0.5; if (win) fired.push(`${s.label} — JACKPOT!`); }
    }
    const combined = Math.min(mult, SIG_MULT_CAP) * Math.min(burst, BURST_CAP);
    return { mult: combined, proc: fired[0] || null };
}

// Rewards granted on a hit that AREN'T damage: Scholar XP, Prospector gold, Lucky-Strike bonus tickets
// (delivered as bonus damage = ticket_divisor, so it flows through the existing damage→ticket pipeline).
export function signatureOnHit(equipped, { crit = false, divisor = 100, rand = Math.random } = {}) {
    let xp = 0;
    let gold = 0;
    let bonusDamage = 0;
    for (const s of sigsOn(equipped)) {
        const i = tierIdx(s.id);
        if (s.xpOnHit) xp += MAG.xpOnHit[i];
        if (s.goldOnHit && rand() < GOLD_CHANCE) gold += MAG.goldOnHit[i];
        if (s.ticketOnCrit && crit) bonusDamage += Math.max(1, Math.round(divisor));
    }
    return { xp, gold, bonusDamage };
}

// Roll every equipped LOGIN-proc item once (at the daily check-in). Returns the procs that FIRED — the
// caller (daily-checkin) applies the grants (gold / consumable / pet-gamble that destroys the item / coupon).
export function rollLoginProcs(equipped, rand = Math.random) {
    const fired = [];
    for (const s of sigsOn(equipped)) {
        const i = tierIdx(s.id);
        if (s.loginGold && rand() < LOGIN.goldChance[i]) fired.push({ id: s.id, label: s.label, kind: "gold", amount: LOGIN.goldAmt[i] });
        if (s.loginPotion && rand() < LOGIN.potionChance[i]) fired.push({ id: s.id, label: s.label, kind: "potion" });
        if (s.loginCoupon && rand() < LOGIN.couponChance[i]) fired.push({ id: s.id, label: s.label, kind: "coupon" });
        if (s.loginPetGamble && rand() < LOGIN.gambleChance[i]) fired.push({ id: s.id, label: s.label, kind: "petGamble" });
        if (s.dailySpin) fired.push({ id: s.id, label: s.label, kind: "spinToken", amount: 1 }); // guaranteed, not a chance
    }
    return fired;
}

// Roll every equipped CHEER-proc item when the wearer cheers a hero in the boss fight. Returns the aggregate
// bonuses; the caller (cheer() in boss.js) applies the grants. `firstOfDay` gates the once-a-day procs.
export function rollCheerProcs(equipped, { firstOfDay = false, rand = Math.random } = {}) {
    let gold = 0, xp = 0, petXp = 0, selfDamage = 0, fragment = false;
    const fired = [];
    for (const s of sigsOn(equipped)) {
        const i = tierIdx(s.id);
        if (s.cheerGold) { gold += CHEER.gold[i]; fired.push(s.label); }
        if (s.cheerXp) { xp += CHEER.xp[i]; fired.push(s.label); }
        if (s.cheerPetXp && rand() < CHEER.petXpChance[i]) { petXp += CHEER.petXpAmt[i]; fired.push(s.label); }
        if (firstOfDay && s.cheerFirstStrike) { selfDamage += CHEER.firstStrike[i]; fired.push(s.label); }
        if (firstOfDay && s.cheerFragment && rand() < CHEER.fragmentChance[i]) { fragment = true; fired.push(s.label); }
    }
    return { gold, xp, petXp, selfDamage, fragment, fired };
}

// Equipped-pet strike multiplier from a Beastbond signature (1 if none).
export function beastbondMult(equipped) {
    let m = 1;
    for (const s of sigsOn(equipped)) if (s.beastbond) m *= MAG.beastbond[tierIdx(s.id)];
    return m;
}

// This member's contribution to the global Warbanner aura (summed across the pack by boss.js).
export function warbannerContribution(equipped) {
    let a = 0;
    for (const s of sigsOn(equipped)) if (s.warbanner && isTop3(s.id)) a += MAG.warbanner[tierIdx(s.id)];
    return a;
}

// The warbanner bonus for a single item id (for boss.js's pack aggregation from raw item ids).
export function warbannerBonusForItem(itemId) {
    const s = ITEM_SIGNATURES[itemId];
    return s?.warbanner && isTop3(itemId) ? MAG.warbanner[tierIdx(itemId)] : 0;
}

// Human-readable description for an item's signature, with rarity-appropriate numbers. Used on gear cards.
export function signatureFor(itemId) {
    const s = ITEM_SIGNATURES[itemId];
    if (!s) return null;
    const i = tierIdx(itemId);
    const parts = [];
    if (s.firstHitMult) parts.push(`Your first daily strike hits for ${s.firstHitMult >= 3 ? "TRIPLE" : "DOUBLE"}.`);
    if (s.firstHitCrit) parts.push("Your first daily strike is a GUARANTEED critical.");
    if (s.critMult) parts.push("Your critical hits strike TWICE.");
    if (s.eruptChance) parts.push(`${pct(s.eruptChance)} chance on each hit to erupt for ${s.eruptMult >= 3 ? "TRIPLE" : "double"} damage.`);
    if (s.extraStrikes) parts.push(`Grants +${s.extraStrikes} extra manual daily strike${s.extraStrikes > 1 ? "s" : ""}.`);
    if (s.opportunist) parts.push(`+${pct(MAG.opportunist[i])} damage while the boss is under 25% HP.`);
    if (s.giantSlayer) parts.push(`+${pct(MAG.giantSlayer[i])} damage against colossal (high-HP) bosses.`);
    if (s.bloodlust) parts.push(`+${pct(STREAK_PER)} strike damage for each day you strike in a row, up to +${pct(MAG.streakCap[i])}.`);
    if (s.packTactics) parts.push(`+${pct(PACK_PER)} strike damage for every ally who struck the boss today, up to +${pct(MAG.packCap[i])}.`);
    if (s.overcharge && isTop3(itemId)) parts.push(`Every ${OVERCHARGE_EVERY}th hit unleashes a ×${MAG.overcharge[i]} OVERCHARGE.`);
    if (s.highroller && isTop3(itemId)) parts.push("Each hit is a gamble: ×3 damage or ×0.5.");
    if (s.xpOnHit) parts.push(`Earn +${MAG.xpOnHit[i]} XP on every manual strike.`);
    if (s.goldOnHit) parts.push(`${pct(GOLD_CHANCE)} chance on each hit to unearth ${MAG.goldOnHit[i]} gold.`);
    if (s.ticketOnCrit) parts.push("Your critical hits earn a bonus raffle ticket.");
    if (s.beastbond) parts.push(`Your equipped pet's strike power is boosted ×${MAG.beastbond[i]}.`);
    if (s.warbanner && isTop3(itemId)) parts.push(`Buffs EVERY member's boss damage by +${pct(MAG.warbanner[i])} (stacks across the server, capped).`);
    // Login procs — fire at the daily check-in.
    if (s.loginGold) parts.push(`${pct(LOGIN.goldChance[i])} chance at your daily check-in to find ${LOGIN.goldAmt[i]} gold.`);
    if (s.loginPotion) parts.push(`${pct(LOGIN.potionChance[i])} chance at your daily check-in to conjure a random potion.`);
    if (s.loginCoupon) parts.push(`${pct(LOGIN.couponChance[i])} chance at your daily check-in for a ${COUPON_PCT}%-off shop coupon (items ≤ ${COUPON_MAX} gold).`);
    if (s.loginPetGamble) parts.push(`${pct(LOGIN.gambleChance[i])} chance at your daily check-in to unlock a random pet — but the item is DESTROYED.`);
    if (s.dailySpin) parts.push("Grants +1 daily wheel spin at your check-in.");
    // Cheer procs — fire when you cheer a hero in the boss fight.
    if (s.cheerGold) parts.push(`Earn +${CHEER.gold[i]} bonus gold every time you cheer.`);
    if (s.cheerXp) parts.push(`Earn +${CHEER.xp[i]} bonus XP every time you cheer.`);
    if (s.cheerPetXp) parts.push(`${pct(CHEER.petXpChance[i])} chance when you cheer to feed your equipped pet ${CHEER.petXpAmt[i]} XP.`);
    if (s.cheerFirstStrike) parts.push(`Your FIRST cheer each day also strikes the boss for ${CHEER.firstStrike[i]}.`);
    if (s.cheerFragment) parts.push(`${pct(CHEER.fragmentChance[i])} chance on your first cheer each day to unearth a treasure-chest fragment.`);
    if (s.creditBonus) parts.push(`+${pct(s.creditBonus)} bonus coins whenever you buy store credit.`);
    return { label: s.label, desc: parts.join(" ") };
}

// Total GUARANTEED bonus fraction on store-credit purchases from equipped "credit" gear — additive across
// every equipped piece (e.g. Investor +10% + Big Spender +25% = +35%). Read at purchase time.
export function creditPurchaseBonus(equipped) {
    let b = 0;
    for (const s of sigsOn(equipped)) if (s.creditBonus) b += s.creditBonus;
    return b;
}
