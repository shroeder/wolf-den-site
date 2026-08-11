import "server-only";

import { db } from "@/lib/db";
import { itemById } from "@/lib/marketplace/items.js";

// ── ASCENSION POWERS ─────────────────────────────────────────────────────────────────────────────────────────
// The 120 non-combat signature powers, one per top-tier item. See docs/signature-powers-120.md for how they were
// arrived at — five tests, fourteen passes, and twenty-six killed for aiming at a mechanic that does not exist.
//
// WHY THESE ARE NOT IN signatures.js. That file answers "what does this gear do to a boss": every one of its
// mechanics is a damage multiplier, a proc, or a reward on a hit, and it is read inside the fight. These are the
// opposite — they change what the FARM, the KITCHEN, the DEPTHS, SAILING, the FORGE, the TOWN and the MARKET pay,
// and they are read at those decision points instead. Bolting them onto a combat resolver would have meant every
// feature importing the boss fight to ask a question about crops.
//
// HOW A CONSUMER USES ONE. Exactly like getPetSystemPerk: one call at a decision point that already exists.
//
//     if (await hasPower(buyerId, "perennial_root") && oneIn(3)) keepSeed();
//
// The value of a power is its PRESENCE — there are no levels and no stacking. Two items granting the same key is
// impossible by construction (one key per item, checked at generation), so a Set is the whole data model.
//
// EVERY POWER IS CONDITIONAL ON THE ITEM BEING WORN. Nothing here writes permanent state onto an item or an
// account: take the piece off and the effect stops. That was Test 3, and it is what stops a power being farmed
// and then sold with the gear.
export const ASCENSION_POWERS = {

    // ── ASCENDANT ──
    open_gate: { item: "ascendant_aegis", name: "The Open Gate", tier: "ascendant", cls: "B", desc: "Petting and feeding on other people's farms never spends your daily budget." },
    cold_bait: { item: "ascendant_risen_blade", name: "Cold Bait", tier: "ascendant", cls: "B", desc: "Your first cast each day cannot land a common." },
    gaff: { item: "ascendant_risen_bulwark", name: "The Gaff", tier: "ascendant", cls: "B", desc: "A fish that beats your personal best for its species refunds the cast." },
    quiet_passage: { item: "ascendant_risen_diadem", name: "The Quiet Passage", tier: "ascendant", cls: "B", desc: "One encounter in three lets you pass without a fight and keeps the spoils." },
    standing_recipe: { item: "ascendant_risen_shroud", name: "The Standing Recipe", tier: "ascendant", cls: "B", desc: "Twice a day, a recipe may be cooked with any ingredients you hold." },
    substitution: { item: "ascendant_risen_binding", name: "The Substitution", tier: "ascendant", cls: "B", desc: "Three times a day, one ingredient a recipe asks for may be swapped for any other you hold." },
    chef_s_pick: { item: "ascendant_risen_walkers", name: "Chef's Pick", tier: "ascendant", cls: "B", desc: "One dish a day cooks at perfect timing without playing it." },
    reforging_right: { item: "ascendant_risen_pinions", name: "The Reforging Right", tier: "ascendant", cls: "A", desc: "Reforging an element costs half." },
    founder_s_charter: { item: "ascendant_risen_medallion", name: "Founder's Charter", tier: "ascendant", cls: "A", desc: "The travelling merchant sells to you at half price." },
    standing_order: { item: "ascendant_risen_bond", name: "The Standing Order", tier: "ascendant", cls: "A", desc: "The travelling merchant's one-a-day chest limit becomes three of each." },
    market_day: { item: "ascendant_exalted_sabre", name: "Market Day", tier: "ascendant", cls: "B", desc: "The travelling merchant restocks for you, on demand, once a day." },
    warden_s_key: { item: "ascendant_exalted_wall", name: "The Warden's Key", tier: "ascendant", cls: "B", desc: "You may release one person from the Stockade each week." },
    muster: { item: "ascendant_exalted_veil", name: "The Muster", tier: "ascendant", cls: "B", desc: "You may fight in a town raid from anywhere. You need not be stood in the plaza." },
    toll_house: { item: "ascendant_exalted_plate", name: "The Toll House", tier: "ascendant", cls: "B", desc: "Every member who visits your farm pays you a toll — from the house, not from them." },
    standing_invitation: { item: "ascendant_exalted_sash", name: "Standing Invitation", tier: "ascendant", cls: "B", desc: "Anyone may visit your farm without spending one of their daily visits." },
    dealer_s_choice: { item: "ascendant_exalted_greaves", name: "Dealer's Choice", tier: "ascendant", cls: "B", desc: "Re-roll any wheel result once and keep whichever you prefer." },
    quartermaster_s_round: { item: "ascendant_exalted_cape", name: "The Quartermaster's Round", tier: "ascendant", cls: "B", desc: "Every daily quest is issued one step already done." },
    bounty_board_rights: { item: "ascendant_exalted_charm", name: "Bounty Board Rights", tier: "ascendant", cls: "A", desc: "You may take a fourth daily quest." },
    deep_bowl: { item: "ascendant_exalted_coil", name: "The Deep Bowl", tier: "ascendant", cls: "B", desc: "One treat in three feeds your pet without being used up." },
    long_leash: { item: "ascendant_ascendant_cleaver", name: "The Long Leash", tier: "ascendant", cls: "B", desc: "Your pet's ability keeps working while you are on someone else's farm." },
    breeder_s_eye: { item: "ascendant_ascendant_orb", name: "Breeder's Eye", tier: "ascendant", cls: "B", desc: "You choose which pet a random pet reward gives you." },
    whistle: { item: "ascendant_ascendant_hood", name: "The Whistle", tier: "ascendant", cls: "B", desc: "A pet you swap out keeps its ability for the rest of the day." },
    auctioneer_s_seat: { item: "ascendant_ascendant_scale", name: "The Auctioneer's Seat", tier: "ascendant", cls: "A", desc: "You pay no listing fee, and listing never takes the item out of your bags." },
    merchant_s_word: { item: "ascendant_ascendant_waistguard", name: "Merchant's Word", tier: "ascendant", cls: "B", desc: "A trade you offer holds its items in escrow without taking them off you." },
    standing_offer: { item: "ascendant_ascendant_tracks", name: "The Standing Offer", tier: "ascendant", cls: "B", desc: "One item a day, the shop buys from you at the price it sells for." },
    purser_s_exchange: { item: "ascendant_ascendant_cloak", name: "The Purser's Exchange", tier: "ascendant", cls: "B", desc: "Doubloons and laurels convert freely into one another. Gold stays out of it." },
    counting_house: { item: "ascendant_ascendant_amulet", name: "The Counting House", tier: "ascendant", cls: "B", desc: "The gold in your purse earns interest, paid at every check-in." },
    merchant_s_eye: { item: "ascendant_ascendant_signet", name: "The Merchant's Eye", tier: "ascendant", cls: "A", desc: "One daily deal each day is offered to you at half price." },
    no_reserve: { item: "ascendant_uplifted_scythe", name: "No Reserve", tier: "ascendant", cls: "B", desc: "An auction that does not sell is relisted for you, free, until it does." },
    bulk_buyer: { item: "ascendant_uplifted_rampart", name: "The Bulk Buyer", tier: "ascendant", cls: "B", desc: "One purchase in three from the gold shop comes in pairs." },
    merchant_s_ledger: { item: "ascendant_uplifted_coronet", name: "The Merchant's Ledger", tier: "ascendant", cls: "A", desc: "The travelling merchant stocks his whole catalogue for you, whatever your Trading Post level." },
    herald_s_licence: { item: "ascendant_uplifted_vestment", name: "Herald's Licence", tier: "ascendant", cls: "B", desc: "One badge a month is granted to you outright, chosen from what you are missing." },
    loaned_exhibit: { item: "ascendant_uplifted_clasp", name: "The Loaned Exhibit", tier: "ascendant", cls: "B", desc: "One collection piece you do not own counts as owned. You choose which." },
    chronicle: { item: "ascendant_uplifted_soles", name: "The Chronicle", tier: "ascendant", cls: "B", desc: "Anything you are first in the Den to do is written into the Live Feed under your name." },
    standing_ovation: { item: "ascendant_uplifted_veil", name: "The Standing Ovation", tier: "ascendant", cls: "B", desc: "A cheer pays you twice over — both times you cheer and when the hero lands their strike." },

    // ── ETERNAL ──
    hothouse_glass: { item: "eternal_wolf_crown", name: "Hothouse Glass", tier: "eternal", cls: "B", desc: "Your crops go into the ground already a third grown." },
    windfall_orchard: { item: "eternal_infinity", name: "Windfall Orchard", tier: "eternal", cls: "B", desc: "The first crop you harvest each day also drops a chest." },
    fallow_deed: { item: "eternal_eternal_blade", name: "The Fallow Deed", tier: "eternal", cls: "B", desc: "A plot left empty overnight yields double the next time you harvest it." },
    seed_drill: { item: "eternal_eternal_bulwark", name: "The Seed Drill", tier: "eternal", cls: "B", desc: "One harvest in four drops a second seed of what you planted." },
    fishmonger_s_standing_order: { item: "eternal_eternal_diadem", name: "The Fishmonger's Standing Order", tier: "eternal", cls: "B", desc: "One fish in three sells at the price of the next rarity up." },
    lantern: { item: "eternal_eternal_shroud", name: "The Lantern", tier: "eternal", cls: "A", desc: "Casts made while the shop is closed pay double." },
    dredge_net: { item: "eternal_eternal_binding", name: "The Dredge Net", tier: "eternal", cls: "B", desc: "One cast in four brings up treasure instead of a fish." },
    chummed_water: { item: "eternal_eternal_walkers", name: "The Chummed Water", tier: "eternal", cls: "B", desc: "Every fifth cast is refunded." },
    tithe_of_scales: { item: "eternal_eternal_pinions", name: "The Tithe of Scales", tier: "eternal", cls: "B", desc: "Every fish you land also gives a random chest fragment." },
    shipwright_s_debt: { item: "eternal_eternal_medallion", name: "The Shipwright's Debt", tier: "eternal", cls: "B", desc: "One boat upgrade in three costs you nothing." },
    beachhead: { item: "eternal_eternal_bond", name: "Beachhead", tier: "eternal", cls: "B", desc: "One dig site in three is already half uncovered when you arrive." },
    kraken_s_toll: { item: "eternal_undying_sabre", name: "The Kraken's Toll", tier: "eternal", cls: "B", desc: "Sea monsters you meet pay you to be left alone." },
    salvager_s_claim: { item: "eternal_undying_wall", name: "Salvager's Claim", tier: "eternal", cls: "B", desc: "One voyage in three comes home with a piece of gear in the hold." },
    shored_timbers: { item: "eternal_undying_veil", name: "Shored Timbers", tier: "eternal", cls: "B", desc: "The first collapse of each trip does nothing at all." },
    miner_s_lamp: { item: "eternal_undying_plate", name: "The Miner's Lamp", tier: "eternal", cls: "B", desc: "Your trips start at the depth you reached last time, not at the top." },
    assayer_s_eye: { item: "eternal_undying_sash", name: "Assayer's Eye", tier: "eternal", cls: "B", desc: "One haul in three comes back at the best grade it contained." },
    delver_s_rope: { item: "eternal_undying_greaves", name: "The Delver's Rope", tier: "eternal", cls: "B", desc: "A dungeon run that ends badly does not count against your run for the day." },
    warren_map: { item: "eternal_undying_cape", name: "The Warren Map", tier: "eternal", cls: "A", desc: "Every dungeon run has one extra floor before the boss." },
    banked_fire: { item: "eternal_undying_charm", name: "The Banked Fire", tier: "eternal", cls: "B", desc: "Every third cook consumes no ingredients." },
    prep_bench: { item: "eternal_undying_coil", name: "The Prep Bench", tier: "eternal", cls: "B", desc: "One prep in three yields an extra ingredient." },
    head_chef: { item: "eternal_timeless_cleaver", name: "The Head Chef", tier: "eternal", cls: "B", desc: "A cook never pays the bottom rung. The consolation is off your ladder." },
    cellar_key: { item: "eternal_timeless_orb", name: "The Cellar Key", tier: "eternal", cls: "B", desc: "One harvest or landing in three puts a second copy in your pantry." },
    jeweller_s_patience: { item: "eternal_timeless_hood", name: "Jeweller's Patience", tier: "eternal", cls: "B", desc: "One gem in three survives being pulled from its socket." },
    steady_bench: { item: "eternal_timeless_scale", name: "The Steady Bench", tier: "eternal", cls: "B", desc: "A failed fuse returns all three gems." },
    patron_of_works: { item: "eternal_timeless_waistguard", name: "Patron of Works", tier: "eternal", cls: "A", desc: "Gold you give to a town project counts double toward it." },
    free_company: { item: "eternal_timeless_tracks", name: "The Free Company", tier: "eternal", cls: "A", desc: "Your spoils ceiling on a town raid is doubled." },
    free_spin: { item: "eternal_timeless_cloak", name: "The Free Spin", tier: "eternal", cls: "A", desc: "Your first three spins each day cost nothing." },
    standing_streak: { item: "eternal_timeless_amulet", name: "The Standing Streak", tier: "eternal", cls: "A", desc: "Your check-in streak never breaks, and it counts double toward every streak reward." },
    master_key: { item: "eternal_timeless_signet", name: "The Master Key", tier: "eternal", cls: "B", desc: "One chest in three also gives you the chest one tier below it, to open yourself." },
    sorting_table: { item: "eternal_unending_scythe", name: "The Sorting Table", tier: "eternal", cls: "B", desc: "A chest that would pay you dust widens to the rarity above instead." },

    // ── CELESTIAL ──
    perennial_root: { item: "celestial_celestial_blade", name: "Perennial Root", tier: "celestial", cls: "B", desc: "One harvest in three returns the seed you planted." },
    nightsoil: { item: "celestial_celestial_bulwark", name: "Nightsoil", tier: "celestial", cls: "B", desc: "Every plant you put in the ground goes in already fertilized, free." },
    rain_barrel: { item: "celestial_celestial_diadem", name: "The Rain Barrel", tier: "celestial", cls: "B", desc: "It is always raining on your farm, whatever the sky is doing." },
    bumper_season: { item: "celestial_celestial_shroud", name: "Bumper Season", tier: "celestial", cls: "B", desc: "The first harvest you take each day pays double." },
    cold_frame: { item: "celestial_celestial_binding", name: "The Cold Frame", tier: "celestial", cls: "B", desc: "One crop in three ignores its grow time entirely and is ready the moment it goes in." },
    garden_path: { item: "celestial_celestial_walkers", name: "The Garden Path", tier: "celestial", cls: "B", desc: "Every decoration on your farm gives a buff, whatever its rarity — cosmetics included." },
    tide_table: { item: "celestial_celestial_pinions", name: "The Tide Table", tier: "celestial", cls: "B", desc: "Casts you don't use roll over. Bank up to a week and spend the lot at once." },
    full_creel: { item: "celestial_celestial_medallion", name: "The Full Creel", tier: "celestial", cls: "A", desc: "Your daily casts refresh at noon as well as at midnight." },
    long_haul: { item: "celestial_celestial_bond", name: "The Long Haul", tier: "celestial", cls: "B", desc: "One fish in four comes up two tiers rarer than it rolled." },
    trawl: { item: "celestial_starbound_sabre", name: "The Trawl", tier: "celestial", cls: "B", desc: "One cast in five lands the whole tier — one of every fish at that rarity." },
    deep_ballast: { item: "celestial_starbound_wall", name: "Deep Ballast", tier: "celestial", cls: "A", desc: "Four more digs' worth of stamina on every voyage." },
    prize_court: { item: "celestial_starbound_veil", name: "The Prize Court", tier: "celestial", cls: "B", desc: "One encounter in three pays its doubloons twice." },
    full_manifest: { item: "celestial_starbound_plate", name: "The Full Manifest", tier: "celestial", cls: "B", desc: "One voyage in three returns with an item from the Quartermaster's locker." },
    press_gang: { item: "celestial_starbound_sash", name: "The Press Gang", tier: "celestial", cls: "B", desc: "One voyage a day returns the moment you send it out." },
    long_vein: { item: "celestial_starbound_greaves", name: "The Long Vein", tier: "celestial", cls: "B", desc: "One seam in three pays out twice over." },
    assay_office: { item: "celestial_starbound_cape", name: "The Assay Office", tier: "celestial", cls: "B", desc: "One smelt in three costs no ore at all." },
    wide_seam: { item: "celestial_starbound_charm", name: "The Wide Seam", tier: "celestial", cls: "B", desc: "One seam in three comes out a grade richer than it rolled." },
    deep_cart: { item: "celestial_starbound_coil", name: "The Deep Cart", tier: "celestial", cls: "B", desc: "One trip in three brings back twice the ore." },
    gem_cutter_s_eye: { item: "celestial_astral_cleaver", name: "The Gem Cutter's Eye", tier: "celestial", cls: "B", desc: "One dungeon boss in two drops a gem." },
    big_pot: { item: "celestial_astral_orb", name: "The Big Pot", tier: "celestial", cls: "B", desc: "One cook in three makes more of whatever it made." },
    tasting_menu: { item: "celestial_astral_hood", name: "The Tasting Menu", tier: "celestial", cls: "B", desc: "One cook a day makes every dish you KNOW those ingredients could have made." },
    copper_pot: { item: "celestial_astral_scale", name: "The Copper Pot", tier: "celestial", cls: "B", desc: "One cook in four makes a second helping." },
    twice_struck: { item: "celestial_astral_waistguard", name: "Twice-Struck", tier: "celestial", cls: "B", desc: "One salvage in three returns double parts." },
    master_s_mark: { item: "celestial_astral_tracks", name: "The Master's Mark", tier: "celestial", cls: "B", desc: "One enhance in three counts as two levels instead of one." },
    whetstone: { item: "celestial_astral_cloak", name: "The Whetstone", tier: "celestial", cls: "B", desc: "One enhance a day is a guaranteed critical success." },
    twin_hinges: { item: "celestial_astral_amulet", name: "Twin Hinges", tier: "celestial", cls: "B", desc: "One chest a day gives its rewards twice." },
    day_s_double: { item: "celestial_astral_signet", name: "Day's Double", tier: "celestial", cls: "B", desc: "Your daily check-in pays out twice." },
    second_sitting: { item: "celestial_empyrean_scythe", name: "The Second Sitting", tier: "celestial", cls: "B", desc: "One time in three, your equipped pet's ability fires twice." },
    beast_s_share: { item: "celestial_empyrean_rampart", name: "The Beast's Share", tier: "celestial", cls: "A", desc: "Your equipped pet's ability works at the strength it would have one level higher." },
    shepherd_s_crook: { item: "celestial_empyrean_coronet", name: "The Shepherd's Crook", tier: "celestial", cls: "A", desc: "An enshrined pet's passive counts twice as well." },

    // ── PRIMORDIAL ──
    second_sowing: { item: "primordial_primordial_blade", name: "Second Sowing", tier: "primordial", cls: "A", desc: "Two extra plots, permanently." },
    long_furrow: { item: "primordial_primordial_bulwark", name: "The Long Furrow", tier: "primordial", cls: "A", desc: "No crop of yours ever takes longer than eight hours." },
    two_hooks: { item: "primordial_primordial_diadem", name: "Two Hooks", tier: "primordial", cls: "B", desc: "One cast in three lands a second fish." },
    press_ganged_crew: { item: "primordial_primordial_shroud", name: "Press-Ganged Crew", tier: "primordial", cls: "A", desc: "Voyages finish in half the time." },
    twice_landed: { item: "primordial_primordial_binding", name: "Twice-Landed", tier: "primordial", cls: "A", desc: "Every voyage makes landfall twice — two dig sites where there was one." },
    diviner_s_rod: { item: "primordial_primordial_walkers", name: "Diviner's Rod", tier: "primordial", cls: "A", desc: "Every dig site is buried with the most fragments it can hold." },
    chartwright: { item: "primordial_primordial_pinions", name: "Chartwright", tier: "primordial", cls: "A", desc: "It takes half as many fragments to complete a chest." },
    deep_key: { item: "primordial_primordial_medallion", name: "The Deep Key", tier: "primordial", cls: "A", desc: "You start every descent five floors down." },
    night_cage: { item: "primordial_primordial_bond", name: "The Night Cage", tier: "primordial", cls: "A", desc: "One extra trip a day, and the first bought trip costs nothing." },
    hot_stone: { item: "primordial_firstborn_sabre", name: "The Hot Stone", tier: "primordial", cls: "B", desc: "One cook in three comes out a tier better than the recipe." },
    cold_hammer: { item: "primordial_firstborn_wall", name: "The Cold Hammer", tier: "primordial", cls: "B", desc: "Every third enhance consumes no parts." },
    smith_s_certainty: { item: "primordial_firstborn_veil", name: "The Smith's Certainty", tier: "primordial", cls: "B", desc: "An enhance that fails costs you nothing and may be tried again at once." },
    attuned_bench: { item: "primordial_firstborn_plate", name: "The Attuned Bench", tier: "primordial", cls: "A", desc: "Every attunement you carry counts at double its level." },
    jeweller_s_eye: { item: "primordial_firstborn_sash", name: "The Jeweller's Eye", tier: "primordial", cls: "A", desc: "Every gem you have set counts as one tier higher than it is." },
    tempered_edge: { item: "primordial_firstborn_greaves", name: "The Tempered Edge", tier: "primordial", cls: "A", desc: "Your gear's enhancement bonuses count double." },
    deep_facet: { item: "primordial_firstborn_cape", name: "The Deep Facet", tier: "primordial", cls: "B", desc: "A gem set in one piece also gives its stat to the piece beside it." },
    locksmith: { item: "primordial_firstborn_charm", name: "The Locksmith", tier: "primordial", cls: "B", desc: "One chest in three opens a rarity higher." },
    long_day: { item: "primordial_firstborn_coil", name: "The Long Day", tier: "primordial", cls: "A", desc: "Every daily allowance in the game is one larger. Every single one." },
    long_vigil: { item: "primordial_elder_cleaver", name: "The Long Vigil", tier: "primordial", cls: "A", desc: "Your equipped pet earns pet XP at triple the rate." },
    second_bowl: { item: "primordial_elder_orb", name: "The Second Bowl", tier: "primordial", cls: "A", desc: "Your equipped pet's passive counts twice toward the menagerie total." },
    long_table: { item: "primordial_elder_hood", name: "The Long Table", tier: "primordial", cls: "A", desc: "Your menagerie ceiling is half again as high." },
    completionist_s_ledger: { item: "primordial_elder_scale", name: "The Completionist's Ledger", tier: "primordial", cls: "A", desc: "One piece of a set counts as two toward its tier bonuses." },
    seal_of_office: { item: "primordial_elder_waistguard", name: "The Seal of Office", tier: "primordial", cls: "B", desc: "A collection you have completed keeps paying if you lend a piece away." },
    long_service_record: { item: "primordial_elder_tracks", name: "The Long Service Record", tier: "primordial", cls: "A", desc: "Your ten best badges pay their bonus twice." },
    founder_s_plate: { item: "primordial_elder_cloak", name: "The Founder's Plate", tier: "primordial", cls: "B", desc: "One collection piece a week is delivered to you, chosen from what you are missing." },
};

/** power key -> the item that grants it. */
export const POWER_ITEM = Object.fromEntries(Object.entries(ASCENSION_POWERS).map(([k, v]) => [k, v.item]));
/** item id -> the power key it grants, for the gear card. */
export const ITEM_POWER = Object.fromEntries(Object.entries(ASCENSION_POWERS).map(([k, v]) => [v.item, k]));

export const powerFor = (itemId) => {
    const key = ITEM_POWER[String(itemId || "")];
    return key ? { key, ...ASCENSION_POWERS[key] } : null;
};

// ── READING THEM ─────────────────────────────────────────────────────────────────────────────────────────────
// Cached per request rather than per process. A member equips a piece and the next harvest has to know; a
// five-minute cache would make the whole system feel broken in exactly the way saved gun placements did.
const EMPTY = new Set();

/** Every power the member is currently WEARING, as a Set of keys. */
export async function equippedPowers(buyerId) {
    if (!buyerId) return EMPTY;
    const rows = await db
        .query(`SELECT item_id FROM mkt_user_equipment WHERE buyer_id = $1 AND item_id IS NOT NULL`, [buyerId])
        .catch(() => []);
    const out = new Set();
    for (const r of rows) {
        const key = ITEM_POWER[r.item_id];
        if (key) out.add(key);
    }
    return out;
}

/** Is this one power active right now? The question every consumer actually asks. */
export async function hasPower(buyerId, key) {
    if (!buyerId || !key) return false;
    return (await equippedPowers(buyerId)).has(key);
}

/**
 * A one-in-N roll, so every consumer spells the odds the same way.
 *
 * The powers are written in the house idiom — "one harvest in three returns its seed" — rather than as
 * percentages, and this is the only place that turns that phrase into a number. A consumer that rolled its own
 * Math.random() < 0.33 would drift from the card the first time anybody retuned it.
 */
export const oneIn = (n, rand = Math.random) => rand() < 1 / Math.max(1, n);

/** Both at once, for the common case. */
export async function powerRoll(buyerId, key, n, rand = Math.random) {
    return (await hasPower(buyerId, key)) && oneIn(n, rand);
}

// ── RATIONED POWERS ──────────────────────────────────────────────────────────────────────────────────────────
// "One chest a day gives its rewards twice." "One dish a day cooks itself." A dozen of the 120 are capped per
// day, and none of the systems they touch had anywhere to record that.
//
// claimPowerUse is the whole mechanism: it asks for one use and either gets it or does not. ATOMIC by design —
// the INSERT ... ON CONFLICT DO UPDATE ... WHERE is what stops two taps in the same second both being told yes,
// which is exactly how a "once a day" power becomes a twice-a-day power on a flaky connection.
//
// It returns false when the power is not equipped, so a caller never has to ask twice:
//
//     if (await claimPowerUse(buyerId, "twin_hinges")) rewards = rewards.concat(rewards);
//
export async function claimPowerUse(buyerId, key, perDay = 1) {
    if (!buyerId || !key) return false;
    if (!(await hasPower(buyerId, key))) return false;
    const row = await db.queryOne(
        `INSERT INTO mkt_power_use (buyer_id, power_key, day, used)
         VALUES ($1, $2, (NOW() AT TIME ZONE 'America/Chicago')::date, 1)
         ON CONFLICT (buyer_id, power_key, day)
         DO UPDATE SET used = mkt_power_use.used + 1, updated_at = NOW()
           WHERE mkt_power_use.used < $3
         RETURNING used`,
        [buyerId, key, Math.max(1, perDay)]
    ).catch(() => null);
    return Boolean(row);
}

/** How many uses are left today, for a card that wants to say so. Never claims. */
export async function powerUsesLeft(buyerId, key, perDay = 1) {
    if (!buyerId || !key) return 0;
    if (!(await hasPower(buyerId, key))) return 0;
    const row = await db.queryOne(
        `SELECT used FROM mkt_power_use
          WHERE buyer_id = $1 AND power_key = $2 AND day = (NOW() AT TIME ZONE 'America/Chicago')::date`,
        [buyerId, key]
    ).catch(() => null);
    return Math.max(0, Math.max(1, perDay) - (Number(row?.used) || 0));
}
