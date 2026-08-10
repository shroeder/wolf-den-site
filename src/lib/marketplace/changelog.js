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
