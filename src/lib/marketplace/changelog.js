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
        key: "arena",
        date: "2026-08-04",
        tag: "new",
        ownerOnly: true,
        title: "The Arena",
        blurb: "Player versus player, as a ladder. The whole pack sorted weakest to strongest, and you start at the bottom — every win moves you up a rung. Your opponents are real members with their real level, gear and hero, and nobody has to be online, because you fight their loadout rather than their attention. Each round is a stance: strike beats feint, guard beats strike, feint beats guard. Read their tell and a weaker fighter can take a rung off somebody above them.",
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
