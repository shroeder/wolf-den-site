// ── COLLECTION PIECES ────────────────────────────────────────────────────────────────────────────────────────
// The forty trophies that make up the eight non-combat sets: Corsair, Harvester, Forager, Wheelwarden, Delver,
// Rockbreaker, Blacksmith's Regalia and Founder.
//
// WHY THEY LIVE HERE AND NOT IN items.js.
// They used to be ITEMS that ten different call sites had to remember to filter out — equip, sell, salvage (both
// the action and the list), the auction's sellable list and its create path, trade's browse/create/accept, and
// the random drop pools. `isCollectionItem` was the filter, and the rule only held as long as every author
// remembered it. One of the ten forgot, and the Forge spent months offering a Forgeplate as scrap that the
// server then refused. That is not a bug you fix, it is a bug you keep fixing.
//
// A piece is not gear and never was. It cannot be worn, sold, traded or salvaged; it pays its bonus for being
// OWNED. So it does not carry the fields that only mean something for gear — no slot, no combat stats, no
// reqLevel. What it does carry is its set, its rarity and its affinity affix, because those are the things a
// collection actually does.
//
// The point of the move: a piece id no longer resolves through itemById, so there is nothing left to forget.
// The guards are gone because the category error is impossible.
//
// `source` is how you EARN it, not what it is — chest, xp_shop, wheel_bonus, mining or forge.

export const COLLECTION_PIECES = [
    { id: "heavens_trident", set: "corsair", name: "Heaven's Trident", rarity: "mythic", icon: "GiTrident", flavor: "Forged for a god of storms.", sea: { plunder: 8 }, source: "chest", sort: 206 },
    { id: "orb_of_tides", set: "corsair", name: "Orb of Tides", rarity: "epic", icon: "GiFloatingCrystal", flavor: "The sea answers it.", sea: { dredge: 5 }, source: "chest", sort: 412 },
    { id: "girded_plate", set: "corsair", name: "Girded Plate", rarity: "epic", icon: "GiBeltArmor", flavor: "Cinch the armor down.", sea: { trove: 5 }, depth: { nerve: 4 }, source: "chest", sort: 362 },
    { id: "merchants_cape", set: "corsair", name: "Merchant's Cape", rarity: "rare", icon: "GiWingCloak", flavor: "Lined with lucky coin.", sea: { tailwind: 4 }, source: "xp_shop", xpCost: 1400, sort: 820 },
    { id: "fortune_signet", set: "corsair", name: "Signet of Fortune", rarity: "epic", icon: "GiRingedBeam", flavor: "The house always wins.", sea: { bounty: 6 }, depth: { crucible: 4 }, source: "chest", sort: 272 },
    { id: "harvesters_hat", set: "harvester", name: "Harvester's Sun Hat", rarity: "rare", icon: "GiFarmer", flavor: "Wide brim, wider yield — the sun works for you now.", farm: { growSpeed: 4 }, source: "xp_shop", xpCost: 700, sort: 930 },
    { id: "reapers_girdle", set: "harvester", name: "Reaper's Girdle", rarity: "rare", icon: "GiRolledCloth", flavor: "A sheaf-binder's belt, hung with twine and a whetstone.", farm: { goldHarvest: 6 }, source: "xp_shop", xpCost: 800, sort: 931 },
    { id: "sheafbound_cloak", set: "harvester", name: "Sheafbound Cloak", rarity: "epic", icon: "GiCape", flavor: "Woven from the last golden stalks of autumn.", farm: { harvestLuck: 5 }, source: "xp_shop", xpCost: 2200, sort: 932 },
    { id: "amber_grain_pendant", set: "harvester", name: "Amber Grain Pendant", rarity: "epic", icon: "GiAmberMosquito", flavor: "A single wheat-berry, sealed in honey-gold amber.", farm: { goldHarvest: 7 }, source: "xp_shop", xpCost: 2400, sort: 933 },
    { id: "foragers_basket", set: "forager", name: "Forager's Basket", rarity: "rare", icon: "GiBasket", flavor: "Never comes home empty — there's always one more seed.", farm: { seedLuck: 5 }, source: "xp_shop", xpCost: 750, sort: 934 },
    { id: "clover_signet", set: "forager", name: "Clover Signet", rarity: "rare", icon: "GiClover", flavor: "A pressed four-leaf clover set under glass.", farm: { seedLuck: 5 }, source: "xp_shop", xpCost: 850, sort: 935 },
    { id: "deep_seed_pouch", set: "forager", name: "Deep Seed Pouch", rarity: "epic", icon: "GiSwapBag", flavor: "Bottomless — the good soil's secrets travel with you.", farm: { growSpeed: 5 }, source: "xp_shop", xpCost: 2100, sort: 936 },
    { id: "foxglove_charm", set: "forager", name: "Foxglove Charm", rarity: "epic", icon: "GiThreeLeaves", flavor: "Wildflower magic, carried close to the heart.", farm: { harvestLuck: 5 }, source: "xp_shop", xpCost: 2300, sort: 937 },
    { id: "wg_helm", set: "wheelwarden", name: "Dire Wolf Helm", rarity: "rare", icon: "GiWolfHead", flavor: "Won from the wheel — the pack marches with you.", source: "wheel_bonus", sort: 970 },
    { id: "wg_shield", set: "wheelwarden", name: "Wolfcrest Aegis", rarity: "rare", icon: "GiShield", flavor: "Fortune favors the guarded.", source: "wheel_bonus", sort: 972 },
    { id: "wg_ring", set: "wheelwarden", name: "Ironclaw Band", rarity: "rare", icon: "GiClaws", flavor: "A clawed circlet, wheel-forged.", source: "wheel_bonus", sort: 975 },
    { id: "wg_cloak", set: "wheelwarden", name: "Nightprowler Cloak", rarity: "rare", icon: "GiCape", flavor: "Slips through the dark like a rumor.", source: "wheel_bonus", sort: 973 },
    { id: "wg_amulet", set: "wheelwarden", name: "Wolf-Fang Amulet", rarity: "rare", icon: "GiFangs", flavor: "Still warm from the wheel's glow.", source: "wheel_bonus", sort: 974 },
    { id: "wg_blade", set: "wheelwarden", name: "Fanged Saber", rarity: "rare", icon: "GiSaber", flavor: "A lucky pull with a keen edge.", source: "wheel_bonus", sort: 971 },
    { id: "wg_chest", set: "wheelwarden", name: "Wolfhide Cuirass", rarity: "rare", icon: "GiChestArmor", flavor: "Supple hide, steel where it counts.", source: "wheel_bonus", sort: 976 },
    { id: "wg_belt", set: "wheelwarden", name: "Fangbite Belt", rarity: "rare", icon: "GiBelt", flavor: "Buckled with a snarling wolf.", source: "wheel_bonus", sort: 977 },
    { id: "wg_boots", set: "wheelwarden", name: "Prowler Boots", rarity: "rare", icon: "GiLeatherBoot", flavor: "Quiet on any trail.", source: "wheel_bonus", sort: 978 },
    { id: "wg_axe", set: "wheelwarden", name: "Moonhowl Axe", rarity: "rare", icon: "GiBattleAxe", flavor: "It hums under a full moon.", source: "wheel_bonus", sort: 979 },
    { id: "dv_lamp_helm", set: "delver", name: "Deeplamp Helm", rarity: "rare", icon: "GiMiningHelmet", flavor: "The flame gutters when the air goes bad. Listen to it.", depth: { nerve: 4 }, source: "mining", sort: 980 },
    { id: "dv_rope_belt", set: "delver", name: "Knotted Descent Belt", rarity: "rare", icon: "GiRope", flavor: "Forty feet of rope and every knot tied twice.", depth: { nerve: 4 }, source: "mining", sort: 981 },
    { id: "dv_lodestone", set: "delver", name: "Lodestone Pendant", rarity: "epic", icon: "GiCompass", flavor: "It pulls toward the richest rock. Follow it, not your gut.", depth: { lodesense: 5 }, source: "mining", sort: 982 },
    { id: "dv_shoring_pack", set: "delver", name: "Shoring Pack", rarity: "epic", icon: "GiBackpack", flavor: "Timber, wedges, and the discipline to stop and use them.", depth: { nerve: 5, lodesense: 3 }, source: "mining", sort: 983 },
    { id: "rb_maul", set: "rockbreaker", name: "Rockbreaker's Maul", rarity: "epic", icon: "GiWarPick", flavor: "Not a weapon. It has simply never been told that.", depth: { hew: 6 }, source: "mining", sort: 984 },
    { id: "rb_gauntlet", set: "rockbreaker", name: "Hewer's Gauntlets", rarity: "rare", icon: "GiGauntlet", flavor: "Leather worn to the shape of a haft.", depth: { hew: 4 }, source: "mining", sort: 985 },
    { id: "rb_assay_ring", set: "rockbreaker", name: "Assayer's Ring", rarity: "epic", icon: "GiRingedBeam", flavor: "Rubbed on the stone, it tells you what you're standing in.", depth: { prospect: 5 }, source: "mining", sort: 986 },
    { id: "rb_hobnails", set: "rockbreaker", name: "Hobnailed Treads", rarity: "rare", icon: "GiLeatherBoot", flavor: "Iron studs bite the scree so you don't.", depth: { prospect: 3, hew: 2 }, source: "mining", sort: 987 },
    { id: "regalia_visor", set: "regalia", name: "Smith's Visor", rarity: "epic", icon: "GiVisoredHelm", flavor: "Soot-blackened, its slit glows with hearthlight.", source: "forge", sort: 950 },
    { id: "regalia_plate", set: "regalia", name: "Forgeplate", rarity: "epic", icon: "GiBreastplate", flavor: "Hammered from a hundred salvaged blades.", source: "forge", sort: 951 },
    { id: "regalia_girdle", set: "regalia", name: "Ember Girdle", rarity: "epic", icon: "GiBelt", flavor: "Warm to the touch, always.", source: "forge", sort: 952 },
    { id: "regalia_boots", set: "regalia", name: "Cinderstride Boots", rarity: "epic", icon: "GiLeatherBoot", flavor: "Leave faintly glowing footprints on cold stone.", source: "forge", sort: 953 },
    { id: "regalia_cloak", set: "regalia", name: "Bellows Cloak", rarity: "epic", icon: "GiCape", flavor: "Billows like a forge fire catching air.", source: "forge", sort: 954 },
    { id: "fd_apron", set: "founder", name: "Founder's Scale Apron", rarity: "epic", icon: "GiLeatherVest", flavor: "Scarred by forty years of sparks and not one burn through.", depth: { bellows: 5 }, source: "mining", sort: 988 },
    { id: "fd_tongs", set: "founder", name: "Long Crucible Tongs", rarity: "epic", icon: "GiTongs", flavor: "Long enough to keep your eyebrows.", depth: { crucible: 5 }, source: "mining", sort: 989 },
    { id: "fd_bellows_charm", set: "founder", name: "Bellows Charm", rarity: "rare", icon: "GiWindHole", flavor: "A scrap of the old forge's leather, kept for luck.", depth: { bellows: 4 }, source: "mining", sort: 990 },
    { id: "fd_slagsifter", set: "founder", name: "Slagsifter's Ring", rarity: "rare", icon: "GiRing", flavor: "Everyone else throws the clinker out.", depth: { crucible: 4 }, source: "mining", sort: 991 },
];

export const PIECE_IDS = COLLECTION_PIECES.map((p) => p.id);
const BY_ID = new Map(COLLECTION_PIECES.map((p) => [p.id, p]));
export const pieceById = (id) => BY_ID.get(String(id || "")) || null;
export const isPieceId = (id) => BY_ID.has(String(id || ""));
export const piecesOfSet = (setId) => COLLECTION_PIECES.filter((p) => p.set === setId);

// The affinity a set of OWNED pieces contributes. Mirrors sumItemSea / sumItemFarm / sumItemDepth in items.js,
// but over pieces — an owned piece's affix applies without being worn, which is the whole contract.
const sumAffix = (ids, key) => {
    const out = {};
    for (const id of ids || []) {
        const block = pieceById(id)?.[key];
        if (!block) continue;
        for (const [k, v] of Object.entries(block)) out[k] = (out[k] || 0) + v;
    }
    return out;
};
export const sumPieceSea = (ids) => sumAffix(ids, "sea");
export const sumPieceFarm = (ids) => sumAffix(ids, "farm");
export const sumPieceDepth = (ids) => sumAffix(ids, "depth");
