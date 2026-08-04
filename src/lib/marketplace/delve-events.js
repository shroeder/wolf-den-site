import { KIND } from "@/lib/marketplace/delve-kinds.js";

// ── THE EVENT DECKS ──────────────────────────────────────────────────────────────────────────────────────────
// FOUR SEPARATE DECKS. Nothing is shared.
//
// The first cut had 34 shared events and 4 exclusives each, which meant 90% of every floor you ever saw came
// out of the same pot — four dungeons wearing four backdrops. A Sunken Vault floor now cannot happen in the
// Ember Deep, because the Ember Deep has never heard of it.
//
// Each deck is ~22 events, and each carries its own voice: the Warren is cramped and animal, the Vault is cold
// and bureaucratic, the Deep is industrial and burning, the Spire is quiet and wrong.
//
// RARITY IS REAL. `weight` is relative within a deck and the spread is deliberate — a common fight is 30, a
// RARE find is 1 or 2. At weight 2 out of a ~230-point deck, that is roughly a 0.9% chance per floor, so about
// one run in fourteen shows you one. Those are flagged `rare: true` and pay 4-8x a normal floor, because a
// jackpot nobody ever sees is just dead text and a jackpot everyone sees is just the baseline.
const E = (id, kind, title, text, extra = {}) => ({ id, kind, title, text, weight: 10, ...extra });

// ── THE HOLLOW WARREN ── cramped, animal, damp. Roots, burrows, things that bite. ───────────────────────────
const HOLLOW = [
    E("hw_ambush", KIND.fight, "Something in the Dark", "It was waiting where the tunnel narrows, and it moves first.", { weight: 30 }),
    E("hw_dig", KIND.fight, "It Comes Up Through the Floor", "The soil bulges. Then it doesn't.", { weight: 26 }),
    E("hw_litter", KIND.fight, "A Litter of Them", "One would be a nuisance. There is a nest.", { weight: 20, dmgMult: 1.25, lootMult: 1.4 }),
    E("hw_hive", KIND.fight, "Broken Hive", "You put a boot through it before you saw it.", { weight: 18, dmgMult: 1.2 }),
    E("hw_old", KIND.fight, "The Old One", "Grey around the muzzle, and it has held this tunnel a long time.", { weight: 11, hpMult: 1.6, lootMult: 2 }),

    E("hw_mimic_cache", KIND.mimic, "A Hoard, Unattended", "Shiny things in a neat pile. Something arranged them.", { weight: 8, dmgMult: 1.3 }),
    E("hw_mimic_root", KIND.mimic, "A Hollow in the Roots", "Lined with soft moss, like a bed. Like bait.", { weight: 5, dmgMult: 1.5, lootMult: 1.8 }),

    E("hw_strongbox", KIND.chest, "A Farmer's Strongbox", "Dragged down here whole, years ago, and never opened.", { weight: 18 }),
    E("hw_burrow", KIND.chest, "A Hoarder's Burrow", "Something has been carrying bright things down here for a very long time.", { weight: 14, lootMult: 1.4 }),
    E("hw_scattered", KIND.chest, "Scattered Pickings", "Somebody dropped a pack and left in a hurry.", { weight: 11, lootMult: 0.6 }),

    E("hw_purse", KIND.cache, "A Lost Purse", "Still tied shut. Nobody came back for it.", { weight: 16 }),
    E("hw_tithe", KIND.cache, "Coins in the Root Cup", "Pressed into a hollow like an offering to the orchard.", { weight: 9, lootMult: 1.8 }),

    E("hw_forager", KIND.merchant, "A Forager", "She has been down here a week and is happy to trade.", { weight: 13 }),
    E("hw_hermit", KIND.merchant, "The Root Hermit", "He lives under the orchard now, and considers that an improvement.", { weight: 8 }),

    E("hw_font", KIND.shrine, "A Trickle in the Wall", "Clean water, which down here is remarkable.", { weight: 13 }),
    E("hw_stone", KIND.shrine, "The Orchard Stone", "Older than the trees. Its hollow is worn smooth by hands.", { weight: 9, bargain: true }),

    E("hw_wishing", KIND.well, "A Flooded Shaft", "Deep, black, and it has swallowed a lot of coins.", { weight: 11 }),

    E("hw_roots", KIND.trap, "Grasping Roots", "The orchard is still alive down here, and it is not friendly.", { weight: 14 }),
    E("hw_floor", KIND.trap, "The Floor Gives", "One step is not like the others.", { weight: 12 }),
    E("hw_spores", KIND.trap, "A Puff of Spores", "Sweet-smelling, which is the worst sign.", { weight: 10 }),

    E("hw_cellar", KIND.rest, "The Old Cellar", "Cider barrels, most of them burst. One of them isn't.", { weight: 11 }),
    E("hw_quiet", KIND.rest, "A Quiet Stretch", "Nothing happens. It is almost worse.", { weight: 12 }),

    E("hw_doors", KIND.puzzle, "Two Burrows", "One breathes warm air. One doesn't.", { weight: 10 }),
    E("hw_snare", KIND.puzzle, "A Poacher's Snare Line", "Old wire, still set, and something is hanging in it.", { weight: 9 }),

    // ── RARE ──
    E("hw_seedvault", KIND.chest, "The Seed Vault", "A dry stone chamber the roots grew around and never broke into. Nobody has been in here.", { weight: 2, rare: true, lootMult: 5 }),
    E("hw_kinghoard", KIND.cache, "The Warren King's Hoard", "Generations of stolen brightness, heaped in one chamber.", { weight: 1, rare: true, lootMult: 7 }),
];

// ── THE SUNKEN VAULT ── cold, flooded, bureaucratic. Ledgers, keys, drowned procedure. ──────────────────────
const SUNKEN = [
    E("sv_current", KIND.fight, "Something in the Current", "It circles once before it comes at you.", { weight: 30 }),
    E("sv_door", KIND.fight, "It Blocks the Door", "Standing exactly where the ledger says a guard should stand.", { weight: 26 }),
    E("sv_shoal", KIND.fight, "A Shoal of Them", "The water boils, and none of it is water.", { weight: 20, dmgMult: 1.25, lootMult: 1.4 }),
    E("sv_wounded", KIND.fight, "Something Already Hurt", "It is bleeding into the water. That makes it worse, not better.", { weight: 17, hpMult: 0.6, dmgMult: 1.3 }),
    E("sv_keeper", KIND.fight, "A Senior Clerk", "Still in uniform. Still very serious about the rules.", { weight: 11, hpMult: 1.6, lootMult: 2 }),

    E("sv_mimic_deposit", KIND.mimic, "A Deposit Box, Ajar", "Left open. Nobody leaves a deposit box open.", { weight: 8, dmgMult: 1.3 }),
    E("sv_mimic_bullion", KIND.mimic, "Too Much Gold", "Bars stacked to the ceiling. Far too many of them.", { weight: 5, dmgMult: 1.5, lootMult: 1.8 }),

    E("sv_strongroom", KIND.chest, "The Strongroom", "The door was already open. That should worry you more than it does.", { weight: 18, lootMult: 1.5 }),
    E("sv_deposit", KIND.chest, "Deposit Box 114", "The lock is corroded through. The contents are not.", { weight: 15 }),
    E("sv_looted", KIND.chest, "Someone Got Here First", "Prised open and picked over. They missed the false bottom.", { weight: 11, lootMult: 0.6 }),

    E("sv_spill", KIND.cache, "Coin in the Silt", "Scattered like someone ran with their hands full.", { weight: 16 }),
    E("sv_payroll", KIND.cache, "A Payroll Sack", "Sealed, stamped, and never delivered.", { weight: 9, lootMult: 1.8 }),

    E("sv_diver", KIND.merchant, "A Diver", "Down here on purpose, and willing to part with kit.", { weight: 13 }),
    E("sv_ghostshop", KIND.merchant, "The Teller's Window", "A counter, a lamp, and a clerk who does not blink.", { weight: 8 }),

    E("sv_basin", KIND.shrine, "A Clean Basin", "Fed by something above. It has stayed clear all this time.", { weight: 13 }),
    E("sv_toll", KIND.shrine, "The Toll Plate", "A slot, and a line of script explaining the fee.", { weight: 9, bargain: true }),

    E("sv_shaft", KIND.well, "The Coin Shaft", "Where the overflow went. Where it still is.", { weight: 11 }),

    E("sv_bilge", KIND.trap, "Rising Bilge", "The water is at your knees, and it wasn't a minute ago.", { weight: 14 }),
    E("sv_grate", KIND.trap, "A Rusted Grate", "It holds until precisely the moment it doesn't.", { weight: 12 }),
    E("sv_pressure", KIND.trap, "A Seam Bursts", "The wall lets go with a sound like a held breath.", { weight: 10 }),

    E("sv_dry", KIND.rest, "A Dry Landing", "Above the waterline, out of the cold, for a moment.", { weight: 11 }),
    E("sv_lamp", KIND.rest, "A Lamp Still Burning", "Somebody trimmed this wick. Recently.", { weight: 12 }),

    E("sv_ledger", KIND.puzzle, "A Waterlogged Ledger", "Someone recorded what was stored here. Some of it is still legible.", { weight: 10 }),
    E("sv_keys", KIND.puzzle, "A Ring of Keys", "Forty of them. Two doors.", { weight: 9 }),

    // ── RARE ──
    E("sv_reserve", KIND.chest, "The Reserve Room", "Behind the strongroom, behind another door, is the room they never listed.", { weight: 2, rare: true, lootMult: 5 }),
    E("sv_wreck", KIND.cache, "The Sunk Barge", "The shipment that never arrived, still in its crates, under the floor.", { weight: 1, rare: true, lootMult: 7 }),
];

// ── THE EMBER DEEP ── industrial, burning, loud. Forges, vents, slag, chains. ───────────────────────────────
const EMBER = [
    E("ed_flow", KIND.fight, "Out of the Magma", "It rises out of the flow without hurrying.", { weight: 30 }),
    E("ed_gantry", KIND.fight, "On the Gantry", "It has the high ground and it knows what that means.", { weight: 26 }),
    E("ed_swarm", KIND.fight, "The Cinders Move", "You thought that was ash. It was not ash.", { weight: 20, dmgMult: 1.25, lootMult: 1.4 }),
    E("ed_cooling", KIND.fight, "Something Half-Cooled", "Cracked, brittle, and furious about it.", { weight: 17, hpMult: 0.6, dmgMult: 1.3 }),
    E("ed_foreman", KIND.fight, "The Foreman", "Bigger than the rest, and it still wears the badge.", { weight: 11, hpMult: 1.6, lootMult: 2 }),

    E("ed_mimic_crucible", KIND.mimic, "A Crucible, Full", "Brimming with something bright. Bright things down here are usually alive.", { weight: 8, dmgMult: 1.3 }),
    E("ed_mimic_ingots", KIND.mimic, "A Pallet of Ingots", "Neatly stacked and gently breathing.", { weight: 5, dmgMult: 1.5, lootMult: 1.8 }),

    E("ed_toolchest", KIND.chest, "A Smith's Tool Chest", "Left when the seal went up. Everything still in its slot.", { weight: 18 }),
    E("ed_slagpile", KIND.chest, "Picked From the Slag", "Somebody sorted this heap and never came back for the good half.", { weight: 15, lootMult: 1.4 }),
    E("ed_scorched", KIND.chest, "A Scorched Strongbox", "Most of what was in it did not survive the heat.", { weight: 11, lootMult: 0.6 }),

    E("ed_wages", KIND.cache, "The Wage Tin", "Nailed under a bench, exactly where you would nail it.", { weight: 16 }),
    E("ed_ore", KIND.cache, "A Vein of Bright Metal", "Running through the wall like a seam of light.", { weight: 9, lootMult: 1.8 }),

    E("ed_forge", KIND.merchant, "An Abandoned Forge", "Still hot. Someone has left tools, and a price list.", { weight: 13 }),
    E("ed_scrapper", KIND.merchant, "A Scrapper", "He works the seam alone and sells what he does not need.", { weight: 8 }),

    E("ed_quench", KIND.shrine, "The Quenching Trough", "Cold water in a hot place. Nothing has ever been more welcome.", { weight: 13 }),
    E("ed_crucible", KIND.shrine, "The Crucible", "Put your hand in and it will give you something. It will also take something.", { weight: 9, bargain: true }),

    E("ed_shaft", KIND.well, "A Vent Shaft", "It goes down further than the light does.", { weight: 11 }),

    E("ed_vent", KIND.trap, "A Steam Vent", "It goes off on a schedule. You learn the schedule the hard way.", { weight: 14 }),
    E("ed_chain", KIND.trap, "A Chain Lets Go", "Something heavy was hanging up there. Was.", { weight: 12 }),
    E("ed_crust", KIND.trap, "The Crust Breaks", "It looked like floor right up until it wasn't.", { weight: 10 }),

    E("ed_bunk", KIND.rest, "A Shift Bunk", "Someone slept here between shifts, back when there were shifts.", { weight: 11 }),
    E("ed_cool", KIND.rest, "A Cool Draught", "From somewhere. You don't question it.", { weight: 12 }),

    E("ed_valves", KIND.puzzle, "Two Valves", "One vents the room. One vents into it.", { weight: 10 }),
    E("ed_moulds", KIND.puzzle, "A Row of Moulds", "Still full, still cooling. One of them is not a tool.", { weight: 9 }),

    // ── RARE ──
    E("ed_mastervault", KIND.chest, "The Master's Locker", "Whoever ran this forge kept their own work behind a door nobody else had a key for.", { weight: 2, rare: true, lootMult: 5 }),
    E("ed_heartseam", KIND.cache, "The Heart Seam", "The reason they dug here. The reason they sealed it.", { weight: 1, rare: true, lootMult: 7 }),
];

// ── THE ASTRAL SPIRE ── quiet, wrong, weightless. Stairs that loop, reflections a beat behind. ──────────────
const ASTRAL = [
    E("as_echo", KIND.fight, "Your Own Shape", "It is wearing your face and it is not doing it well.", { weight: 30, dmgMult: 1.15, lootMult: 1.3 }),
    E("as_landing", KIND.fight, "On the Landing", "It has been standing there for a long time, facing the wrong way.", { weight: 26 }),
    E("as_swarm", KIND.fight, "The Motes Gather", "The drifting lights are not drifting any more.", { weight: 20, dmgMult: 1.25, lootMult: 1.4 }),
    E("as_fading", KIND.fight, "Something Half-Here", "It flickers. Hitting it is a matter of timing.", { weight: 17, hpMult: 0.6, dmgMult: 1.3 }),
    E("as_warden", KIND.fight, "The Floor Warden", "Larger, older, and entirely aware of the rules of this place.", { weight: 11, hpMult: 1.6, lootMult: 2 }),

    E("as_mimic_reliquary", KIND.mimic, "A Reliquary on a Plinth", "Lit from above by nothing at all.", { weight: 8, dmgMult: 1.3 }),
    E("as_mimic_star", KIND.mimic, "A Fallen Star, Cupped in Stone", "Warm. Waiting. Wrong.", { weight: 5, dmgMult: 1.5, lootMult: 1.8 }),

    E("as_orrery", KIND.chest, "A Broken Orrery", "The planets came off. They are worth a great deal.", { weight: 18, lootMult: 1.6 }),
    E("as_case", KIND.chest, "A Display Case", "Whatever it displayed is gone. What propped it up is not.", { weight: 15 }),
    E("as_dust", KIND.chest, "A Case Already Emptied", "Someone took the good half. They were in a hurry.", { weight: 11, lootMult: 0.6 }),

    E("as_scatter", KIND.cache, "Coin That Fell Upward", "Pooled against the ceiling in one corner of the room.", { weight: 16 }),
    E("as_offering", KIND.cache, "An Offering Bowl", "Filled by people who came up here on purpose.", { weight: 9, lootMult: 1.8 }),

    E("as_pilgrim", KIND.merchant, "A Pilgrim", "Going up as you go up. Neither of you mentions it.", { weight: 13 }),
    E("as_shopkeeper", KIND.merchant, "A Shop That Shouldn't Be", "A counter, a lamp, and a shopkeeper who does not blink.", { weight: 8 }),

    E("as_pool", KIND.shrine, "A Still Pool", "Your reflection is a beat behind you.", { weight: 13 }),
    E("as_reader", KIND.shrine, "The Reading Stone", "It wants to know something about you first.", { weight: 9, bargain: true }),

    E("as_window", KIND.well, "A Window With No Outside", "You can throw something through it. You will not get it back. Probably.", { weight: 11 }),

    E("as_stair", KIND.trap, "A Stair That Loops", "You have climbed this flight before. Twice.", { weight: 14 }),
    E("as_lean", KIND.trap, "The Floor Leans", "Down stops being where you left it.", { weight: 12 }),
    E("as_glare", KIND.trap, "Something Looks Back", "Through the wall. It is a long way off and it is enormous.", { weight: 10 }),

    E("as_alcove", KIND.rest, "A Quiet Alcove", "Out of the light from the walls. It helps more than it should.", { weight: 11 }),
    E("as_drift", KIND.rest, "A Weightless Moment", "Your feet leave the stone and you simply rest there.", { weight: 12 }),

    E("as_doors", KIND.puzzle, "Two Doors", "One is warm to the touch. One is not.", { weight: 10 }),
    E("as_riddle", KIND.puzzle, "Words Cut Into Stone", "A question, and space beneath it for an answer.", { weight: 9 }),

    // ── RARE ──
    E("as_observatory", KIND.chest, "The Observatory", "A room the stairs do not lead to, which you have found anyway.", { weight: 2, rare: true, lootMult: 5 }),
    E("as_corehall", KIND.cache, "The Hollow at the Centre", "Everything the Spire has ever taken, in one place, still falling.", { weight: 1, rare: true, lootMult: 7 }),
];

export const DECKS = { hollow: HOLLOW, sunken: SUNKEN, ember: EMBER, astral: ASTRAL };

/** The deck a dungeon draws from. Nothing is shared, so an unknown id has no floors rather than everyone's. */
export const eventsFor = (dungeonId) => DECKS[dungeonId] || [];

/** Flat list, for the art scripts and the audit. */
export const EVENTS = Object.values(DECKS).flat();
