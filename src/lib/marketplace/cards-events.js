// ── THE ROOMS THAT ARE NOT FIGHTS ────────────────────────────────────────────────────────────────────────
// A fifth of their map is a question mark, and the reason that works — the reason it is the room a player
// most wants to walk into — is that behind most of them is an EVENT: a short piece of writing and two or
// three choices, most of which pay. Ours resolved a question mark into a chest, a fire, a shop or a fight,
// which meant the mark was decoration: the map already had all four of those rooms with honest labels on
// them.
//
// It is not only atmosphere. A simulator over four hundred full runs put the hole in numbers: with the
// monsters set to theirs exactly, elites were ending a third of the runs that met one and bosses four
// fifths, because a hero arrived at the wall with no reserve. Their events ARE that reserve — the healing,
// the odd trinket, the max health, the money — and they are where a run gets the thing that makes it
// different from the last one. This is the missing half of the act.
//
// PURE, like the rules and the map: an event is data plus a seed. The server owns what a choice DOES (it
// needs the perk table and the deck), the screen owns how it reads, and this file owns what exists.
import {
    PERKS, PERK_IDS, POOL, POTIONS, POTION_IDS, STARTER_DECK, STATUS_IDS, takePerk,
    beltSize, canUpgrade, cardById, nextRand, upgradedId,
} from "@/lib/marketplace/cards-kit.js";

// ── WHAT A CHOICE CAN DO ─────────────────────────────────────────────────────────────────────────────────
// The vocabulary is deliberately small and every word of it is one of theirs:
//   hp / hpPct   heal or hurt, flat or as a share of the bar (their events use both)
//   maxHp        the bar itself — the strongest thing an act-one event can hand over
//   embers       money
//   potion       a bottle, rolled from the same list a chest rolls from
//   perk         a trinket, rolled from the ones you are not already carrying
//   maybePerk    a trinket at odds — the escalating rooms, where the third reach is nearly certain
//   card         a card INTO the deck, named. This is how a curse arrives.
//   upgrade      n cards sharpened, taken at random from what can still take it
//   remove       the screen asks which card, and it leaves the deck for good
//   copy         the screen asks which card, and a second one goes in beside it (their Duplicator)
//   transform    the screen asks which card, and something else comes back instead (their Transmogrifier)
//   cleanse      every piece of junk their enemies dealt you leaves at once (their Divine Fountain)
//   upgradeAll   sharpen every copy of the cards you started with (their Ancient Writing)
//   gamble       a weighted list of outcomes, one of which happens (their Wheel of Change, their Joust)
//   fight        the room becomes that fight, and pays for it
//   wake         the odds this choice ends in the fight the room has been threatening
// A choice may carry several at once, which is what makes the good ones a trade rather than a gift.

// ── THE FOUR ROOMS THAT ASK YOU SOMETHING ────────────────────────────────────────────────────────────────
// Burning, sharpening, copying and changing all need to know WHICH card, so all four stop and put the deck
// on screen. What each one calls itself lives here rather than in the screen, because the screen held a
// pair of ternaries — remove, or else sharpen — and a third kind of asking would have shown a room that
// asked politely and then offered the wrong verb on every plate.
//
// `can` is the test for one card. Only sharpening has one: everything else can be done to anything on the
// table, junk included.
// `forge` is which of the two ceremonies plays while the server answers — the anvil or the fire. Copying is
// work done TO a card so it takes the anvil; changing destroys the one you picked, so it takes the fire.
export const CHOOSE = {
    remove: { title: "Which one goes.", verb: "Burn", forge: "burn", can: () => true },
    upgrade: { title: "Which one takes the edge.", verb: "Sharpen", forge: "sharpen", can: (id) => canUpgrade(id) },
    copy: { title: "Which one comes twice.", verb: "Copy", forge: "sharpen", can: () => true },
    transform: { title: "Which one changes.", verb: "Change", forge: "burn", can: () => true },
};

export const EVENTS = [
    // ── THE BIG FISH ─────────────────────────────────────────────────────────────────────────────────────
    // Theirs: a banana that heals, a donut that raises the bar, and a box that pays a relic and a curse. The
    // shape is three gifts of ascending greed, and it is the first event most people ever meet.
    {
        id: "tidepool", act: 1, name: "The Tide Pool", icon: "fish",
        say: "Something has been living in this water a long time. It has eaten everything else that tried.",
        choices: [
            { label: "Eat your fill", detail: "Heal a quarter of your health.", effect: { hpPct: 0.25 } },
            { label: "Swallow the pearl", detail: "+7 max health.", effect: { maxHp: 7 } },
            { label: "Take the shell it guards", detail: "A trinket, and a Wound in your deck.", effect: { perk: 1, card: "wound" } },
        ],
    },

    // ── THE CLERIC ───────────────────────────────────────────────────────────────────────────────────────
    // Heal, or purify, or leave — and both cost money, which is what makes the merchant two rooms later a
    // different decision. Ours is the woman who sets the bones of everything that comes back up the road.
    {
        id: "bonesetter", act: 0, name: "The Bonesetter", icon: "splint",
        say: "She has a needle, a jar of something grey, and no opinion about how you got like this.",
        choices: [
            { label: "Be patched up", detail: "Pay 45 embers. Heal a third.", cost: 45, effect: { hpPct: 0.34 } },
            { label: "Have a card cut out", detail: "Pay 75 embers. Burn a card.", cost: 75, effect: { remove: 1 } },
            { label: "Say you are fine", detail: "Walk on.", effect: {} },
        ],
    },

    // ── DEAD ADVENTURER ──────────────────────────────────────────────────────────────────────────────────
    // Their best-shaped event: search a body, and every search is worth more than the last and likelier to
    // wake the thing that killed him. Ours escalates the same way and the last one always wakes it.
    {
        id: "fallen", act: 1, name: "The Fallen Runner", icon: "corpse",
        say: "He got further than most. Whatever stopped him is still close enough to smell.",
        choices: [
            { label: "Search his pack", detail: "60 embers. Something is listening.", again: true, effect: { embers: 60, wake: 0.25 } },
            { label: "Search his belt", detail: "A potion. Something is closer.", again: true, effect: { potion: 1, wake: 0.55 } },
            { label: "Take his charm", detail: "A trinket. It has found you.", again: true, effect: { perk: 1, wake: 1 } },
            { label: "Leave him be", detail: "Walk on.", effect: {} },
        ],
    },

    // ── THE GILDED IDOL ──────────────────────────────────────────────────────────────────────────────────
    // Take the shiny thing and the floor gives way. The trade every player makes once and remembers.
    {
        id: "gildedegg", act: 0, name: "The Gilded Egg", icon: "egg",
        say: "It is far too heavy to be an egg, and it is sitting on a plate that is very slightly raised.",
        choices: [
            { label: "Take it", detail: "A trinket and 120 embers. Something gives way under you.", effect: { perk: 1, embers: 120, hpPct: -0.16 } },
            { label: "Leave it where it sits", detail: "Walk on.", effect: {} },
        ],
    },

    // ── WORLD OF GOO ─────────────────────────────────────────────────────────────────────────────────────
    // Money for health, flat and honest. The one event whose whole job is to be a price.
    {
        id: "mire", act: 0, name: "The Mire", icon: "goo",
        say: "There are coins in it. There are also several things that used to be reaching for the coins.",
        choices: [
            { label: "Reach in", detail: "Lose 11 health. Take 95 embers.", effect: { hp: -11, embers: 95 } },
            { label: "Keep your arm", detail: "Walk on.", effect: {} },
        ],
    },

    // ── SHINING LIGHT ────────────────────────────────────────────────────────────────────────────────────
    // Two cards sharpened for a fifth of the bar: the event that turns a bad run into a good deck, and the
    // reason a player took a fire as a smith three rooms back.
    {
        id: "coalpit", act: 0, name: "The Coal Pit", icon: "anvil",
        say: "The heat comes up through the floor. Hold something in it long enough and it comes out better.",
        choices: [
            { label: "Hold two cards in it", detail: "Sharpen 2 cards. Lose a fifth of your health.", effect: { upgrade: 2, hpPct: -0.2 } },
            { label: "Step around it", detail: "Walk on.", effect: {} },
        ],
    },

    // ── BONFIRE SPIRITS ──────────────────────────────────────────────────────────────────────────────────
    // A card for a trinket. Removal is the strongest purchase in their game, and this is the free one.
    {
        id: "offering", act: 0, name: "The Offering", icon: "flame",
        say: "The fire has been kept up by people who wanted something. It is still hungry.",
        choices: [
            { label: "Feed it a card", detail: "Burn a card. Take a trinket.", effect: { remove: 1, perk: 1 } },
            { label: "Warm your hands and go", detail: "Heal 12.", effect: { hp: 12 } },
        ],
    },

    // ── THE SERPENT ──────────────────────────────────────────────────────────────────────────────────────
    // A large amount of money for a card you did not want: the purest curse-for-gold in their game.
    {
        id: "serpent", act: 0, name: "The Long Serpent", icon: "snake",
        say: "It speaks well, for something with no lips. It is offering you a gift, it says, and it is not lying.",
        choices: [
            { label: "Take the purse", detail: "180 embers, and a Wound in your deck.", effect: { embers: 180, card: "wound" } },
            { label: "Refuse politely", detail: "Walk on.", effect: {} },
        ],
    },

    // ── THE MUSHROOM RING ────────────────────────────────────────────────────────────────────────────────
    // Fight them for a trinket, or eat one and take the curse. A real fight behind one door is what stops a
    // question mark from being a free room.
    {
        id: "ringcaps", act: 1, name: "The Mushroom Ring", icon: "mushroom",
        say: "They are arranged in a circle, and they are all facing you, which mushrooms should not be able to do.",
        choices: [
            { label: "Stamp them out", detail: "A fight. A trinket if you win.", effect: { fight: "two_fungi", perk: 1 } },
            { label: "Eat one", detail: "Heal a quarter. Something disagrees with you.", effect: { hpPct: 0.25, card: "slimed" } },
        ],
    },

    // ── THE UPGRADE SHRINE ───────────────────────────────────────────────────────────────────────────────
    // Theirs, straight: one card, free, no cost and no catch. Not every room should be a trade.
    {
        id: "shrine", act: 0, name: "The Whetstone Shrine", icon: "shrine",
        say: "A flat stone, worn into a curve by everything that has ever been drawn across it.",
        choices: [
            { label: "Sharpen a card", detail: "Upgrade one card.", effect: { upgrade: 1 } },
            { label: "Leave the shrine alone", detail: "Walk on.", effect: {} },
        ],
    },

    // ── THE SCRAP OOZE ───────────────────────────────────────────────────────────────────────────────────
    // Reach into the thing, hurting yourself, until it pays. Theirs gets likelier every time you try, which
    // is the whole hook: the third reach is the one you make against your own judgement.
    {
        id: "ooze", act: 0, name: "The Scrap Ooze", icon: "ooze",
        say: "There is metal in it. Some of the metal is moving on its own.",
        choices: [
            { label: "Reach in", detail: "Lose 4 health. It might hold a trinket.", again: true, effect: { hp: -4, maybePerk: 0.3 } },
            { label: "Reach in again", detail: "Lose 4 health. Likelier now.", again: true, effect: { hp: -4, maybePerk: 0.55 } },
            { label: "Once more", detail: "Lose 4 health. It is nearly certain.", again: true, effect: { hp: -4, maybePerk: 0.85 } },
            { label: "Wipe your hand and go", detail: "Walk on.", effect: {} },
        ],
    },

    // ── THE LIVING WALL ──────────────────────────────────────────────────────────────────────────────────
    // Sharpen, burn, or add. Three ways to change a deck in one room, which is the room a player with a bad
    // opening hand has been waiting for.
    {
        id: "oldwall", act: 0, name: "The Old Wall", icon: "wall",
        say: "There are names cut into it, layers deep. Some of them are still being cut.",
        choices: [
            { label: "Cut a name deeper", detail: "Upgrade a card.", effect: { upgrade: 1 } },
            { label: "Scratch one out", detail: "Burn a card.", effect: { remove: 1 } },
            { label: "Add your own", detail: "+9 max health.", effect: { maxHp: 9 } },
        ],
    },

    // ── THE DROWNED SHRINE ── act two ────────────────────────────────────────────────────────────────────
    {
        id: "drowned_shrine", act: 2, name: "The Drowned Shrine", icon: "shrine",
        say: "It has been underwater a long time and it is still lit, which is the part worth worrying about.",
        choices: [
            { label: "Give it your blood", detail: "Lose a fifth of your health. Take a trinket.", effect: { hpPct: -0.2, perk: 1 } },
            { label: "Give it a card", detail: "Burn a card. Heal a third.", effect: { remove: 1, hpPct: 0.34 } },
            { label: "Give it nothing", detail: "Walk on.", effect: {} },
        ],
    },

    // ── ACT TWO ── theirs: the City's rooms trade in the BAR and in the deck rather than in small change,
    // because by act two a health total is a resource you spend rather than one you protect.
    {
        id: "vampires", act: 2, name: "The Pale Company", icon: "fang",
        say: "They are very polite about it. They have clearly had this conversation before, many times.",
        choices: [
            { label: "Let them", detail: "Lose 8 max health. Take a card that drinks.", effect: { maxHp: -8, card: "reaper" } },
            { label: "Keep your blood", detail: "Walk on.", effect: {} },
        ],
    },
    {
        id: "tollgate", act: 2, name: "The Toll", icon: "goo",
        say: "Something has strung a chain across the passage and is waiting behind it, patiently, for payment.",
        choices: [
            { label: "Pay the toll", detail: "Pay 140 embers. It lets you by, and gives you a bottle for the trouble.", cost: 140, effect: { potion: 1 } },
            { label: "Refuse", detail: "A fight.", effect: { fight: "d_thieves" } },
        ],
    },
    {
        id: "sunken_library", act: 2, name: "The Sunken Library", icon: "wall",
        say: "Most of it has been ruined by the water. Three or four of the pages are still worth the swim.",
        choices: [
            { label: "Read one properly", detail: "Sharpen a card.", effect: { upgrade: 1 } },
            { label: "Tear one out", detail: "Burn a card. +40 embers.", effect: { remove: 1, embers: 40 } },
            { label: "Take what floats", detail: "A potion and 60 embers.", effect: { potion: 1, embers: 60 } },
        ],
    },
    {
        id: "knowing_skull", act: 2, name: "The Knowing Skull", icon: "corpse",
        say: "It answers questions. It charges for them in the only currency it can actually carry away.",
        choices: [
            { label: "Ask for money", detail: "Lose 8 health. +120 embers.", again: true, effect: { hp: -8, embers: 120 } },
            { label: "Ask for a bottle", detail: "Lose 8 health. A potion.", again: true, effect: { hp: -8, potion: 1 } },
            { label: "Ask for its charm", detail: "Lose 12 health. A trinket.", again: true, effect: { hp: -12, perk: 1 } },
            { label: "Stop asking", detail: "Walk on.", effect: {} },
        ],
    },

    // ── ACT THREE ── theirs deal in whole runs: a bar, a boss, a deck rebuilt.
    {
        id: "long_fall", act: 3, name: "The Long Fall", icon: "goo",
        say: "The stair simply stops. There is a long way down and something at the bottom of it that glitters.",
        choices: [
            { label: "Climb down for it", detail: "Lose a quarter of your health. Take a trinket.", effect: { hpPct: -0.25, perk: 1 } },
            { label: "Jump", detail: "Lose a third of your health. Two trinkets' worth: a trinket and 200 embers.", effect: { hpPct: -0.34, perk: 1, embers: 200 } },
            { label: "Find another way round", detail: "Walk on.", effect: {} },
        ],
    },
    {
        id: "moai", act: 3, name: "The Stone Head", icon: "shrine",
        say: "It is far too large to have been carried up here, and there is no sign it was ever carved in place.",
        choices: [
            { label: "Rest in its shadow", detail: "Heal fully. Lose 10 max health.", effect: { hpPct: 1, maxHp: -10 } },
            { label: "Put your hand in its mouth", detail: "Sharpen 2 cards. Lose a fifth of your health.", effect: { upgrade: 2, hpPct: -0.2 } },
            { label: "Leave it alone", detail: "Walk on.", effect: {} },
        ],
    },
    {
        id: "winding_halls", act: 3, name: "The Winding Halls", icon: "wall",
        say: "You have been here before. You are fairly sure you have been here before.",
        choices: [
            { label: "Take the long way", detail: "Heal a third.", effect: { hpPct: 0.34 } },
            { label: "Take the short way", detail: "Lose 18 health. +2 max health and a Wound in your deck.", effect: { hp: -18, maxHp: 2, card: "wound" } },
            { label: "Stop and think", detail: "Burn a card.", effect: { remove: 1 } },
        ],
    },
    {
        id: "mind_bloom", act: 3, name: "The Bloom", icon: "eye",
        say: "It shows you the thing you came up here to do, and offers to let you skip to the end of it.",
        choices: [
            { label: "Take the fight now", detail: "An elite. A trinket if you win.", effect: { fight: "the_headsman", perk: 1 } },
            { label: "Take the easy road", detail: "300 embers, and a Wound in your deck.", effect: { embers: 300, card: "wound" } },
            { label: "Refuse it", detail: "Heal a quarter.", effect: { hpPct: 0.25 } },
        ],
    },

    // ── THE WATCHER ── act three ─────────────────────────────────────────────────────────────────────────
    {
        id: "spire_watcher", act: 3, name: "The Watcher", icon: "eye",
        say: "It has been counting the things that come up the stair. It knows exactly how far you have got.",
        choices: [
            { label: "Let it look at you", detail: "Sharpen 2 cards. Lose a fifth of your health.", effect: { upgrade: 2, hpPct: -0.2 } },
            { label: "Bargain", detail: "220 embers, and a Wound in your deck.", effect: { embers: 220, card: "wound" } },
            { label: "Climb past", detail: "Walk on.", effect: {} },
        ],
    },
    // ══ THE SHRINES ══════════════════════════════════════════════════════════════════════════════════════
    // Their fourteen "anywhere" rooms are the spine of the question mark: they are the ones that let a run be
    // FIXED rather than only fed. A deck gets worse on its own — every fight offers cards and most of them
    // are worse than the ones you have — so a map with no purifier, no forge and no fountain is a map where
    // the only direction is down. All of these carry act 0, which is this file's word for anywhere.
    {
        id: "clearspring", act: 0, name: "The Clear Spring", icon: "shrine",
        say: "Water comes up through the floor here, and it is the only clean thing you have seen since you started climbing.",
        choices: [
            { label: "Drink your fill", detail: "Every piece of junk leaves your deck.", effect: { cleanse: true } },
            { label: "Fill a skin and go", detail: "Heal a fifth.", effect: { hpPct: 0.2 } },
        ],
    },
    {
        id: "secondmould", act: 0, name: "The Second Mould", icon: "anvil",
        say: "A stone press, still warm. Whatever you lay in it, it makes again — and it has been doing this for a very long time without being asked.",
        choices: [
            { label: "Press a card", detail: "A second copy, into your deck.", effect: { copy: 1 } },
            { label: "Leave it cooling", detail: "Walk on.", effect: {} },
        ],
    },
    {
        id: "embershrine", act: 0, name: "The Ember Shrine", icon: "flame",
        say: "Somebody has been leaving money here. Quite a lot of it, and for quite a long time, and none of them came back for it.",
        choices: [
            { label: "Take a handful", detail: "+120 embers.", effect: { embers: 120 } },
            { label: "Take all of it", detail: "+300 embers, and a Wound in your deck.", effect: { embers: 300, card: "wound" } },
            { label: "Leave it where it is", detail: "Walk on.", effect: {} },
        ],
    },
    {
        id: "stillroom", act: 0, name: "The Still Room", icon: "shrine",
        say: "Racks of bottles, most of them broken, three of them not. Whoever was distilling here left in a hurry.",
        choices: [
            { label: "Take what survived", detail: "Three bottles.", effect: { potion: 3 } },
            { label: "Leave them", detail: "Walk on.", effect: {} },
        ],
    },
    {
        id: "changingstone", act: 0, name: "The Changing Stone", icon: "shrine",
        say: "Lay something on it and something else gets up. It does not take requests.",
        choices: [
            { label: "Lay a card on it", detail: "It leaves. Something else arrives.", effect: { transform: 1 } },
            { label: "Keep your hands to yourself", detail: "Walk on.", effect: {} },
        ],
    },
    {
        id: "scouring", act: 0, name: "The Scouring", icon: "flame",
        say: "A narrow fire in a narrow room. It burns one thing and then it goes out, and it has been waiting.",
        choices: [
            { label: "Burn a card", detail: "It leaves your deck for good.", effect: { remove: 1 } },
            { label: "Let it wait", detail: "Walk on.", effect: {} },
        ],
    },
    {
        id: "turningwheel", act: 0, name: "The Turning Wheel", icon: "shrine",
        say: "A painted wheel on a spindle, worn smooth on one side by hands. There is no attendant and no rules written anywhere.",
        choices: [
            {
                label: "Spin it",
                detail: "Something happens. Nobody knows which.",
                effect: {
                    gamble: [
                        { w: 2, say: "It stops on the coins.", embers: 240 },
                        { w: 2, say: "It stops on the open hand.", perk: 1 },
                        { w: 2, say: "It stops on the bottle.", potion: 1 },
                        { w: 2, say: "It stops on the heart.", maxHp: 6 },
                        { w: 2, say: "It stops on the closed eye.", hpPct: -0.15 },
                        { w: 1, say: "It stops on the broken tooth.", card: "wound" },
                    ],
                },
            },
            { label: "Leave it still", detail: "Walk on.", effect: {} },
        ],
    },
    {
        id: "olddebt", act: 0, name: "The Old Debt", icon: "corpse",
        say: "It knows your name and it is very pleased about that. It says you have owed it something since before you started.",
        choices: [
            { label: "Pay it off", detail: "Pay 150 embers. A trinket.", cost: 150, effect: { perk: 1 } },
            { label: "Pay it in blood", detail: "Lose 14 health. A trinket.", effect: { hp: -14, perk: 1 } },
            { label: "Tell it to wait", detail: "Walk on.", effect: {} },
        ],
    },
    {
        id: "bottler", act: 0, name: "The Bottler", icon: "shrine",
        say: "She does not sell cards and she does not want to talk about the Road. She sells bottles.",
        choices: [
            { label: "Buy one", detail: "Pay 60 embers. A bottle.", cost: 60, effect: { potion: 1 } },
            { label: "Buy the armful", detail: "Pay 150 embers. Three bottles.", cost: 150, effect: { potion: 3 } },
            { label: "Nothing today", detail: "Walk on.", effect: {} },
        ],
    },
    {
        id: "blackanvil", act: 0, name: "The Black Anvil", icon: "anvil",
        say: "Cold, and it has not been cold long. The tongs on the hook are worth more than the anvil.",
        choices: [
            { label: "Use the anvil", detail: "Sharpen a card.", effect: { upgrade: 1 } },
            { label: "Take the tongs", detail: "A trinket, and a Wound in your deck.", effect: { perk: 1, card: "wound" } },
            { label: "Touch nothing", detail: "Walk on.", effect: {} },
        ],
    },
    {
        id: "watchfire", act: 0, name: "The Watchfire", icon: "flame",
        say: "Someone laid this fire properly and then did not come back to it. It will take one more thing before it goes out.",
        choices: [
            { label: "Feed it a card", detail: "It leaves your deck. A bottle from the ashes.", effect: { remove: 1, potion: 1 } },
            { label: "Warm your hands", detail: "Heal a sixth.", effect: { hpPct: 0.16 } },
        ],
    },
    {
        id: "draughtsman", act: 0, name: "The Draughtsman", icon: "anvil",
        say: "He works on other people's decks for money and has strong opinions about yours, none of which he will share for free.",
        choices: [
            { label: "Pay him to sharpen one", detail: "Pay 90 embers. Sharpen a card.", cost: 90, effect: { upgrade: 1 } },
            { label: "Pay him to cut one out", detail: "Pay 120 embers. Burn a card.", cost: 120, effect: { remove: 1 } },
            { label: "Pay him for a morning", detail: "Pay 190 embers. Two cards come out sharper.", cost: 190, effect: { upgrade: 2 } },
            { label: "Keep your money", detail: "Walk on.", effect: {} },
        ],
    },
    {
        id: "maskseller", act: 0, name: "The Mask Seller", icon: "eye",
        say: "The masks are all faces. Some of them are faces you recognise, which he does not explain.",
        choices: [
            { label: "Wear one", detail: "Lose a sixth of your health. A trinket.", effect: { hpPct: -0.16, perk: 1 } },
            { label: "Sell him yours", detail: "+90 embers.", effect: { embers: 90 } },
            { label: "Keep your face", detail: "Walk on.", effect: {} },
        ],
    },

    // ══ ACT ONE ══════════════════════════════════════════════════════════════════════════════════════════
    {
        id: "litseam", act: 1, name: "The Lit Seam", icon: "flame",
        say: "There is light coming out of the rock itself, and standing in it makes your teeth ache.",
        choices: [
            { label: "Stand in it", detail: "Two cards come out sharper. Lose a fifth of your health.", effect: { upgrade: 2, hpPct: -0.2 } },
            { label: "Shield your eyes and pass", detail: "Walk on.", effect: {} },
        ],
    },
    {
        id: "stonewing", act: 1, name: "The Stone Wing", icon: "wall",
        say: "A carved wing set into the wall at head height, the edge of every feather still sharp enough to open a hand.",
        choices: [
            { label: "Cut yourself on it", detail: "Lose 8 health. Burn a card.", effect: { hp: -8, remove: 1 } },
            { label: "Walk past it", detail: "Walk on.", effect: {} },
        ],
    },

    // ══ ACT TWO ══════════════════════════════════════════════════════════════════════════════════════════
    {
        id: "carvedpage", act: 2, name: "The Carved Page", icon: "wall",
        say: "One page of a book, cut into the wall so it could not be taken. It is instructions, and they are for you.",
        choices: [
            { label: "Read it through", detail: "Every card you came in with takes an edge.", effect: { upgradeAll: true } },
            { label: "Chip a piece out", detail: "Burn a card.", effect: { remove: 1 } },
        ],
    },
    {
        id: "grafter", act: 2, name: "The Grafter", icon: "splint",
        say: "He works on people rather than gear, and he is very good, and his waiting room is empty for a reason.",
        choices: [
            { label: "Let him work", detail: "+10 max health. Lose 12 health.", effect: { maxHp: 10, hp: -12 } },
            { label: "Take the jar instead", detail: "Two bottles.", effect: { potion: 2 } },
            { label: "Take what is on the shelf", detail: "A trinket, and a Wound in your deck.", effect: { perk: 1, card: "wound" } },
        ],
    },
    {
        id: "thepit", act: 2, name: "The Pit", icon: "fang",
        say: "A ring of stone seats around a floor with a drain in it. Something down there has heard you arrive.",
        choices: [
            { label: "Go down", detail: "An elite. A trinket if you win.", effect: { fight: "d_elite_leader", perk: 1 } },
            { label: "Climb the seats and leave", detail: "Walk on.", effect: {} },
        ],
    },
    {
        id: "quietones", act: 2, name: "The Quiet Ones", icon: "corpse",
        say: "They do not want to hurt you. They want you to stop carrying so much, and they are willing to help with that.",
        choices: [
            { label: "Let them lighten you", detail: "-18 max health. A trinket.", effect: { maxHp: -18, perk: 1 } },
            { label: "Walk through them", detail: "Walk on.", effect: {} },
        ],
    },
    {
        id: "blackbook", act: 2, name: "The Black Book", icon: "wall",
        say: "It is open at a page somebody stopped reading. The next page is heavier than the one before it.",
        choices: [
            { label: "Read a page", detail: "Lose 6 health.", again: true, effect: { hp: -6 } },
            { label: "Read another", detail: "Lose 6 health.", again: true, effect: { hp: -6 } },
            { label: "Read to the end", detail: "Lose 12 health. A trinket.", effect: { hp: -12, perk: 1 } },
            { label: "Shut it", detail: "Walk on.", effect: {} },
        ],
    },
    {
        id: "rustaltar", act: 2, name: "The Rust Altar", icon: "shrine",
        say: "The stains on it are old and the stone under them is not. Something is still being fed here.",
        choices: [
            { label: "Give it what it wants", detail: "-8 max health. A trinket.", effect: { maxHp: -8, perk: 1 } },
            { label: "Break it", detail: "Lose a sixth of your health. +160 embers.", effect: { hpPct: -0.16, embers: 160 } },
            { label: "Step around it", detail: "Walk on.", effect: {} },
        ],
    },
    {
        id: "thewager", act: 2, name: "The Wager", icon: "fang",
        say: "Two of them are going to fight and everyone here has an opinion about which. The big one is favoured. The small one is calm.",
        choices: [
            {
                label: "Back the small one", detail: "Pay 100 embers. Long odds.", cost: 100,
                effect: {
                    gamble: [
                        { w: 1, say: "The small one does not move until it has to.", embers: 380 },
                        { w: 2, say: "It was over before you looked up.", embers: 0 },
                    ],
                },
            },
            {
                label: "Back the big one", detail: "Pay 100 embers. Short odds.", cost: 100,
                effect: {
                    gamble: [
                        { w: 2, say: "It goes the way everyone said it would.", embers: 170 },
                        { w: 1, say: "The big one goes down in the first exchange.", embers: 0 },
                    ],
                },
            },
            { label: "Watch for free", detail: "Walk on.", effect: {} },
        ],
    },
    {
        id: "stonecoffin", act: 2, name: "The Stone Coffin", icon: "corpse",
        say: "The lid has been moved before and put back badly. Whoever did that is not in the room.",
        choices: [
            { label: "Open it", detail: "A trinket, and a Wound in your deck.", effect: { perk: 1, card: "wound" } },
            { label: "Leave it shut", detail: "Walk on.", effect: {} },
        ],
    },
    {
        id: "rookery", act: 2, name: "The Rookery", icon: "fang",
        say: "Nests all the way up the shaft, and they have been lining them with things taken off the dead.",
        choices: [
            { label: "Rob the nests", detail: "+220 embers.", effect: { embers: 220 } },
            { label: "Take the knife you can see", detail: "Lose 8 health. A trinket.", effect: { hp: -8, perk: 1 } },
        ],
    },
    {
        id: "beggar", act: 2, name: "The Beggar", icon: "corpse",
        say: "He is not begging. He is offering, and what he is offering is to take something off you.",
        choices: [
            { label: "Pay him", detail: "Pay 90 embers. Burn a card.", cost: 90, effect: { remove: 1 } },
            { label: "Walk past", detail: "Walk on.", effect: {} },
        ],
    },
    {
        id: "kneelingman", act: 2, name: "The Kneeling Man", icon: "corpse",
        say: "He has been kneeling long enough that the floor has taken the shape of him. He is holding something out.",
        choices: [
            { label: "Give him what he asks", detail: "Pay 130 embers. A trinket.", cost: 130, effect: { perk: 1 } },
            { label: "Take it off him", detail: "+130 embers, and a Wound in your deck.", effect: { embers: 130, card: "wound" } },
            { label: "Walk past", detail: "Walk on.", effect: {} },
        ],
    },

    // ══ ACT THREE ════════════════════════════════════════════════════════════════════════════════════════
    {
        id: "thesphere", act: 3, name: "The Sphere", icon: "eye",
        say: "It hangs at chest height without anything holding it, and it has been turning very slowly since before you came in.",
        choices: [
            { label: "Break it open", detail: "A fight. A trinket if you win.", effect: { fight: "s_orb", perk: 1 } },
            { label: "Walk under it", detail: "Walk on.", effect: {} },
        ],
    },
    {
        id: "listeningstone", act: 3, name: "The Listening Stone", icon: "shrine",
        say: "It wants a hand on it. It is not clear what it does with what it takes, only that it takes.",
        choices: [
            { label: "One hand", detail: "Lose 7 health. A bottle.", again: true, effect: { hp: -7, potion: 1 } },
            { label: "Both hands", detail: "Lose 12 health. Two bottles.", effect: { hp: -12, potion: 2 } },
            { label: "Step back", detail: "Walk on.", effect: {} },
        ],
    },
    {
        id: "redmask", act: 3, name: "The Red Mask", icon: "eye",
        say: "It is on a stone at eye height, facing the way you came in, and it has been waiting for somebody exactly your size.",
        choices: [
            { label: "Wear it", detail: "-10 max health. A trinket.", effect: { maxHp: -10, perk: 1 } },
            { label: "Leave it on the stone", detail: "Walk on.", effect: {} },
        ],
    },

];

export const eventById = (id) => EVENTS.find((e) => e.id === id) || null;

/**
 * Which event is behind this question mark.
 *
 * Seeded off the run and the room like every other roll here, so a reload stands you in the same room.
 * `seen` is the run's own memory: an act that shows you The Mire twice has told you it is a list rather than
 * a place, and theirs never does.
 */
export function pickEvent(seed, act = 1, seen = []) {
    const a = Math.max(1, Math.floor(Number(act) || 1));
    const all = EVENTS.filter((e) => !e.act || e.act === a);
    const fresh = all.filter((e) => !seen.includes(e.id));
    const list = fresh.length ? fresh : all;
    const [r] = nextRand(seed >>> 0);
    return list[Math.floor(r * list.length)] || list[0];
}


/**
 * ── WHAT A CHOICE IN A QUESTION-MARK ROOM ACTUALLY DOES ──────────────────────────────────────────────────
 * The event table is pure data and lives in cards-events.js; this is the half that needs the perk catalogue,
 * the potion list and the deck, so it lives here with the rest of the server's rules.
 *
 * TWO PASSES, because two of their effects ask you something. Burning a card and sharpening ONE card both
 * need to know which — so the first call stamps `pending` on the room and returns, the screen shows the deck,
 * and the second call arrives carrying the card. Everything else resolves in one pass. Sharpening TWO is
 * random rather than chosen, which is theirs exactly: Shining Light takes what it takes.
 *
 * Returns a list of plain sentences describing what happened, which is what the screen prints. The room says
 * what it did — a room that pays silently is the chest bug all over again.
 */
export function applyEventChoice(run, ev, index, card = null) {
    const choice = ev?.choices?.[index];
    if (!choice) return { error: "no_such_choice" };
    const eff = choice.effect || {};
    const said = [];

    if (choice.cost && (run.embers || 0) < choice.cost) return { error: "too_poor" };

    // ── THE TWO THAT ASK ─────────────────────────────────────────────────────────────────────────────
    const needs = eff.remove ? "remove"
        : eff.upgrade === 1 ? "upgrade"
            : eff.copy ? "copy"
                : eff.transform ? "transform" : null;
    if (needs && !card) {
        run.at = { ...run.at, pending: { choice: index, need: needs } };
        return { pending: needs };
    }
    if (needs && card) {
        const at = (run.deck || []).indexOf(card);
        if (at < 0) return { error: "no_such_card" };
        if (needs === "remove") {
            if ((run.deck || []).length <= 4) return { error: "deck_too_small" };
            run.deck = run.deck.filter((_, i) => i !== at);
            said.push(`${cardById(card)?.name || "The card"} is gone for good.`);
        } else if (needs === "copy") {
            // Beside it, not appended: a deck read in order should show the pair together.
            run.deck = [...run.deck.slice(0, at + 1), card, ...run.deck.slice(at + 1)];
            said.push(`There are two ${cardById(card)?.name || "of it"} now.`);
        } else if (needs === "transform") {
            // ⚠️ NOT AIMED, AND NOT BACK INTO THE POOL IT CAME FROM. Theirs takes the card away and hands
            // back a RANDOM one, and being unable to aim it is the whole trade. Drawn from the pool minus
            // what the deck already holds, so a change cannot answer with a third copy of the thing you
            // were trying to be rid of.
            // Its own roll: the shared one below is seeded per ROOM and this arrives on a second request,
            // so reusing it would hand the same replacement to every card in the deck.
            let tr = ((run.seed >>> 0) + (run.at?.row || 0) * 7919 + at * 131) >>> 0;
            const [rr] = nextRand(tr);
            const held = new Set(run.deck);
            const open = Object.keys(POOL).filter((id) => !held.has(id));
            if (!open.length) return { error: "nothing_to_become" };
            const got = open[Math.floor(rr * open.length)];
            run.deck = run.deck.map((id, i) => (i === at ? got : id));
            said.push(`${cardById(card)?.name || "It"} is gone. ${cardById(got)?.name || "Something else"} is in its place.`);
        } else {
            if (!canUpgrade(card)) return { error: "cannot_upgrade" };
            run.deck = run.deck.map((id, i) => (i === at ? upgradedId(id) : id));
            said.push(`${cardById(card)?.name || "The card"} comes out sharper.`);
        }
    }

    if (choice.cost) { run.embers = (run.embers || 0) - choice.cost; said.push(`${choice.cost} embers.`); }

    // Everything from here is rolled off the run and the room, like every other grant in this file.
    let roll = ((run.seed >>> 0) + (run.at?.row || 0) * 3187 + index * 613) >>> 0;
    const next = () => { const [r, n] = nextRand(roll); roll = n; return r; };

    if (eff.maxHp) {
        // ⚠️ IT GOES BOTH WAYS. Their act-two and act-three rooms buy things with the BAR — the Vampires take
        // six of it for a card that drinks — so this has to clamp and it has to say "lost" rather than print
        // "+-6 max health", which is what a one-directional line does the first time a room asks for some.
        run.hpMax = Math.max(10, run.hpMax + eff.maxHp);
        run.hp = Math.max(1, Math.min(run.hpMax, run.hp + eff.maxHp));
        said.push(eff.maxHp > 0 ? `+${eff.maxHp} max health.` : `Lost ${-eff.maxHp} max health.`);
    }
    if (eff.hpPct || eff.hp) {
        const by = (eff.hp || 0) + Math.round((eff.hpPct || 0) * run.hpMax);
        const before = run.hp;
        run.hp = Math.max(1, Math.min(run.hpMax, run.hp + by));
        const moved = run.hp - before;
        if (moved > 0) said.push(`Healed ${moved}.`);
        if (moved < 0) said.push(`Lost ${-moved} health.`);
    }
    if (eff.embers) { run.embers = (run.embers || 0) + eff.embers; said.push(`+${eff.embers} embers.`); }
    // A NUMBER, NOT A FLAG. Their Lab hands over three at once; `potion: 1` reads exactly as it did when
    // this was a boolean, so every room written before today is unchanged.
    if (eff.potion) {
        const want = Number(eff.potion) || 0;
        const got = [];
        for (let i = 0; i < want; i += 1) {
            if ((run.potions || []).length >= beltSize(run.perks)) break;
            const id = POTION_IDS[Math.floor(next() * POTION_IDS.length)];
            run.potions = [...(run.potions || []), id];
            got.push(POTIONS[id]?.name || id);
        }
        if (got.length) said.push(got.length === 1 ? `A bottle: ${got[0]}.` : `Bottles: ${got.join(", ")}.`);
        if (got.length < want) said.push("And nowhere on the belt for the rest.");
    }
    // ── THE FOUNTAIN ─────────────────────────────────────────────────────────────────────────────────
    // Every piece of junk at once. Theirs is the only room in the game that does this, and it is the reason
    // a deck stuffed with Wounds is a bad run rather than a finished one.
    if (eff.cleanse) {
        const junk = new Set(STATUS_IDS);
        const before = (run.deck || []).length;
        run.deck = (run.deck || []).filter((id) => !junk.has(id));
        const gone = before - run.deck.length;
        said.push(gone ? `${gone} ${gone === 1 ? "piece" : "pieces"} of it burned away.` : "There was nothing in your deck that needed it.");
    }
    // ── EVERY COPY OF WHAT YOU CAME IN WITH ──────────────────────────────────────────────────────────
    // Their Ancient Writing sharpens all your Strikes or all your Defends at once. Ours reads the starter
    // deck for what counts as basic rather than naming the cards here, so a starter card added later is
    // covered by this room without anybody remembering the room exists.
    if (eff.upgradeAll) {
        const basic = new Set(STARTER_DECK);
        let n = 0;
        run.deck = (run.deck || []).map((id) => {
            if (!basic.has(id) || !canUpgrade(id)) return id;
            n += 1;
            return upgradedId(id);
        });
        said.push(n ? `${n} of the cards you came in with took an edge.` : "Nothing you came in with can take an edge.");
    }
    // A trinket, certain or at odds. Both walk the same path so an ooze that pays and an egg that pays read
    // the same on the way out.
    const wantsPerk = eff.perk || (eff.maybePerk && next() < eff.maybePerk);
    if (wantsPerk) {
        const held = new Set(run.perks || []);
        const open = PERK_IDS.filter((id) => !held.has(id));
        if (open.length) {
            const got = open[Math.floor(next() * open.length)];
            // ⚠️ ASKED, NOT REPEATED. These three lines used to be written out here and applied `maxHp` and
            // `embers` and nothing else — so a trinket with a PRICE on it paid its upside and skipped its
            // cost. takePerk is the one place that knows what taking a trinket means.
            takePerk(run, got);
            said.push(`${PERKS[got]?.name || "A trinket"}.`);
        } else { run.embers = (run.embers || 0) + 60; said.push("Nothing you do not already carry. 60 embers instead."); }
    } else if (eff.maybePerk) said.push("Nothing but scrap.");

    if (eff.upgrade > 1) {
        // Random, theirs: it takes what it takes.
        const open = (run.deck || []).map((id, i) => ({ id, i })).filter((c) => canUpgrade(c.id));
        const took = [];
        for (let n = 0; n < eff.upgrade && open.length; n += 1) {
            const at = Math.floor(next() * open.length);
            const [c] = open.splice(at, 1);
            run.deck = run.deck.map((id, i) => (i === c.i ? upgradedId(id) : id));
            took.push(cardById(c.id)?.name || c.id);
        }
        said.push(took.length ? `${took.join(" and ")} came out sharper.` : "Nothing here can take an edge.");
    }
    if (eff.card) {
        run.deck = [...(run.deck || []), eff.card];
        said.push(`${cardById(eff.card)?.name || "Something"} is in your deck now.`);
    }

    // ── THE WHEEL ────────────────────────────────────────────────────────────────────────────────────
    // A weighted list where exactly one outcome happens. Two of their best rooms are this shape — the wheel
    // you spin and the joust you bet on — and both are memorable for the same reason: you chose to accept a
    // spread rather than a number, and the room tells you which way it fell.
    //
    // Deliberately NOT recursive. An outcome carries the handful of plain grants and nothing that asks a
    // question, because a room that gambles its way into "now pick a card to burn" is a room that has to
    // hold state across two requests to tell you what it rolled — and the escalating rooms already own the
    // one slot the map has for that.
    if (Array.isArray(eff.gamble) && eff.gamble.length) {
        const total = eff.gamble.reduce((n, g) => n + (Number(g.w) || 1), 0);
        let r = next() * total;
        let hit = eff.gamble[eff.gamble.length - 1];
        for (const g of eff.gamble) { r -= (Number(g.w) || 1); if (r <= 0) { hit = g; break; } }
        if (hit.say) said.push(hit.say);
        if (hit.maxHp) {
            run.hpMax = Math.max(10, run.hpMax + hit.maxHp);
            run.hp = Math.max(1, Math.min(run.hpMax, run.hp + hit.maxHp));
            said.push(hit.maxHp > 0 ? `+${hit.maxHp} max health.` : `Lost ${-hit.maxHp} max health.`);
        }
        if (hit.hp || hit.hpPct) {
            const by = (hit.hp || 0) + Math.round((hit.hpPct || 0) * run.hpMax);
            const before = run.hp;
            run.hp = Math.max(1, Math.min(run.hpMax, run.hp + by));
            const moved = run.hp - before;
            if (moved > 0) said.push(`Healed ${moved}.`);
            if (moved < 0) said.push(`Lost ${-moved} health.`);
        }
        if (hit.embers) { run.embers = Math.max(0, (run.embers || 0) + hit.embers); said.push(hit.embers > 0 ? `+${hit.embers} embers.` : `${-hit.embers} embers gone.`); }
        if (hit.card) { run.deck = [...(run.deck || []), hit.card]; said.push(`${cardById(hit.card)?.name || "Something"} is in your deck now.`); }
        if (hit.perk) {
            const held = new Set(run.perks || []);
            const open = PERK_IDS.filter((id) => !held.has(id));
            if (open.length) {
                const got = open[Math.floor(next() * open.length)];
                run.perks = [...(run.perks || []), got];
                said.push(`${PERKS[got]?.name || got}.`);
                if (PERKS[got]?.maxHp) { run.hpMax += PERKS[got].maxHp; run.hp += PERKS[got].maxHp; }
                if (PERKS[got]?.embers) run.embers = (run.embers || 0) + PERKS[got].embers;
            }
        }
        if (hit.potion && (run.potions || []).length < beltSize(run.perks)) {
            const id = POTION_IDS[Math.floor(next() * POTION_IDS.length)];
            run.potions = [...(run.potions || []), id];
            said.push(`A bottle: ${POTIONS[id]?.name || id}.`);
        }
    }

    // ── AND THE ROOMS THAT TURN INTO A FIGHT ─────────────────────────────────────────────────────────
    // Either the choice IS a fight (the mushrooms) or it woke the thing the room was threatening (the
    // runner). Both hand the room over to the fight screen by rewriting what kind of room this is, which is
    // the one thing the page routes on — and the trinket the choice promised is paid on the way in, because
    // an event fight is not an elite and has no reward screen of its own.
    const woke = eff.wake && next() < eff.wake;
    const encId = eff.fight || (woke ? "jaw" : null);
    if (encId) {
        run.at = { ...run.at, kind: "fight", enc: encId, pending: null, fromEvent: ev.id };
        said.push(woke ? "Something comes up the passage behind you." : "They come apart when you step on them, and then they come at you.");
        return { said, fight: true };
    }

    // ── THE ROOMS YOU CAN STAY IN ────────────────────────────────────────────────────────────────────
    // ⚠️ AN ESCALATING ROOM THAT CLOSES AFTER ONE CHOICE IS NOT AN ESCALATING ROOM. Dead Adventurer and the
    // Scrap Ooze are their two best events and both are built on the SAME choice offered again, worth more
    // and likelier to end badly each time — the whole thing is the third search, the one you make against
    // your own judgement. Photographed on a real run, ours paid 60 embers and then had nothing left but
    // "Move on", which is a room with one door and a paragraph.
    //
    // A choice marked `again` keeps the room open and remembers itself in `used`, so the plate greys out and
    // the ones under it stay live. The room ends when a choice without `again` is taken, when the thing in
    // it wakes, or when the player walks away — which is theirs exactly.
    const used = [...(run.at?.used || []), index];
    const more = choice.again && used.length < ev.choices.length - 1;
    run.at = { ...run.at, pending: null, used, spent: !more, said: [...(more ? (run.at?.said || []) : []), ...said] };
    return { said, more };
}
