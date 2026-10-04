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
    E("hw_seedvault", KIND.chest, "The Seed Vault", "A dry stone chamber the roots grew around and never broke into. Nobody has been in here.", { weight: 2, rare: true, art: "rare-seedvault", lootMult: 5 }),
    E("hw_kinghoard", KIND.cache, "The Warren King's Hoard", "Generations of stolen brightness, heaped in one chamber.", { weight: 1, rare: true, art: "rare-kinghoard", lootMult: 7 }),
    E("hw_orchardheart", KIND.chest, "The Orchard's Heart", "The oldest root, split open and hollow. Nothing has ever been inside it.", { weight: 2, rare: true, art: "rare-orchardheart", lootMult: 6 }),

    E("hw_scrabble", KIND.fight, "Scrabbling Behind You", "You have been followed for two floors. It has stopped pretending.", { weight: 24 }),
    E("hw_territory", KIND.fight, "Marked Territory", "The scratches on the wall are chest height. Whatever made them is not.", { weight: 22 }),
    E("hw_nursing", KIND.fight, "It Is Guarding Something", "It will not back off and it will not stop.", { weight: 19, dmgMult: 1.3, lootMult: 1.5 }),
    E("hw_pair", KIND.fight, "A Mated Pair", "They work together. They have done this before.", { weight: 16, hpMult: 1.3, dmgMult: 1.15, lootMult: 1.5 }),
    E("hw_starved", KIND.fight, "Something Starved", "Ribs like a birdcage, and no fear left at all.", { weight: 15, hpMult: 0.7, dmgMult: 1.35 }),
    E("hw_walls", KIND.fight, "The Walls Are Moving", "Not the walls. What is living in them.", { weight: 13, dmgMult: 1.2, lootMult: 1.3 }),
    E("hw_mimic_eggs", KIND.mimic, "A Clutch of Pale Eggs", "Warm, soft, and one of them is looking at you.", { weight: 6, dmgMult: 1.4 }),
    E("hw_winterstore", KIND.chest, "A Winter Store", "Apples, wax-sealed jars, and something better at the back.", { weight: 15 }),
    E("hw_pack", KIND.chest, "A Dropped Pack", "Buckles still done up. Whoever wore it left in a hurry.", { weight: 13 }),
    E("hw_press", KIND.chest, "Under the Cider Press", "A gap nobody thought to look in for forty years.", { weight: 10, lootMult: 1.5 }),
    E("hw_ring", KIND.cache, "A Ring in the Dirt", "Gold, plain, and far too fine for a badger to have come by honestly.", { weight: 12, lootMult: 1.3 }),
    E("hw_jar", KIND.cache, "A Buried Jar", "Sealed with wax. Heavy. It rattles.", { weight: 11 }),
    E("hw_trapper", KIND.merchant, "A Trapper", "He has worked these tunnels since before the collapse.", { weight: 11 }),
    E("hw_child", KIND.merchant, "A Lost Child", "Not lost, it turns out. Living here. And driving a hard bargain.", { weight: 7 }),
    E("hw_spring", KIND.shrine, "A Warm Spring", "Steam, and for once it is not something breathing.", { weight: 11 }),
    E("hw_greenman", KIND.shrine, "A Face in the Bark", "Grown into the root wall. Its mouth is open.", { weight: 8, bargain: true }),
    E("hw_sump", KIND.well, "A Sump Pool", "Still, black, and deeper than the room is tall.", { weight: 10 }),
    E("hw_drain", KIND.well, "A Broken Drain", "Coins come down here from the orchard above. Some of them stayed.", { weight: 8 }),
    E("hw_collapse", KIND.trap, "A Partial Collapse", "The roof has done this before and is thinking about it again.", { weight: 13 }),
    E("hw_wasps", KIND.trap, "A Wasp Bough", "It comes out of the root wall like a fist.", { weight: 11 }),
    E("hw_thorns", KIND.trap, "A Thorn Curtain", "It looks passable. It is passable. It is not free.", { weight: 10 }),
    E("hw_moss", KIND.rest, "A Bed of Moss", "Dry, thick, and the first soft thing in an hour.", { weight: 10 }),
    E("hw_daylight", KIND.rest, "A Shaft of Daylight", "Straight down through the collapse. You stand in it a while.", { weight: 9 }),
    E("hw_forks", KIND.puzzle, "Three Ways On", "One smells of animal. One of rain. One of nothing at all.", { weight: 10 }),
    E("hw_carving", KIND.puzzle, "A Carving in a Root", "Someone marked this place. The mark means something.", { weight: 9 }),
    E("hw_honey", KIND.puzzle, "A Hole Full of Honey", "Reaching in would be foolish. It would also be worth it.", { weight: 8 }),
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
    E("sv_reserve", KIND.chest, "The Reserve Room", "Behind the strongroom, behind another door, is the room they never listed.", { weight: 2, rare: true, art: "rare-reserve", lootMult: 5 }),
    E("sv_wreck", KIND.cache, "The Sunk Barge", "The shipment that never arrived, still in its crates, under the floor.", { weight: 1, rare: true, art: "rare-wreck", lootMult: 7 }),
    E("sv_directors", KIND.chest, "The Director's Office", "A room off the ledger hall that no ledger mentions.", { weight: 2, rare: true, art: "rare-directors", lootMult: 6 }),

    E("sv_below", KIND.fight, "From Below", "The water goes still, which is the last warning you get.", { weight: 24 }),
    E("sv_stair", KIND.fight, "On the Stair", "Coming down as you go up, and unwilling to discuss it.", { weight: 22 }),
    E("sv_pair", KIND.fight, "Two of Them", "They separate to come at you from both sides. They have practised.", { weight: 19, hpMult: 1.3, dmgMult: 1.15, lootMult: 1.5 }),
    E("sv_nest", KIND.fight, "A Nest in the Vault", "Something has been breeding in the safe deposit boxes.", { weight: 17, dmgMult: 1.3, lootMult: 1.4 }),
    E("sv_bloated", KIND.fight, "Something Bloated", "It has been down here a long time and it has been eating.", { weight: 15, hpMult: 1.4, dmgMult: 1.1 }),
    E("sv_quick", KIND.fight, "Something Fast", "You see it once before it is on you.", { weight: 13, hpMult: 0.7, dmgMult: 1.4 }),
    E("sv_mimic_ledger", KIND.mimic, "A Ledger Left Open", "The page it is open at lists nothing. The cover is breathing.", { weight: 6, dmgMult: 1.4 }),
    E("sv_manifest", KIND.chest, "A Sealed Manifest Case", "Waxed against water and it held.", { weight: 15 }),
    E("sv_teller", KIND.chest, "Behind the Teller's Grille", "The float, still counted out for a day that never opened.", { weight: 13 }),
    E("sv_private", KIND.chest, "A Private Box", "No number on it, which is the point of a private box.", { weight: 10, lootMult: 1.5 }),
    E("sv_seal", KIND.cache, "A Vault Seal", "Solid silver, and worth more than what it was sealing.", { weight: 12, lootMult: 1.3 }),
    E("sv_tin", KIND.cache, "A Clerk's Tin", "Hidden behind a loose brick. Everyone has a loose brick.", { weight: 11 }),
    E("sv_salvor", KIND.merchant, "A Salvor", "She has been working the vault for weeks and knows what sells.", { weight: 11 }),
    E("sv_auditor", KIND.merchant, "The Auditor", "Still doing the rounds. Still expecting a receipt.", { weight: 7 }),
    E("sv_cistern", KIND.shrine, "The Clean Cistern", "Sealed from the flood. Somebody kept it that way on purpose.", { weight: 11 }),
    E("sv_scales", KIND.shrine, "A Set of Scales", "One pan is empty. The other is waiting to see what you think you are worth.", { weight: 8, bargain: true }),
    E("sv_overflow", KIND.well, "The Overflow", "Where the coins went when the counting room flooded.", { weight: 10 }),
    E("sv_grate2", KIND.well, "A Grated Drain", "You can see something bright down there. Just.", { weight: 8 }),
    E("sv_undertow", KIND.trap, "An Undertow", "The floor slopes and the water has opinions.", { weight: 13 }),
    E("sv_ice", KIND.trap, "Cold Enough to Hurt", "Your hands stop working before you notice they have.", { weight: 11 }),
    E("sv_glass", KIND.trap, "A Case Gives Way", "Old glass under old pressure.", { weight: 10 }),
    E("sv_ledge", KIND.rest, "A Dry Ledge", "Wide enough to sit. That is enough.", { weight: 10 }),
    E("sv_brazier", KIND.rest, "A Brazier Still Lit", "Somebody has been feeding this. Recently.", { weight: 9 }),
    E("sv_combination", KIND.puzzle, "A Combination Door", "Four dials, and a note nearby that is either the code or a joke.", { weight: 10 }),
    E("sv_two_boxes", KIND.puzzle, "Two Boxes, One Key", "The key fits both. You have time to open one.", { weight: 9 }),
    E("sv_floodgate", KIND.puzzle, "The Floodgate Wheel", "Turning it drains the room. Or fills it.", { weight: 8 }),
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
    E("ed_mastervault", KIND.chest, "The Master's Locker", "Whoever ran this forge kept their own work behind a door nobody else had a key for.", { weight: 2, rare: true, art: "rare-mastervault", lootMult: 5 }),
    E("ed_heartseam", KIND.cache, "The Heart Seam", "The reason they dug here. The reason they sealed it.", { weight: 1, rare: true, art: "rare-heartseam", lootMult: 7 }),
    E("ed_firstforge", KIND.chest, "The First Forge", "Older than the mine. Whoever built the rest built this first.", { weight: 2, rare: true, art: "rare-firstforge", lootMult: 6 }),

    E("ed_pour", KIND.fight, "It Comes Out of the Pour", "The channel bulges. Something climbs out of it.", { weight: 24 }),
    E("ed_catwalk", KIND.fight, "On the Catwalk", "Narrow footing, a long drop, and company.", { weight: 22 }),
    E("ed_shift", KIND.fight, "A Whole Shift of Them", "They come down the gantry in a line, like they are clocking on.", { weight: 19, dmgMult: 1.3, lootMult: 1.5 }),
    E("ed_welded", KIND.fight, "Two Fused Together", "Whatever happened here, it happened to both of them at once.", { weight: 16, hpMult: 1.35, dmgMult: 1.15, lootMult: 1.5 }),
    E("ed_brittle", KIND.fight, "Something Brittle", "Cracked through. One good hit would do it. If you land it.", { weight: 15, hpMult: 0.65, dmgMult: 1.35 }),
    E("ed_furnace", KIND.fight, "It Was in the Furnace", "It climbs out slowly, because it is in no hurry at all.", { weight: 13, hpMult: 1.2, dmgMult: 1.2, lootMult: 1.3 }),
    E("ed_mimic_bellows", KIND.mimic, "A Set of Bellows", "Working away on its own. There is no one at the handle.", { weight: 6, dmgMult: 1.4 }),
    E("ed_pattern", KIND.chest, "The Pattern Store", "Wooden moulds for things nobody casts any more.", { weight: 15 }),
    E("ed_shiftbox", KIND.chest, "A Shift Locker", "Somebody's whole working life in a tin box.", { weight: 13 }),
    E("ed_assay", KIND.chest, "The Assay Cupboard", "Samples, labelled, from every seam they ever opened.", { weight: 10, lootMult: 1.5 }),
    E("ed_ingot", KIND.cache, "A Single Ingot", "Poured, stamped, and never collected.", { weight: 12, lootMult: 1.3 }),
    E("ed_sweepings", KIND.cache, "Floor Sweepings", "Fifty years of what fell off the bench.", { weight: 11 }),
    E("ed_tinker", KIND.merchant, "A Tinker", "He buys scrap and sells things that are almost finished.", { weight: 11 }),
    E("ed_stoker", KIND.merchant, "The Last Stoker", "Still feeding a furnace nobody asked him to keep lit.", { weight: 7 }),
    E("ed_cistern2", KIND.shrine, "A Cold Cistern", "Somebody carved a channel to bring water down here. Bless them.", { weight: 11 }),
    E("ed_anvil", KIND.shrine, "The Old Anvil", "Worn to a dip in the middle. Put your hand on it and something answers.", { weight: 8, bargain: true }),
    E("ed_slagpit", KIND.well, "A Slag Pit", "Things get dropped in here. Some of them were worth keeping.", { weight: 10 }),
    E("ed_flue", KIND.well, "A Blocked Flue", "Something is wedged up there, glinting.", { weight: 8 }),
    E("ed_backdraft", KIND.trap, "A Backdraft", "The air goes the wrong way, and then it goes very fast.", { weight: 13 }),
    E("ed_spatter", KIND.trap, "Molten Spatter", "A channel overtops. It only takes a drop.", { weight: 11 }),
    E("ed_hook", KIND.trap, "A Swinging Hook", "Still on its chain, still carrying momentum from something.", { weight: 10 }),
    E("ed_watertap", KIND.rest, "A Water Tap", "It still runs. Somebody maintained this.", { weight: 10 }),
    E("ed_breakroom", KIND.rest, "The Break Room", "Benches, a cold stove, and a hand of cards left mid-game.", { weight: 9 }),
    E("ed_levers", KIND.puzzle, "A Bank of Levers", "Eight of them, and a chart that has burned away.", { weight: 10 }),
    E("ed_crucibles", KIND.puzzle, "Two Crucibles", "One is cooling. One is not. Both are full.", { weight: 9 }),
    E("ed_gauge", KIND.puzzle, "A Pressure Gauge", "Deep in the red, and there is a valve beside it.", { weight: 8 }),
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
    E("as_observatory", KIND.chest, "The Observatory", "A room the stairs do not lead to, which you have found anyway.", { weight: 2, rare: true, art: "rare-observatory", lootMult: 5 }),
    E("as_corehall", KIND.cache, "The Hollow at the Centre", "Everything the Spire has ever taken, in one place, still falling.", { weight: 1, rare: true, art: "rare-corehall", lootMult: 7 }),
    E("as_beforeroom", KIND.chest, "The Room From Before", "Furnished, lived in, and older than the tower it is inside.", { weight: 2, rare: true, art: "rare-beforeroom", lootMult: 6 }),

    E("as_behind", KIND.fight, "It Was Behind You", "It has been behind you since floor two.", { weight: 24 }),
    E("as_doorway", KIND.fight, "In the Doorway", "Filling it. Not moving. Waiting for you to decide.", { weight: 22 }),
    E("as_many", KIND.fight, "Several of You", "All wearing your face, all doing it badly.", { weight: 19, dmgMult: 1.3, lootMult: 1.5 }),
    E("as_twinned", KIND.fight, "Twinned", "Hit one and the other flinches. Hit the other and nothing happens.", { weight: 16, hpMult: 1.35, dmgMult: 1.15, lootMult: 1.5 }),
    E("as_unravelling", KIND.fight, "Something Unravelling", "Coming apart at the edges, and furious about the deadline.", { weight: 15, hpMult: 0.65, dmgMult: 1.35 }),
    E("as_constellation", KIND.fight, "A Constellation Steps Down", "The pattern on the wall is not on the wall any more.", { weight: 13, hpMult: 1.2, dmgMult: 1.2, lootMult: 1.3 }),
    E("as_mimic_mirror", KIND.mimic, "A Mirror at the Landing", "Your reflection reaches the frame before you do.", { weight: 6, dmgMult: 1.4 }),
    E("as_archive", KIND.chest, "A Shelf of Sealed Jars", "Each one holds a little weather. One holds something else.", { weight: 15 }),
    E("as_pilgrimpack", KIND.chest, "A Pilgrim's Pack", "Set down neatly. They meant to come back for it.", { weight: 13 }),
    E("as_instrument", KIND.chest, "An Instrument Case", "Brass, jointed, and pointed at nothing you can see.", { weight: 10, lootMult: 1.5 }),
    E("as_shard", KIND.cache, "A Fallen Shard", "A piece of the wall, and the wall is made of sky.", { weight: 12, lootMult: 1.3 }),
    E("as_tribute", KIND.cache, "Left on the Sill", "Coins, teeth and small bright things, left by people going up.", { weight: 11 }),
    E("as_cartographer", KIND.merchant, "A Cartographer", "Mapping a tower that will not hold still. Selling what he has learned.", { weight: 11 }),
    E("as_keeper", KIND.merchant, "The Keeper of the Stair", "Neither going up nor down. Happy to trade.", { weight: 7 }),
    E("as_font2", KIND.shrine, "A Font of Still Light", "It pools like water and it is not water.", { weight: 11 }),
    E("as_ledger2", KIND.shrine, "The Tally Stone", "It has been counting something about you since you came in.", { weight: 8, bargain: true }),
    E("as_drop", KIND.well, "A Drop With No Bottom", "Things thrown in do not land. Some come back.", { weight: 10 }),
    E("as_orbit", KIND.well, "Something in Orbit", "Circling the stairwell, just out of reach, glinting.", { weight: 8 }),
    E("as_fold", KIND.trap, "The Room Folds", "Two walls become one. You are on the wrong side of the join.", { weight: 13 }),
    E("as_pressure2", KIND.trap, "The Air Thins", "Ten floors up is a long way up, whatever the stairs say.", { weight: 11 }),
    E("as_shear", KIND.trap, "A Stair Shears Away", "Underfoot, and then not.", { weight: 10 }),
    E("as_stillroom", KIND.rest, "A Room That Stays Put", "The first one. You take a minute.", { weight: 10 }),
    E("as_warmstone", KIND.rest, "A Warm Stone Bench", "Warm from what, exactly, is not a question worth chasing.", { weight: 9 }),
    E("as_threedoors", KIND.puzzle, "Three Doors, One Wall", "The wall is not wide enough for three doors.", { weight: 10 }),
    E("as_mirrorpair", KIND.puzzle, "Facing Mirrors", "One of the reflections is not repeating.", { weight: 9 }),
    E("as_hourglass", KIND.puzzle, "An Hourglass, Running Up", "Turning it over would presumably do something.", { weight: 8 }),
];

// ── THE LANTERN CRYPT ── ceremonial, kept, attended. Candles, offerings, places laid for the dead. ──────────
// The Hallowe'en dungeon, and the only seasonal deck. Its voice is the one thing none of the other four have:
// everything down here has been ARRANGED. The Warren is animal and the Deep is industrial, but the crypt is
// HOUSEKEPT — candles relit, offerings laid out, chairs set in a circle, a place at the table. Nothing in it
// is abandoned, which is what makes it worse than if it were. The question every floor is asking is who is
// still doing the keeping.
//
// Same 53 slots, same kind spread and the same weight skeleton as the other four, so a crypt run paces
// exactly like a Warren run — 11 fights, 3 mimics, 8 chests (2 of them rare), 5 caches (1 rare), 4 merchants,
// 4 shrines, 3 wells, 6 traps, 4 rests, 5 puzzles, 634 points of weight. What differs is every word and the
// handful of multipliers below, which is how the other three differ from each other.
const LANTERN = [
    E("lc_satup", KIND.fight, "It Was Sitting Up", "It had been laid out properly, hands folded. It is not lying down any more.", { weight: 30 }),
    E("lc_snuffed", KIND.fight, "The Candle Goes Out", "And something crosses the room while you cannot see it.", { weight: 26 }),
    E("lc_row", KIND.fight, "A Row of Them", "Nine graves, nine markers, and every one of the markers is lying flat.", { weight: 20, dmgMult: 1.25, lootMult: 1.4 }),
    E("lc_guttering", KIND.fight, "A Guttering Wick", "Almost out, and burning hard the way they do right at the end.", { weight: 17, hpMult: 0.6, dmgMult: 1.3 }),
    E("lc_sexton", KIND.fight, "The Sexton", "He has kept this crypt for eighty years and he is still on duty.", { weight: 11, hpMult: 1.6, lootMult: 2 }),

    E("lc_mimic_offering", KIND.mimic, "An Offering, Untouched", "Bread, coins and a lit candle, set out neatly on the slab. Nobody has taken any of it.", { weight: 8, dmgMult: 1.3 }),
    E("lc_mimic_coffin", KIND.mimic, "A Coffin Left Open", "Lined, cushioned and empty. Waiting is the word for it.", { weight: 5, dmgMult: 1.5, lootMult: 1.8 }),

    // The crypt's chests are GIFTS rather than loot — things carried down and left on purpose — so the common
    // one pays a little above the house rate and the picked-over one is the exception that proves it.
    E("lc_gravegoods", KIND.chest, "The Grave Goods", "Everything they thought he would need, still stacked exactly where it was left.", { weight: 18, lootMult: 1.4 }),
    E("lc_locker", KIND.chest, "A Sexton's Locker", "Tools, tapers, and forty years of things found and never claimed.", { weight: 15 }),
    E("lc_pickedover", KIND.chest, "Picked Over", "Somebody was here first. They were not thorough, but they were here.", { weight: 11, lootMult: 0.6 }),

    E("lc_tollbowl", KIND.cache, "The Toll Bowl", "Coins pressed into the hands of the dead, and the dead have let go of them.", { weight: 16 }),
    E("lc_bellrope", KIND.cache, "A Bell Rope of Coins", "Threaded on a cord so the dead could ring for help. Nobody ever did.", { weight: 9, lootMult: 1.8 }),

    E("lc_keeper", KIND.merchant, "The Lantern-Keeper", "She walks the crypt relighting whatever has gone out, and she will sell you a flame.", { weight: 13 }),
    E("lc_robber", KIND.merchant, "A Grave Robber, Candidly", "He is not pretending to be anything else, and his prices are fair.", { weight: 8 }),

    E("lc_stillwater", KIND.shrine, "A Bowl of Still Water", "Left out for the thirsty. It has never been drunk and it has never gone bad.", { weight: 13 }),
    E("lc_nine", KIND.shrine, "The Nine Candles", "Light one and ask. Light two and it costs you something.", { weight: 9, bargain: true }),

    E("lc_shaft", KIND.well, "The Wishing Shaft", "Drop a coin in and listen. It takes a long time to land.", { weight: 11 }),

    E("lc_lid", KIND.trap, "The Floor Is Not a Floor", "It is a lid, and it has been holding for a very long time.", { weight: 14 }),
    E("lc_wax", KIND.trap, "Wax Underfoot", "Decades of it, poured smooth, and nothing for a boot to hold on to.", { weight: 12 }),
    E("lc_behindyou", KIND.trap, "The Candles Go Out Behind You", "One at a time, in order, at walking pace.", { weight: 10 }),

    E("lc_bench", KIND.rest, "The Visitors' Bench", "Put here for the living. The first thing down here that was.", { weight: 11 }),
    E("lc_alcove", KIND.rest, "A Lit Alcove", "Warm, dry, and somebody has left a cup out.", { weight: 12 }),

    E("lc_faces", KIND.puzzle, "Three Faces", "Three sealed doors, three carved grins. Only one of them is smiling.", { weight: 10 }),
    E("lc_book", KIND.puzzle, "The Visitors' Book", "Every name that ever came down here, in order. There is a space at the bottom.", { weight: 9 }),

    // ── RARE ──
    E("lc_candlevault", KIND.chest, "The Candle Vault", "A sealed room holding ten thousand candles. Not one of them is lit, and every one has a name on it.", { weight: 2, rare: true, art: "rare-candlevault", lootMult: 5 }),
    E("lc_kingstithe", KIND.cache, "The Hollow King's Tithe", "Every coin anybody in this valley has ever left for the dead, heaped in one chamber, counted.", { weight: 1, rare: true, art: "rare-kingstithe", lootMult: 7 }),
    E("lc_lastharvest", KIND.chest, "The Last Harvest", "A whole year's crop carried down and laid out whole. None of it has rotted. None of it is going to.", { weight: 2, rare: true, art: "rare-lastharvest", lootMult: 6 }),

    E("lc_draught", KIND.fight, "Something Blew Past You", "You felt the draught of it. There is no door open down here.", { weight: 24 }),
    E("lc_procession", KIND.fight, "The Procession", "They are not coming for you. They are also not going around you.", { weight: 22 }),
    E("lc_hungry", KIND.fight, "It Is Still Hungry", "The offering bowl at its feet is empty, and has been for a long time.", { weight: 19, dmgMult: 1.3, lootMult: 1.5 }),
    E("lc_mourners", KIND.fight, "A Pair of Mourners", "They have stood either side of this door for a century and they have had enough of visitors.", { weight: 16, hpMult: 1.35, dmgMult: 1.15, lootMult: 1.5 }),
    E("lc_burnedthrough", KIND.fight, "Burned Nearly Through", "Barely holding together, and in a hurry about it.", { weight: 15, hpMult: 0.65, dmgMult: 1.35 }),
    E("lc_turn", KIND.fight, "The Lanterns All Turn", "Every flame in the corridor leans towards you at once.", { weight: 13, hpMult: 1.2, dmgMult: 1.2, lootMult: 1.3 }),
    E("lc_mimic_gift", KIND.mimic, "A Gift Basket", "Wrapped in cloth and tied with string, and the tag has your name on it.", { weight: 6, dmgMult: 1.4 }),
    E("lc_shelf", KIND.chest, "The Offering Shelf", "A month of gifts for the dead, and the dead have not touched a thing.", { weight: 15 }),
    E("lc_coffer", KIND.chest, "A Harvest Coffer", "Packed for a feast nobody ever came down to eat.", { weight: 13 }),
    E("lc_falsemarker", KIND.chest, "Behind the False Marker", "One grave marker is a door, and it is not even locked.", { weight: 10, lootMult: 1.5 }),
    E("lc_pennies", KIND.cache, "Pennies on the Eyes", "A whole row of them, and nobody left to object.", { weight: 12, lootMult: 1.3 }),
    E("lc_childhoard", KIND.cache, "A Child's Hoard", "Buttons, glass, three gold rings, and a very good system.", { weight: 11 }),
    E("lc_soulcaker", KIND.merchant, "The Soul-Caker", "She is baking down here, for them. There is enough for you as well.", { weight: 11 }),
    E("lc_grandmother", KIND.merchant, "Somebody's Grandmother", "Dead forty years and still running a stall. She asks after your mother.", { weight: 7 }),
    E("lc_hearth", KIND.shrine, "The Hearth They Keep Lit", "Not for warmth. For company. It works on you anyway.", { weight: 11 }),
    E("lc_dolly", KIND.shrine, "A Corn Dolly in a Niche", "Woven from the last sheaf of the year. It will take a year off your luck, or hand you one.", { weight: 8, bargain: true }),
    E("lc_floodedgrave", KIND.well, "A Flooded Grave", "Full of black water and a hundred years of other people's hopes.", { weight: 10 }),
    E("lc_bellshaft", KIND.well, "The Bell Shaft", "Coins go down it. Sometimes the bell at the bottom answers.", { weight: 8 }),
    E("lc_barrow", KIND.trap, "A Collapsed Barrow", "The roof came down here once already. It remembers how.", { weight: 13 }),
    E("lc_cold", KIND.trap, "A Snuffed Corridor", "Cold enough to hurt, and it was warm when you walked into it.", { weight: 11 }),
    E("lc_markers", KIND.trap, "Grave Markers, Falling", "Stacked three deep along the wall and very badly balanced.", { weight: 10 }),
    E("lc_vigil", KIND.rest, "The Vigil Room", "Chairs in a circle, a lamp in the middle, and nobody keeping the vigil tonight.", { weight: 10 }),
    E("lc_placeset", KIND.rest, "Somebody Set a Place for You", "Bread, water, and a chair pulled out. You sit down before you think about it.", { weight: 9 }),
    E("lc_whichcandle", KIND.puzzle, "Which Candle Is Yours", "A hundred of them burning, each with a name cut into the wax. You recognise one.", { weight: 10 }),
    E("lc_bellpull", KIND.puzzle, "The Bell Pull", "Two cords hanging side by side. One rings upstairs. One rings further down.", { weight: 9 }),
    E("lc_chiselled", KIND.puzzle, "A Name Half Chiselled Out", "Somebody started taking it off the stone and stopped. You could finish it, or you could not.", { weight: 8 }),
];

// ⚠️ THE CRYPT IS A KEY IN HERE, AND IT HAS TO BE. `eventsFor` falls back to an empty array for an unknown
// dungeon, and dealFloors builds its bag from that — so a missing key is not a missing FEATURE, it is a run
// that deals zero floors and then pushes the boss on at depth 10. The Lantern Crypt shipped exactly like that:
// its own backdrop, its own four foes, its own boss and its own loot table, and you walked in the door and
// were standing in front of the Hollow King. Nobody hit it (0 rows) because it is behind the Hallowe'en flag.
//
// ⚠️ AND IT IS NOT IN `DUNGEONS` — see the note in delve-catalog.js. That array is the denominator for the
// `delve_all_four` badge; this deck lives beside it instead for the same reason.
export const DECKS = { hollow: HOLLOW, sunken: SUNKEN, ember: EMBER, astral: ASTRAL, lanterncrypt: LANTERN };

/** The deck a dungeon draws from. Nothing is shared, so an unknown id has no floors rather than everyone's. */
export const eventsFor = (dungeonId) => DECKS[dungeonId] || [];

/** Flat list, for the art scripts and the audit. */
export const EVENTS = Object.values(DECKS).flat();
