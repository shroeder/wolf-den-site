// Encounter KINDS, in their own module so the four event decks and the catalog can both import them without
// either importing the other. `fight` and `mimic` are the only ones that can kill you outright; the rest are
// texture, reward, or a gamble you chose to take.
export const KIND = {
    fight: "fight",       // a foe: trade blows, take damage, win loot
    boss: "boss",         // the tenth floor, always
    chest: "chest",       // free loot
    mimic: "mimic",       // looks like a chest, bites: a fight you didn't choose
    merchant: "merchant", // spend gold on a potion or a trinket
    well: "well",         // gamble: toss a coin for a blessing or a curse
    shrine: "shrine",     // heal, or trade health for reward
    trap: "trap",         // flat damage, no fight
    rest: "rest",         // a quiet floor: small heal
    cache: "cache",       // gold
    puzzle: "puzzle",     // a choice with two outcomes
};
