// ── THE GROVE'S GEAR TABLES ──────────────────────────────────────────────────────────────────────────────────
// Luke: "every enemy still has a loot table of items that it can drop ... manicured to ensure every enemy has
// something different to drop, but its power is relative to the zone and enemy you're facing. Every enemy has
// a normal drop, a rare drop and a super rare drop — 3 assigned pieces you elect."
//
// One row per (zone, creature) — NOT per creature. The same rootrat standing twelve zones deeper drops better
// gear, because power is relative to the zone as well as the resident.
//
// ⚠️ THIS FILE IS DATA, NOT A BUILD ARTEFACT. scripts/gen-grove-loot.mjs emitted it once; re-running that
// script reassigns every row and throws away any hand-edit. Edit this file directly.
//
// ⚠️ WHAT MAY BE IN HERE, AND WHY IT IS A SHORT LIST. items.js: "every random reward path builds its pool by
// filtering ITEMS, so an exclusive that is merely 'not granted anywhere else' is an exclusive the fishing rod
// hands out." Six predicates were applied when this was generated, and any hand-edit has to respect them:
//   · isForgedItem    — 260 of the 297 ascendant items are __ascended TWINS, made with a Prismatic Stone.
//                        Dropping one gives away the forge's entire reason to exist.
//   · isRealMoneyItem — source admin / elite / chargeReward. This is what puts EVERY tier above mythic out
//                        of reach: ascendant, eternal, celestial and primordial gear is all elite-sourced.
//   · isOwnerOnlyItem · isSeasonItem · isHalloweenItem · isGourdfatherItem
//
// So the Grove's item ladder runs common → mythic and stops. "Rare but possible" above that is handled by the
// super-rare slot occasionally paying a top-tier CHEST instead (see GEAR_CHEST below), which keeps one place
// deciding how often elite gear enters the game.
//
// Collection set pieces are NOT in these tables either — they have their own roll, SET_PIECE below.

/** (zoneId|foeId) → the three pieces that creature drops in that zone. */
export const GROVE_GEAR = {
    // Thicket Edge · Rootrat · might  (common/common/rare)
    "thicket|rootrat": { normal: "bronze_hatchet", rare: "steel_dagger", sup: "battle_staff" },
    // Mossy Hollow · Pale Grub · vitality  (common/common/rare)
    "hollow|grub": { normal: "band_valor", rare: "iron_band", sup: "binder_charm" },
    // The Fernway · Rootrat · might  (common/common/rare)
    "fernway|rootrat": { normal: "rusty_sword", rare: "gs2_short_sword", sup: "gs_apprentice_wand" },
    // The Fernway · Thornling · attack_speed  (common/common/rare)
    "fernway|thornling": { normal: "leaf_sash", rare: "sturdy_boots", sup: "scaled_cuirass" },
    // The Old Stand · Bristleback · armour  (common/common/rare)
    "oldstand|badger": { normal: "leather_armor", rare: "padded_vest", sup: "ragged_mail" },
    // Bramblewall · Thornling · attack_speed  (common/common/rare)
    "bramble|thornling": { normal: "short_bow", rare: "bone_mace", sup: "relic_blade" },
    // Bramblewall · Gourdling · life_steal  (common/common/rare)
    "bramble|gourdling": { normal: "gs2_worn_ring", rare: "gs_bronze_buckler", sup: "hunters_bow" },
    // The Stubble Field · Straw Walker · move_speed  (common/common/rare)
    "stubble|husk": { normal: "iron_sword", rare: "wooden_shield", sup: "war_boomerang" },
    // The Barrows · Barrow Hound · crit_rate  (common/rare/rare)
    "barrows|barrowhound": { normal: "silver_ring", rare: "focus_band", sup: "ring_embers" },
    // The Barrows · Straw Walker · move_speed  (common/rare/rare)
    "barrows|husk": { normal: "leather_cap", rare: "twin_fangs", sup: "tome_of_fury" },
    // The Warren · Warren Mother · emblem_find  (common/rare/rare)
    "warren|warren_mother": { normal: "copper_charm", rare: "fortune_pendant", sup: "gem_ring" },
    // The Warren · Barrow Hound · crit_rate  (common/rare/rare)
    "warren|barrowhound": { normal: "gs_swift_ring", rare: "ankh_pendant", sup: "balance_amulet" },
    // Mothlight · Mothlight · rarity_find  (common/rare/rare)
    "mothlight|voidmoth": { normal: "emerald_charm", rare: "gs_lucky_coin", sup: "gs2_hunters_charm" },
    // Rotwood · Ash Wraith · crit_damage  (common/rare/rare)
    "rotwood|ashwraith": { normal: "fire_ward", rare: "droplet_ring", sup: "focus_sash" },
    // Rotwood · Mothlight · rarity_find  (common/rare/rare)
    "rotwood|voidmoth": { normal: "owl_charm", rare: "ring_of_fortune", sup: "diamond_droplet" },
    // The Palisade · Palisade Goblin · ferocity  (common/rare/rare)
    "palisade|goblin": { normal: "pearl_strand", rare: "runners_sash", sup: "frost_treads" },
    // The Palisade · Ash Wraith · crit_damage  (common/rare/rare)
    "palisade|ashwraith": { normal: "spartan_helm", rare: "suns_ward", sup: "horned_helm" },
    // Heartwood · Elderling · tenacity  (common/rare/rare)
    "heartwood|elderling": { normal: "leather_belt", rare: "breastplate", sup: "swift_boots" },
    // Heartwood · Palisade Goblin · ferocity  (common/rare/rare)
    "heartwood|goblin": { normal: "worn_boots", rare: "trailblazers", sup: "windfoot" },
    // Rootfall · Cave Crawler · armour  (common/rare/rare)
    "rootfall|cave_crawler": { normal: "studded_vest", rare: "scale_mail", sup: "frost_barrier" },
    // The Stalk Field · Stalk Hopper · armour  (common/rare/rare)
    "stalkfield|stalk_hopper": { normal: "padded_coat", rare: "kite_shield", sup: "spiked_shield" },
    // The Stalk Field · Cave Crawler · armour  (common/rare/rare)
    "stalkfield|cave_crawler": { normal: "gs2_cloth_robe", rare: "raiders_helm", sup: "guardian_mantle" },
    // The Narrows · Sinew Spider · armour  (common/rare/rare)
    "narrows|sinew_spider": { normal: "gs2_wood_shield", rare: "ranger_visor", sup: "dwarf_helm" },
    // The Roost · Roostbat · armour  (common/rare/rare)
    "roost|roostbat": { normal: "oak_buckler", rare: "rangers_hood", sup: "raven_cloak" },
    // The Roost · Sinew Spider · armour  (common/rare/rare)
    "roost|sinew_spider": { normal: "buckler", rare: "hunters_cloak", sup: "war_cape" },
    // The Coal Seam · Coalback · armour  (common/rare/rare)
    "coalseam|coalback": { normal: "chainmail", rare: "stomping_boots", sup: "waterflow_belt" },
    // The Spore Hall · Sporemoth · armour  (common/rare/rare)
    "sporehall|sporemoth": { normal: "iron_helm", rare: "monk_sash", sup: "talisman" },
    // The Spore Hall · Stalk Hopper · armour  (common/rare/rare)
    "sporehall|stalk_hopper": { normal: "gs2_leather_helm", rare: "moonstone_pendant", sup: "fox_charm" },
    // The Dripworks · Dripstone Lurker · armour  (rare/rare/epic)
    "dripworks|dripstone_lurker": { normal: "ragged_mail", rare: "scale_mail", sup: "berserkers_hide" },
    // The Blind Gallery · Blind Warden · armour  (rare/rare/epic)
    "blindgallery|blind_warden": { normal: "ragged_mail", rare: "scale_mail", sup: "heartguard_plate" },
    // The Blind Gallery · Dripstone Lurker · armour  (rare/rare/epic)
    "blindgallery|dripstone_lurker": { normal: "ragged_mail", rare: "scale_mail", sup: "plate_armor" },
    // Shalestep · Shale Biter · armour  (rare/rare/epic)
    "shalestep|shale_biter": { normal: "ragged_mail", rare: "scale_mail", sup: "warlord_plate" },
    // The Tendril Way · Tendril Creeper · armour  (rare/rare/epic)
    "tendrilway|tendril_creeper": { normal: "ragged_mail", rare: "scale_mail", sup: "pauldron_plate" },
    // The Tendril Way · Shale Biter · armour  (rare/rare/epic)
    "tendrilway|shale_biter": { normal: "ragged_mail", rare: "scale_mail", sup: "gs_battle_plate" },
    // The Mole Warrens · Molewarden · armour  (rare/rare/epic)
    "molewarrens|molewarden": { normal: "ragged_mail", rare: "scale_mail", sup: "gs2_scale_cuirass" },
    // The Mole Warrens · Tendril Creeper · armour  (rare/rare/epic)
    "molewarrens|tendril_creeper": { normal: "ragged_mail", rare: "scale_mail", sup: "shadow_shroud" },
    // The Lumen Vault · Lumen Drifter · armour  (rare/rare/epic)
    "lumenvault|lumen_drifter": { normal: "ragged_mail", rare: "scale_mail", sup: "grimoire" },
    // The Lumen Vault · Blind Warden · armour  (rare/rare/epic)
    "lumenvault|blind_warden": { normal: "ragged_mail", rare: "scale_mail", sup: "dragon_shield" },
    // The Reed Line · Reed Slicer · vitality  (rare/epic/epic)
    "reedline|reed_slicer": { normal: "binder_charm", rare: "raven_feather", sup: "lotus_pendant" },
    // Blackwater · Bog Walker · vitality  (rare/epic/epic)
    "blackwater|bog_walker": { normal: "binder_charm", rare: "gs_fortune_amulet", sup: "blessed_pendant" },
    // Blackwater · Reed Slicer · vitality  (rare/epic/epic)
    "blackwater|reed_slicer": { normal: "binder_charm", rare: "power_signet", sup: "aura_ring" },
    // The Coil Bed · Weedcoil · vitality  (rare/epic/epic)
    "coilbed|weedcoil": { normal: "binder_charm", rare: "comet_greaves", sup: "greaves_valor" },
    // Toadmire · Marsh Toad · vitality  (rare/epic/epic)
    "toadmire|marsh_toad": { normal: "binder_charm", rare: "warlords_girdle", sup: "gs2_swift_greaves" },
    // Toadmire · Weedcoil · vitality  (rare/epic/epic)
    "toadmire|weedcoil": { normal: "binder_charm", rare: "gs_power_band", sup: "haste_boots" },
    // The Gas Flats · Gasbloom · vitality  (rare/epic/epic)
    "gasflats|gasbloom": { normal: "binder_charm", rare: "valor_treads", sup: "concentration_orb" },
    // Wisplight · Willow Wisp · vitality  (rare/epic/epic)
    "wisplight|willow_wisp": { normal: "binder_charm", rare: "warhammer", sup: "warding_orb" },
    // The Peat Cuts · Peat Hulk · vitality  (rare/epic/legendary)
    "peatcuts|peat_hulk": { normal: "binder_charm", rare: "gs_guardian_shield", sup: "kings_ring" },
    // The Peat Cuts · Bog Walker · vitality  (rare/epic/legendary)
    "peatcuts|bog_walker": { normal: "binder_charm", rare: "gs2_ward_orb", sup: "gs_royal_signet" },
    // Sunken Row · The Drowned · vitality  (rare/epic/legendary)
    "sunkenrow|drowned_thing": { normal: "binder_charm", rare: "cinder_axe", sup: "bear_fang" },
    // The Shell Bank · Shellback · vitality  (rare/epic/legendary)
    "shellbank|shellback": { normal: "binder_charm", rare: "warplate_helm", sup: "bear_girdle" },
    // The Lashing · Vine Lasher · vitality  (rare/epic/legendary)
    "lashing|vine_lasher": { normal: "binder_charm", rare: "arcane_staff", sup: "gs2_titan_belt" },
    // The Lashing · Weedcoil · vitality  (rare/epic/legendary)
    "lashing|weedcoil": { normal: "binder_charm", rare: "champions_belt", sup: "titan_stompers" },
    // The Heron Wade · Fen Heron · vitality  (rare/epic/legendary)
    "heronwade|fen_heron": { normal: "binder_charm", rare: "amulet_of_fury", sup: "windwalkers" },
    // The Heron Wade · Vine Lasher · vitality  (rare/epic/legendary)
    "heronwade|vine_lasher": { normal: "binder_charm", rare: "flanged_mace", sup: "dragoncape" },
    // Mothermire · Wisp Mother · vitality  (rare/epic/legendary)
    "mothermire|wisp_mother": { normal: "binder_charm", rare: "rune_blade", sup: "aegis" },
    // Mothermire · Willow Wisp · vitality  (rare/epic/legendary)
    "mothermire|willow_wisp": { normal: "binder_charm", rare: "wrath_pendant", sup: "wolf_totem" },
    // The Tideline · Shellpicker · move_speed  (rare/epic/legendary)
    "tideline|shellpicker": { normal: "scaled_cuirass", rare: "heavy_cleaver", sup: "reapers_scythe" },
    // The Drift Bank · Driftlurk · move_speed  (rare/epic/legendary)
    "driftbank|driftlurk": { normal: "scaled_cuirass", rare: "frost_brand", sup: "stormcaller" },
    // The Drift Bank · Shellpicker · move_speed  (rare/epic/legendary)
    "driftbank|shellpicker": { normal: "scaled_cuirass", rare: "gs_battlemage_staff", sup: "storm_katana" },
    // The Kelp Forest · Kelp Hauler · move_speed  (rare/epic/legendary)
    "kelpforest|kelp_hauler": { normal: "scaled_cuirass", rare: "war_pick", sup: "soulflame_sword" },
    // The Seal Rocks · Rock Seal · move_speed  (rare/epic/legendary)
    "sealrocks|rock_seal": { normal: "scaled_cuirass", rare: "chakram", sup: "gs_runeblade" },
    // The Salt Flats · Salt Wraith · move_speed  (rare/epic/legendary)
    "saltflats|salt_wraith": { normal: "scaled_cuirass", rare: "winged_scepter", sup: "gs2_rune_greatsword" },
    // The Salt Flats · Shellpicker · move_speed  (rare/epic/legendary)
    "saltflats|shellpicker": { normal: "scaled_cuirass", rare: "gs2_flame_sword", sup: "executioner_axe" },
    // The Pearl Shallows · Pearl Diver · move_speed  (rare/epic/legendary)
    "pearlshallows|pearl_diver": { normal: "scaled_cuirass", rare: "centurion_helm", sup: "tidebreaker" },
    // The Tide Wall · Tidewarden · move_speed  (epic/legendary/legendary)
    "tidewall|tidewarden": { normal: "eagle_sigil", rare: "dragonfang_blade", sup: "soulreaver" },
    // The Tide Wall · Rock Seal · move_speed  (epic/legendary/legendary)
    "tidewall|rock_seal": { normal: "war_girdle", rare: "gs_aegis", sup: "overlord_helm" },
    // The Wreck Yard · Wreck Hand · move_speed  (epic/legendary/legendary)
    "wreckyard|wreck_hand": { normal: "warbonnet", rare: "dragonplate", sup: "warlords_amulet" },
    // The Wreck Yard · Driftlurk · move_speed  (epic/legendary/legendary)
    "wreckyard|driftlurk": { normal: "pentagram_charm", rare: "crown_of_kings", sup: "aegis_plate" },
    // The Urchin Shelf · Urchin Roller · move_speed  (epic/legendary/legendary)
    "urchinshelf|urchin_roller": { normal: "heavy_warhelm", rare: "giants_belt", sup: "wolf_heart" },
    // The Netting · Net Caster · move_speed  (epic/legendary/legendary)
    "netting|net_caster": { normal: "tiger_fang", rare: "bastion_shield", sup: "wolf_crown" },
    // The Netting · Wreck Hand · move_speed  (epic/legendary/legendary)
    "netting|wreck_hand": { normal: "gs_valor_crown", rare: "ronin_kimono", sup: "thunderstride" },
    // Stormhead · Storm Gull · move_speed  (epic/legendary/legendary)
    "stormhead|storm_gull": { normal: "gs2_knight_helm", rare: "star_amulet", sup: "ring_titans" },
    // Stormhead · Salt Wraith · move_speed  (epic/legendary/legendary)
    "stormhead|salt_wraith": { normal: "gs2_war_belt", rare: "spiked_wall", sup: "shadow_cowl" },
    // The Foam Line · Foamborn · move_speed  (epic/legendary/legendary)
    "foamline|foamborn": { normal: "gs2_gem_amulet", rare: "serpent_coil", sup: "kings_sash" },
    // The Foam Line · Storm Gull · move_speed  (epic/legendary/legendary)
    "foamline|storm_gull": { normal: "gs2_might_ring", rare: "warlord_ring", sup: "cultist_hood" },
    // The Steps Down · Tile Scuttler · might  (epic/legendary/legendary)
    "stepsdown|tile_scuttler": { normal: "warbanner_cape", rare: "gs2_heart_amulet", sup: "gs_champion_amulet" },
    // The Colonnade · Pillar Lurk · might  (epic/legendary/legendary)
    "colonnade|pillar_lurk": { normal: "gilded_mantle", rare: "gs2_kings_band", sup: "elephant_totem" },
    // The Colonnade · Tile Scuttler · might  (epic/legendary/legendary)
    "colonnade|tile_scuttler": { normal: "gs2_flame_sword", rare: "bounty_hunters_mark", sup: "phoenix_mantle" },
    // The Hauling Hall · Rope Hauler · might  (epic/legendary/legendary)
    "hauling_hall|rope_hauler": { normal: "gs2_flame_sword", rare: "gs2_swift_striders", sup: "gs_warlord_crown" },
    // The Eel Works · Grand Moray · might  (epic/legendary/legendary)
    "eelworks|moray": { normal: "gs2_flame_sword", rare: "gs2_dragon_ward", sup: "gs2_plate_of_kings" },
    // The Eel Works · Rope Hauler · might  (epic/legendary/legendary)
    "eelworks|rope_hauler": { normal: "gs2_flame_sword", rare: "runeweave_robe", sup: "gs_dragonhide" },
    // The Fire Vault · Ember Acolyte · might  (epic/legendary/legendary)
    "fire_vault|ember_acolyte": { normal: "gs2_flame_sword", rare: "gs2_horned_crown", sup: "wings_of_dawn" },
    // The Lantern Walk · Pearl Warden · might  (epic/legendary/legendary)
    "lantern_walk|pearl_warden": { normal: "gs2_flame_sword", rare: "celestial_cloak", sup: "stormcaller" },
    // The Lantern Walk · Ember Acolyte · might  (epic/legendary/legendary)
    "lantern_walk|ember_acolyte": { normal: "gs2_flame_sword", rare: "stormcaller", sup: "tidebreaker" },
    // The Block Yard · Blockfist · might  (epic/legendary/mythic)
    "block_yard|blockfist": { normal: "gs2_flame_sword", rare: "stormcaller", sup: "worldflame_maul" },
    // The Sigil Road · Sigil Bearer · might  (epic/legendary/mythic)
    "sigil_road|sigil_bearer": { normal: "gs2_flame_sword", rare: "stormcaller", sup: "gs2_dragon_god" },
    // The Sigil Road · Pillar Lurk · might  (epic/legendary/mythic)
    "sigil_road|pillar_lurk": { normal: "gs2_flame_sword", rare: "stormcaller", sup: "gs2_energy_blade" },
    // The Mosaic Floor · Mosaic Swarm · might  (epic/legendary/mythic)
    "mosaic_floor|mosaic_swarm": { normal: "gs2_flame_sword", rare: "stormcaller", sup: "gs_excalibur" },
    // The Wire House · Wirecoil · might  (epic/legendary/mythic)
    "wirehouse|wirecoil": { normal: "gs2_flame_sword", rare: "stormcaller", sup: "gs_worldedge" },
    // The Wire House · Blockfist · might  (epic/legendary/mythic)
    "wirehouse|blockfist": { normal: "gs2_flame_sword", rare: "stormcaller", sup: "godsplitter" },
    // The Ray Shallows · Rayglider · might  (epic/legendary/mythic)
    "ray_shallows|rayglider": { normal: "gs2_flame_sword", rare: "stormcaller", sup: "gs_worldbreaker" },
    // The Ray Shallows · Grand Moray · might  (epic/legendary/mythic)
    "ray_shallows|moray": { normal: "gs2_flame_sword", rare: "stormcaller", sup: "worldender" },
    // The Deep Room · The Deeplight · might  (epic/legendary/mythic)
    "deeproom|deeplight": { normal: "gs2_flame_sword", rare: "stormcaller", sup: "meteor_hammer" },
    // The Deep Room · Sigil Bearer · might  (epic/legendary/mythic)
    "deeproom|sigil_bearer": { normal: "gs2_flame_sword", rare: "stormcaller", sup: "gs2_infinity_ring" },
    // The Glass Crust · Glass Skitter · crit_rate  (epic/legendary/mythic)
    "glass_crust|glass_skitter": { normal: "aura_ring", rare: "star_amulet", sup: "spectre_locket" },
    // The Rib Stand · Ribwalker · crit_rate  (epic/legendary/mythic)
    "rib_stand|ribwalker": { normal: "aura_ring", rare: "star_amulet", sup: "eye_eternity" },
    // The Rib Stand · Glass Skitter · crit_rate  (epic/legendary/mythic)
    "rib_stand|glass_skitter": { normal: "aura_ring", rare: "star_amulet", sup: "gs2_cosmic_amulet" },
    // The Hound Run · Sinew Hound · crit_rate  (epic/legendary/mythic)
    "hound_run|sinew_hound": { normal: "aura_ring", rare: "star_amulet", sup: "gs_eternity_amulet" },
    // Basker's Rock · Scale Basker · crit_rate  (epic/legendary/mythic)
    "baskers_rock|scale_basker": { normal: "aura_ring", rare: "star_amulet", sup: "galaxy_pendant" },
    // Basker's Rock · Sinew Hound · crit_rate  (epic/legendary/mythic)
    "baskers_rock|sinew_hound": { normal: "aura_ring", rare: "star_amulet", sup: "dragonheart_sigil" },
    // The Asp Dunes · Ember Asp · crit_rate  (epic/legendary/mythic)
    "asp_dunes|ember_asp": { normal: "aura_ring", rare: "star_amulet", sup: "gs_omnipotence_ring" },
    // The Mirage Flat · Mirage Walker · crit_rate  (epic/legendary/mythic)
    "mirage_flat|mirage_walker": { normal: "aura_ring", rare: "star_amulet", sup: "infinity_loop" },
    // The Mirage Flat · Ember Asp · crit_rate  (epic/legendary/mythic)
    "mirage_flat|ember_asp": { normal: "aura_ring", rare: "star_amulet", sup: "suncrest" },
    // The Walking Dunes · Dune Hulk · crit_rate  (legendary/legendary/mythic)
    "walking_dunes|dune_hulk": { normal: "star_amulet", rare: "serpent_coil", sup: "gs2_crown_supreme" },
    // The Scarab Field · Scarab Swarm · crit_rate  (legendary/legendary/mythic)
    "scarab_field|scarab_swarm": { normal: "star_amulet", rare: "serpent_coil", sup: "deadeye_mask" },
    // Knapper's Ridge · Chert Thrower · crit_rate  (legendary/legendary/mythic)
    "knapper_ridge|chert_thrower": { normal: "star_amulet", rare: "serpent_coil", sup: "gs_god_helm" },
    // Knapper's Ridge · Glass Skitter · crit_rate  (legendary/legendary/mythic)
    "knapper_ridge|glass_skitter": { normal: "star_amulet", rare: "serpent_coil", sup: "archmage_visage" },
    // Slinger's Pass · Cord Slinger · crit_rate  (legendary/legendary/mythic)
    "slingers_pass|cord_slinger": { normal: "star_amulet", rare: "serpent_coil", sup: "ancient_halo" },
    // Slinger's Pass · Sinew Hound · crit_rate  (legendary/legendary/mythic)
    "slingers_pass|sinew_hound": { normal: "star_amulet", rare: "serpent_coil", sup: "oracle_diadem" },
    // The Jackal Wake · Waste Jackal · crit_rate  (legendary/legendary/mythic)
    "jackal_wake|jackal": { normal: "star_amulet", rare: "serpent_coil", sup: "worldshield" },
    // The Jackal Wake · Cord Slinger · crit_rate  (legendary/legendary/mythic)
    "jackal_wake|cord_slinger": { normal: "star_amulet", rare: "serpent_coil", sup: "void_orb" },
    // Sunstare · The Shimmer · crit_rate  (legendary/legendary/mythic)
    "sunstare|shimmer": { normal: "star_amulet", rare: "serpent_coil", sup: "celestial_robe" },
    // Sunstare · Mirage Walker · crit_rate  (legendary/legendary/mythic)
    "sunstare|mirage_walker": { normal: "star_amulet", rare: "serpent_coil", sup: "cosmic_sash" },
    // The Glass Barrens · Glass Crawler · crit_damage  (legendary/mythic/mythic)
    "glass_barrens|glass_crawler": { normal: "ring_titans", rare: "kings_eternal", sup: "oblivion_wings" },
    // The Bone Kilns · Bone Kiln · crit_damage  (legendary/mythic/mythic)
    "bone_kilns|bone_kiln": { normal: "ring_titans", rare: "featherfall", sup: "eternal_aegis" },
    // The Bone Kilns · Glass Crawler · crit_damage  (legendary/mythic/mythic)
    "bone_kilns|glass_crawler": { normal: "ring_titans", rare: "eternal_shroud", sup: "voidwalkers" },
    // The Wirewood Stand · Wirewood · crit_damage  (legendary/mythic/mythic)
    "wirewood_stand|wirewood": { normal: "ring_titans", rare: "colossus_belt", sup: "void_maelstrom" },
    // The Boar Run · Cinder Boar · crit_damage  (legendary/mythic/mythic)
    "boar_run|cinder_boar": { normal: "ring_titans", rare: "starforged_mail", sup: "world_girdle" },
    // The Boar Run · Wirewood · crit_damage  (legendary/mythic/mythic)
    "boar_run|wirewood": { normal: "ring_titans", rare: "eternity_band", sup: "gs_titan_aegis" },
    // The Ember Drift · Ember Wisp · crit_damage  (legendary/mythic/mythic)
    "ember_drift|ember_wisp": { normal: "ring_titans", rare: "gs_celestial_plate", sup: "gs_sovereign_crown" },
    // Opal Hollow · Opal Moth · crit_damage  (legendary/mythic/mythic)
    "opal_hollow|opal_moth": { normal: "ring_titans", rare: "gs2_void_ward", sup: "gs2_star_plate" },
    // Opal Hollow · Ember Wisp · crit_damage  (legendary/mythic/mythic)
    "opal_hollow|ember_wisp": { normal: "ring_titans", rare: "gs2_apex_crown", sup: "void_shroud" },
    // The Basalt Steps · Basalt Golem · crit_damage  (legendary/mythic/mythic)
    "basalt_steps|basalt_golem": { normal: "ring_titans", rare: "spectre_locket", sup: "gs_eternity_amulet" },
    // The Vent Fields · Reach Salamander · crit_damage  (legendary/mythic/mythic)
    "vent_fields|salamander": { normal: "ring_titans", rare: "spectre_locket", sup: "gs_eternity_amulet" },
    // The Vent Fields · Basalt Golem · crit_damage  (legendary/mythic/mythic)
    "vent_fields|basalt_golem": { normal: "ring_titans", rare: "spectre_locket", sup: "gs_eternity_amulet" },
    // The Shrike Cliffs · Ashglass Shrike · crit_damage  (legendary/mythic/mythic)
    "shrike_cliffs|ashglass_shrike": { normal: "ring_titans", rare: "spectre_locket", sup: "gs_eternity_amulet" },
    // The Slag Run · Slag Crawler · crit_damage  (legendary/mythic/mythic)
    "slag_run|slag_crawler": { normal: "ring_titans", rare: "spectre_locket", sup: "gs_eternity_amulet" },
    // The Slag Run · Basalt Golem · crit_damage  (legendary/mythic/mythic)
    "slag_run|basalt_golem": { normal: "ring_titans", rare: "spectre_locket", sup: "gs_eternity_amulet" },
    // Sootfall · Sootback · crit_damage  (legendary/mythic/mythic)
    "sootfall|sootback": { normal: "ring_titans", rare: "spectre_locket", sup: "gs_eternity_amulet" },
    // Sootfall · Cinder Boar · crit_damage  (legendary/mythic/mythic)
    "sootfall|cinder_boar": { normal: "ring_titans", rare: "spectre_locket", sup: "gs_eternity_amulet" },
    // Forgeheart · Forge Wraith · crit_damage  (legendary/mythic/mythic)
    "forgeheart|forge_wraith": { normal: "ring_titans", rare: "spectre_locket", sup: "gs_eternity_amulet" },
    // Forgeheart · Reach Salamander · crit_damage  (legendary/mythic/mythic)
    "forgeheart|salamander": { normal: "ring_titans", rare: "spectre_locket", sup: "gs_eternity_amulet" },
};

// ── HOW OFTEN GEAR FALLS ─────────────────────────────────────────────────────────────────────────────────────
// ⚠️ TWO REGIMES, BECAUSE ONE NUMBER CANNOT SERVE BOTH ENDS. A new account needs ~15 pieces across map 1 to
// put a kit together (a full common kit measures 100 dps / 299 hp, which is exactly the floor the Grove
// needs). A veteran at the frontier killing 40 a minute at that same rate would mint 48 pieces an hour —
// against the 82 a day the entire Den currently produces. The on-ramp is passed through ONCE per account,
// which is what makes it safe to be generous there and nowhere else.
export const GEAR_CHANCE = { onramp: 0.025, steady: 0.008, deep: 0.005 };

/** Maps 1-2 are the on-ramp; 3-5 steady; 6-7 lean. */
export const gearChanceFor = (map) => (map <= 2 ? GEAR_CHANCE.onramp : map <= 5 ? GEAR_CHANCE.steady : GEAR_CHANCE.deep);

// Which of the three slots a gear drop pays. Rolled only once gear has already dropped.
export const SLOT_SPLIT = { rare: 0.20, sup: 0.04 };   // the remainder is the normal slot

// ── THE TAIL ─────────────────────────────────────────────────────────────────────────────────────────────────
// Luke, on whether celestial and primordial can come out of the Grove: "No, it's rare, but possible."
//
// They cannot drop as ITEMS — every one of them is elite-sourced. So the super-rare slot can instead pay a
// top-tier CHEST, granted through addChests like the rare spawn's, and the chest grants the gear through the
// path that already meters it. Sized against the chest ladder's own deliberate Den-wide budget of 5 celestial
// and 1 primordial a month: at these odds a player turns up a celestial roughly every 15 hours of frontier
// farming and a primordial every 77.
//
// ⚠️ NOT SET-AND-FORGET. These scale with how much the Den farms — twenty people farming five hours a week
// would put out 28 celestials a month against the ladder's five. Re-measure by daily total once the Grove has
// real traffic; scripts/grove-tail.mjs re-solves them for any target.
export const GEAR_CHEST = { celestial: 0.0034, primordial: 0.00067, fromMap: 6 };

// ── COLLECTION PIECES ────────────────────────────────────────────────────────────────────────────────────────
// Luke: "if you're using [set pieces], make it extremely hard to get in the Grove as well."
//
// Measured first: 13 sets, 71 pieces, 209 grants across the game's history — about 80 a month entering the
// game Den-wide. At this rate the Grove adds two a month, one per ~39 hours of farming: 2.5% of the existing
// flow, which makes it the hardest route to a set piece in the game while keeping it possible.
//
// ⚠️ AND MEASURING IT THE OBVIOUS WAY IS WRONG: collection pieces are not mkt_user_item rows. Inventory
// returns ZERO copies owned, which reads as "nobody has any" and is false. They live in mkt_item_collected.
export const SET_PIECE = { chance: 0.00135, fromMap: 5, pool: ["amber_grain_pendant","clover_signet","deep_seed_pouch","dv_lamp_helm","dv_lodestone","dv_rope_belt","dv_shoring_pack","fd_apron","fd_bellows_charm","fd_slagsifter","fd_tongs","foragers_basket","fortune_signet","foxglove_charm","gc_bell","gc_colours","gc_horn","gc_marque","gc_quadrant","gc_rammer","girded_plate","gw_aegis","gw_crown","gw_girdle","gw_mantle","gw_maul","gw_pendant","gw_plate","gw_saber","gw_signet","gw_treads","harvesters_hat","heavens_trident","hw_candle_eye","hw_coldspot_mirror","hw_cord_small_hours","hw_femur_maul","hw_gravemould_cuirass","hw_gravewalkers","hw_hollow_crown","hw_knucklebone_charm","hw_nine_candles","hw_ninth_night_shroud","hw_poltergeist_chain","hw_quiet_row_skullcap","hw_reapers_sickle","hw_trailing_hem","hw_wisp_lantern","merchants_cape","orb_of_tides","rb_assay_ring","rb_gauntlet","rb_hobnails","rb_maul","reapers_girdle","regalia_boots","regalia_cloak","regalia_girdle","regalia_plate","regalia_visor","sheafbound_cloak","wg_amulet","wg_axe","wg_belt","wg_blade","wg_boots","wg_chest","wg_cloak","wg_helm","wg_ring","wg_shield"] };
