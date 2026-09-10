// ── WHAT'S NEW, AND WHO ASKED FOR IT ─────────────────────────────────────────────────────────────────────────
// Pure data. Entries are authored here rather than kept in a table because they are written once, by hand, at
// the moment a thing ships — a CMS for a dozen paragraphs a month is a database call pretending to be a feature.
//
// `askedBy` is the point of the whole screen. Members told us what they wanted in the survey, and when one of
// those lands they should see their own name on it. "Somebody asked and it got built" is the single most
// convincing thing a small game can tell its players, and it costs nothing but the honesty of tracking it.
// The aliases are matched against mkt_buyer at render time, so a credit carries their real hero and name.
//
// `ownerOnly` stages an entry before its feature is public — the Arena is written up and waiting rather than
// remembered later and written up worse.

export const CHANGELOG = [
    {
        key: "chips-and-tokens",
        date: "2026-09-09",
        tag: "new",
        title: "The floor takes chips and pays tokens",
        blurb: "The casino has two currencies now, and the reason is the machines. Chips are what you feed them — you buy those with gold at the cage, and you still get a thousand free every day. Tokens are what you WIN, and tokens are the only thing the Counter takes. Nothing you had has gone anywhere: whatever chips you were holding have been handed to you a second time as tokens, so if you were saving for something on the shelf you are exactly as close to it as you were yesterday. What the split buys is a floor that can afford to be generous. While one currency did both jobs, every point the machines paid out was a point off the price of everything on the shelf, so the machines had to be tight. They do not any more. Every cabinet, the keno board and the bingo hall now return around a fifth more than they take, which is not a typo — the fuel is meant to last. Sit down with five thousand chips meaning to walk out with a pet and it used to end badly nine times in ten; it is closer to one in two now. Keno in particular was the worst rate in the building and is now the same as everywhere else. The prices on the Counter have not moved, which quietly makes everything on it about a sixth cheaper in gold than it was this morning.",
        href: "/marketplace/casino",
    },
    {
        key: "ascendant-abilities-shown",
        date: "2026-09-09",
        tag: "improved",
        title: "Your best gear has had a special ability all along",
        blurb: "If you have ever looked at an Ascendant, Eternal, Celestial or Primordial piece and wondered why the legendaries in your bag have a starred line and the best thing you own does not — you were reading a bug, not a tier. Every one of those items has a named power. There are a hundred and twenty of them, they have been working the whole time, and not one of them was ever printed on the card. An Ascendant Cleaver carries The Long Leash: your pet's ability keeps working while you are on somebody else's farm. It has done that since the day it was made and the card has never once mentioned it. All four top tiers show their ability now, on the card, in the same starred line the legendaries use — thirty-seven of thirty-seven ascendant items, thirty of thirty-one eternal, every celestial, and all but one primordial. Your avatar's art crackles for them too, which it did for a signature and a charge and never for the strongest thing a member can be wearing. Worth going through your bag: some of you have been sitting on effects you did not know you had.",
        href: "/marketplace/inventory",
    },
    {
        key: "fleet-past-the-flagship",
        date: "2026-09-09",
        tag: "new",
        title: "Twenty-five more ships, past the flagship",
        blurb: "Seven captains had sunk Admiral Vane's Sovereign and found nothing behind it. Across the whole Den the fleet was going down in ninety-three of every hundred battles, and two of you have never lost at sea at all. That is not a hard ladder with good sailors on it — that is a ladder that ended. It goes to forty now. Sixteen through twenty-five are NAVIES: revenue cutters, a patrol sloop with a gallows rigged on the afterdeck, an ironclad ram, a squadron flagship in full livery — the people who came out here to hunt the people who hunt shipping. It finishes with Vane again, because you sank his flagship and he has had a year, a grudge and a shipyard. Twenty-six through thirty-five are what the sea keeps: a drowned brig you can hear the crew of, a hulk that is more coral than ship, a barge with no sails being dragged by chains that run forward into the water toward something nobody has seen. The last five are neither, and the ladder stops at a thing that is not a ship. Your own hull, guns and gunnery are already at their ceiling, so the climb is carried by theirs — the flagship you have been beating has twenty planks and the thing at the bottom has ninety-five. The payouts go up too, though deliberately not as fast as the difficulty: the reason to keep going is the climb.",
        href: "/marketplace/sailing",
        askedBy: ["GrayKitsune"],
    },
    {
        key: "farm-came-by",
        date: "2026-09-09",
        tag: "improved",
        title: "Who came by, back across the top of the farm",
        blurb: "The people who have been round to your farm lately have their own row again, above the directory. They were being mixed into a wall of a hundred and twenty faces where the one thing worth acting on — somebody visited you and has not been paid back — was indistinguishable from a stranger you have never met. They stay on the row after you have rated them, marked as paid, so the list does not shrink under your thumb as you work along it. The search underneath still reaches every farm in the Den by name.",
        href: "/marketplace/farm",
    },
    {
        key: "the-roof-bites",
        date: "2026-09-01",
        tag: "improved",
        title: "The roof comes in again",
        blurb: "The descent is meant to be a gamble you choose to keep taking, and for anyone well kitted it had stopped being one. Two different things were slowing the roof — the Buttress track you buy in the mine, and the Nerve on your gear — and they were being applied in two separate places, so they multiplied: half off and then another third off, which took the best-built miners in the Den down to two and a half percent a step on a climb that starts at seven and a half. The hard ceiling the tunnel is supposed to have was not one either. It was applied before your Nerve rather than after, so the most dangerous step in the game topped out around a third, and past a certain depth every further step was the same step. Both are fixed. Nerve is now worth up to fifteen percent off rather than thirty-five, every point of it still counts, and Buttress is untouched and still the strongest thing you can buy for the roof — your own tracks should matter more down there than what you happen to be wearing. The number under the Deeper button is also honest now: it never quoted your Nerve, so you have been planning against a risk that was not the one being rolled. Expect the deep to cost more. Depth ten is still there for a built miner, twelve is a real push, and somewhere past twenty the roof is a coin flip no loadout can talk its way out of.",
        href: "/marketplace/mining",
    },
    {
        key: "crit-reads-true",
        date: "2026-08-30",
        tag: "improved",
        title: "Crit chance now says what it means",
        blurb: "If you stacked crit and then watched the fight screen tell you six percent, you were not imagining it — and the stat was not broken. Gear was quoting crit chance in points while the ring quoted it as a percentage, and a thousand points is one hundred percent. So sixty points on your gear really was six percent in the ring; the two screens were describing the same number in two different units, and only one of them told you which. Every item card, stat sheet and comparison now prints crit chance as the percentage you will actually see when you swing, so what your gear promises and what the ring gives you finally match. Nothing about how often you crit has changed. What changed is that you can now tell what a piece is worth before you equip it — and if you have been passing over crit gear because it looked like it did nothing, it is worth another look.",
        href: "/marketplace/inventory",
        askedBy: ["GrayKitsune"],
    },
    {
        key: "fortune-is-luck",
        date: "2026-08-28",
        tag: "improved",
        title: "Fortune is luck now",
        blurb: "Fortune used to be raffle tickets and nothing else — and if you were wearing it, it was not even that: the draw only ever counted the Fortune on your pets, so every point of it on a pendant, a ring, a set, a forge enhancement or a socketed gem was doing nothing at all. It does something now, everywhere. Fortune is luck: better odds on what a chest holds, on what a kill drops in the dungeons, on the pet off a raid or a sea fight, on treasure on the line, on the mine's bonus finds and the smelter's curios, on the gold merchant turning up, on what the Loot Pig is carrying, and on a Regalia piece falling out of a salvage. It also steadies your damage — it lifts the bottom of the range every blow rolls in, so you throw fewer feeble swings, and it never raises the top. Every item card, pet card and stat sheet has been rewritten to say so. The other half of that: the boss raffle is damage again. Tickets come from hitting the boss, and Fortune buys none — which also means the free entries that Fortune used to hand people who never swung are gone. Open your gear and look at what you are already carrying; most of the Den is holding more Fortune than they knew.",
        href: "/marketplace/inventory",
        askedBy: ["Dave"],
    },
    {
        key: "skills-one-path",
        date: "2026-08-28",
        tag: "improved",
        title: "One path per skill, and everyone picks again",
        blurb: "Each of your three class skills is three branches of three nodes, and the branches disagree on purpose — one ends the fight faster, one keeps the pressure on, one keeps you standing. Nothing used to stop you buying all three, so everybody's skill converged on the same maximal shape and the choice was not a choice. You may now hold nodes in ONE branch per skill, the budget is twelve points, and you earn one every other level all the way to 24 — three unlocks and one three-node path in each skill, which is an exact fit. Because the rule changed under builds that were bought under the old one, every node has been refunded: your skills are still yours and still on your bar, and what you choose again is the path. If your Arena looked different this morning, that is why.",
        href: "/marketplace/arena",
    },
    {
        key: "the-ring-rebuilt",
        date: "2026-08-27",
        tag: "improved",
        title: "The ring, rebuilt",
        blurb: "Combat is one mode now and a lot of it works differently. Turn order is the bars and nothing else — no hidden ordering underneath. Accuracy is gone entirely: nothing in the ring ever rolled to hit, so a number that said 100% and meant nothing has been replaced with something the track can actually sell. Double strike is gone the same way, and the points that bought it now buy tempo instead. Bleed and burn stack and keep the fiercer tick, Rupture lays three stacks so bleeding actually builds, and crowd control has a memory: six seconds of immunity per kind after one wears off, so you cannot be locked out of your own fight. Every blow now lands somewhere in a range instead of dealing the identical number forever. The timer bar draws the beat it is spent on, and the foe's bar can no longer fill faster than yours.",
        href: "/marketplace/arena",
    },
    {
        key: "the-gold-slowdown",
        date: "2026-08-26",
        tag: "improved",
        title: "Gold pays less, and here is where",
        blurb: "This is the change most of you noticed without being told, so: the gold faucet was turned down across the game, and the nine biggest earners were turned down again on top of that. The Long Road stopped paying like a jackpot, the furnace stopped minting chests, cooking no longer pays farm seeds for cooking badly, and the dungeons pay the number the run quotes rather than a bigger one. Nothing about what you already hold has changed and nothing was taken back. The reason is that the Den has been open long enough for the earliest players to be a very long way ahead of everyone arriving now, and the gap was widening every week rather than closing. If it has gone too far the other way, say so in the plaza with what you earn in a day — that is the number being watched, and it is easier to argue with than a feeling.",
        href: "/marketplace/play",
    },
    {
        key: "casino",
        date: "2026-08-26",
        tag: "new",
        title: "The Casino is open",
        blurb: "A room off the town square with five machines in it, and every one of them is a different game. THE HUNT runs a warren under the reels. THE HARVEST makes you build the round before it pays. THE DEEP holds every kraken it lands and adds a haul for every pearl. THE MENAGERIE turns the whole board into one giant animal. THE VAULT falls in on itself and pays again on the way down, and it keeps a gem room nobody has emptied yet. Away from the reels there is a blackjack table, a keno board and a bingo card, and every paytable in the house says what it pays before you stake a thing. What you stake comes back as CHIPS — not what you win, what you STAKE, so an unlucky hour is still an hour that bought something. The Counter at the back is the only place a chip is worth anything: it sells chests up to Primordial, and it sells five pets that exist nowhere else in the Den. There are eight badges on this floor and half of them are secret. And there is a rope at the back with a wolf in front of it who will tell you what it takes.",
        href: "/marketplace/casino",
    },
    {
        key: "pet-ascension",
        date: "2026-08-10",
        tag: "new",
        title: "Pets go to six",
        blurb: "Five is no longer the end of the road. There is one more rung, it scales with rarity like every level before it, and only the pet you are carrying earns — so getting there means choosing one companion and sticking with it. A pet that reaches six can be ENSHRINED with a Lightstone or a Darkstone, and its signature ability becomes permanent: it keeps working whether that pet is equipped or not. Both stones do that much. What each one does ON TOP is different on every single pet in the game — some are sharpest when a stone doubles what they already do, others get more interesting when it teaches them a second trade, and neither stone is reliably the wider or the harder of the two. Open the pet and both choices are drawn side by side at their real numbers before you commit. That choice is permanent — and so is the new form the pet wears afterwards, because every pet has two sixth-level forms, one per stone. Stones turn up in a deep seam, on a dig, off a boss kill and in the dungeons, or the Quartermaster (4,000 doubloons) and the Armoury (7,500 laurels) will part with one. Nothing you have already earned changes.",
        href: "/marketplace/pets",
    },
    {
        key: "ship-battles",
        date: "2026-08-09",
        tag: "new",
        title: "Ship battles",
        blurb: "Your boat has guns now. Find a fight and you're matched against someone your own size — a pirate off the fleet or another captain from the Den — and the two ships trade broadsides until one of them goes down. Tap the part of her you want hit: shred the sails, hole the hull, or knock a cannon out before it can answer. Cannons, Gunnery and Hull are yours to upgrade, and a won fight is the only thing in the game that pays doubloons — which is the only thing the Quartermaster takes. Five battles a day, and losing costs the battle and nothing else.",
        href: "/marketplace/sailing",
        askedBy: ["teegs"],
    },
    {
        key: "jeweller",
        date: "2026-08-10",
        tag: "new",
        title: "The Jewelcutter",
        blurb: "A bench that cuts sockets into your gear and sets jewels in them. Five kinds and five tiers, plus a sixth nobody has found yet. Jewels come out of the mine and out of the Arena's Armoury, and three of a tier fuse into one of the next — though past Polished the odds turn hard on purpose, so a Flawless is a story rather than a Tuesday. A set jewel shows on your gear everywhere, including on other people's. Pull one back out for a fee, and dismantling a piece never eats what was in it.",
        href: "/marketplace/jeweller",
    },
    {
        key: "arena",
        date: "2026-08-10",
        tag: "new",
        title: "The Arena",
        blurb: "Fight another member's loadout, or an endless ladder of challengers who are always awake. It runs on the gear you already built and nothing else: your Might is your damage, your Crit Chance and Crit Power are the same ones the boss fight reads, and your Ferocity is what keeps you standing. Nothing is hidden and nothing is rolled except a critical — every number that decides the fight is printed on both cards before you commit, including exactly how much armour the other one is wearing. Challengers are not just bigger numbers either: a Wall soaks everything and wants its guard stripped, a Berserker folds if you survive its opening. From round seven the pit closes and every blow lands harder both ways, so no fight drags. Ten challenges a day, and losing costs nothing.",
        href: "/marketplace/arena",
        askedBy: ["jtcollects", "mamag"],
    },
    {
        key: "dungeons",
        date: "2026-08-04",
        tag: "new",
        title: "The Dungeons are open",
        blurb: "Four dungeons under the Den, one run a day at each. Ten floors down, a different encounter on every one, and a boss at the bottom. Your health and your swing come off your level and the gear you're wearing, so a good loadout finally shows. Kills drop forge parts, chest shards, potions, chests and gear — and if you fall on floor seven, everything you banked on the way down is still yours.",
        href: "/marketplace/dungeons",
    },
    {
        key: "pathfinder",
        date: "2026-08-04",
        tag: "new",
        title: "The Pathfinder",
        blurb: "A guide that walks you through the Den one thing at a time, explains what each system is actually for, and pays you for every step. It follows you into every room rather than living on the home screen, and when you're standing where it sent you it says so. Fourteen chapters, thirty-three steps, and it keeps unlocking as you level — it doesn't finish with you.",
        href: "/marketplace/guide",
    },
    {
        key: "sea-boards",
        date: "2026-08-03",
        tag: "new",
        title: "Boat and digging leaderboards",
        blurb: "The sea keeps score now: who has sailed the furthest and who has dug up the most. Straight off the back of a survey answer asking for exactly this.",
        href: "/marketplace/sailing",
        askedBy: ["graykitsune"],
    },
    {
        key: "wheel-rework",
        date: "2026-08-04",
        tag: "improved",
        title: "The Prize Wheel pays better",
        blurb: "The floor wedge was 60 gold and came up on a fifth of all spins — it's 100 gold and far rarer now, with the freed weight spread across the middle of the list. There's a new Forge Parts wedge on both wheels that can roll anything up to an Emberheart Shard, the treats and seeds each stepped up a tier, and the mini jackpot went from 1,000 to 1,500. The mini wheel's floor is now 400 gold with a Gold Chest on top.",
        href: "/marketplace/spin",
    },
];

export const changelogFor = (isOwner) => CHANGELOG.filter((e) => !e.ownerOnly || isOwner);
export const entryByKey = (key) => CHANGELOG.find((e) => e.key === key) || null;

export const TAG_META = {
    new: { label: "New", color: "#7ce8a4" },
    improved: { label: "Improved", color: "#6fd0ff" },
    fixed: { label: "Fixed", color: "#ffb020" },
};
