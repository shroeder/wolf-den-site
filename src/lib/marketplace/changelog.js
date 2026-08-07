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
        key: "forge-bulk",
        date: "2026-08-07",
        tag: "improved",
        title: "Salvage a whole rarity, combine a whole tier",
        blurb: "The Forge does the tapping for you. One button salvages every unequipped item of a rarity — enhanced, charged and equipped gear is never touched — and one button combines every scrap at a tier into the next one up, over and over until there aren't three left. A bag full of commons is now two taps instead of forty.",
        href: "/marketplace/blacksmith",
    },
    {
        key: "aug-fixes",
        date: "2026-08-07",
        tag: "fixed",
        title: "The mining bar, the wheel's decorations, and the guide's last step",
        blurb: "Mining's timing bar was waiting on the server mid-swing, which is why it felt heavy next to smelting's — the swing is decided on your screen now and the network catches up afterwards. The Prize Wheel's decoration wedges were listed but never actually paying out a decoration. And the Pathfinder could strand you on a step it wouldn't credit: steps can be dismissed now, and everyone stuck on the shop step got it credited retroactively.",
        href: "/marketplace/guide",
    },
    {
        key: "collections",
        date: "2026-08-06",
        tag: "improved",
        title: "Crafting sets are Collections now",
        blurb: "The seven crafting sets stopped being gear. You no longer wear a Prospector's coat to mine well — owning the piece is enough, and the bonus is always on. That means no loadout juggling, no switching before every farm run, and your hero can wear whatever you actually want them to look like. The trade-off is that collection pieces can't be equipped, sold, salvaged or traded: they're a collection, and they pay for being complete. Everyone who had forged one was paid back, and every set bonus in the game now counts the pieces you own.",
        href: "/marketplace/sets",
        askedBy: ["sunflowerjinxx", "alstier1"],
    },
    {
        key: "economy-pass",
        date: "2026-08-06",
        tag: "improved",
        title: "The big rebalance — read this one",
        blurb: "Thirty days of the ledger said four numbers were minting most of the game. A boss raid was paying its average fighter 844 XP while a harvest paid 8, so the newest systems were quietly retiring the older ones. Raid XP is down about 40%, the spin wedges about 45%, delve floors about 30%, and crop sell values about 35% across the ladder. Raid gold is untouched, and the XP scrolls were left alone on purpose — they're bought with gold, so they're a sink, and cutting them would devalue something people paid for. This one changed plans people had already made, and it should have been announced the day it shipped rather than after.",
        href: "/marketplace/leaderboard",
    },
    {
        key: "pet-curve",
        date: "2026-08-06",
        tag: "improved",
        title: "Pets take five times the XP to level",
        blurb: "Pets were hitting level 5 far too fast for what a maxed passive is worth. The curve is five times longer now — and nobody lost a level over it: everyone's existing pets kept the level they'd already earned.",
        href: "/marketplace/pets",
    },
    {
        key: "fishing-ceiling",
        date: "2026-08-06",
        tag: "fixed",
        title: "Fishing was eating the upgrade you paid for",
        blurb: "A cast ceiling was capping the line before your purchased upgrades could apply, so the last few levels of the rod did nothing. Fixed — the upgrade you bought is the upgrade you get.",
        href: "/marketplace/sailing",
    },
    {
        key: "gold-merchant-daily",
        date: "2026-08-06",
        tag: "improved",
        title: "The Gold Merchant stocks one of each ware a day",
        blurb: "The merchant's stall used to roll a random subset, so the thing you were saving for might not appear for a week. Now every ware is on the counter once a day.",
        href: "/marketplace/shop",
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
