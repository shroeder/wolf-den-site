// ── THE PATHFINDER: THE CHAPTERS ─────────────────────────────────────────────────────────────────────────────
// Pure data, no DB, no server-only — the page, the API and the play-screen strip all read the same list.
//
// WHY THIS EXISTS. There was already a "Getting started" card: fifteen rows, verified from real activity, paid
// automatically. It worked, and it was still the wrong shape. Fifteen things at once IS the overwhelm — a new
// member reads a wall of systems they have never heard of and learns nothing about any of them — and when the
// fifteenth ticked, the card vanished and the game stopped explaining itself forever.
//
// Four rules, and every one of them is a reaction to that:
//
//   1. ONE STEP AT A TIME. A chapter shows its next unfinished step and nothing else. You cannot be overwhelmed
//      by a list you cannot see.
//   2. EXPLAIN BY DOING. Every step is a REAL action in the real feature, reached by a real link. `why` is two
//      sentences on what the system is for, and it is the only reading anyone has to do.
//   3. VERIFIED, NEVER CLAIMED. Steps complete from `mkt_activity_event` — the same substrate the old card
//      used. Nothing to trust, nothing to tap twice, and a member who already did it is never asked to do it
//      again.
//   4. IT DOES NOT END. Chapters keep unlocking with level, so there is a next one at level 20 as surely as at
//      level 1, and when the last one closes the guide turns into "here is what to do today" rather than
//      disappearing.
//
// A step's `events` are OR-ed: any one of them completes it. `verify` is for the handful of things activity
// doesn't record, and `claim: "client"` is only for browser permissions, which the server cannot observe.

export const GUIDE_CHAPTERS = [
    {
        id: "hero", name: "Your Hero", minLevel: 1, tint: "#ffd75e", icon: "/images/guide/ch-hero.webp",
        blurb: "The character sheet everything else feeds into.",
        steps: [
            { key: "hero_look", label: "Open your hero", why: "Everything you earn lands here. Your level, your gold and the eight gear slots you'll spend the rest of the game filling.", href: "/marketplace/inventory", cta: "Open my gear", gold: 150, events: ["view_inventory", "view_profile", "inspect_item"] },
            { key: "hero_equip", label: "Equip a piece of gear", why: "Gear is the whole progression. Every stat on what you're wearing feeds your boss damage, your luck and how deep you can go underground.", href: "/marketplace/inventory", cta: "Go and equip", gold: 200, events: ["equip"] },
            { key: "hero_face", label: "Make the hero look like you", why: "Your hero is drawn once and follows you everywhere — the town plaza, the leaderboards, the chat. Worth a minute.", href: "/marketplace/customize", cta: "Customize", gold: 200, verify: "avatar" },
        ],
        reward: { gold: 300, chest: "wooden" },
    },
    {
        id: "farm", name: "The Farm", minLevel: 1, tint: "#7ed57e", icon: "/images/guide/ch-farm.webp",
        blurb: "Grows while you're gone. The engine room of the whole game.",
        steps: [
            { key: "farm_plant", label: "Plant your first crop", why: "Crops grow on a real clock whether the tab is open or not. This is the one system that pays you for coming back tomorrow.", href: "/marketplace/farm", cta: "Go to the farm", gold: 200, events: ["plant_seed"] },
            { key: "farm_fert", label: "Fertilize something", why: "Fertilizer cuts the wait and improves what you pull out. You'll always have more seeds than fertilizer, so spend it on the slow stuff.", href: "/marketplace/farm", cta: "Fertilize a crop", gold: 200, events: ["fertilize_crop"] },
            { key: "farm_harvest", label: "Bring in a harvest", why: "Harvests pay gold and ingredients. The ingredients are what the kitchen turns into buffs — that's chapter seven.", href: "/marketplace/farm", cta: "Harvest", gold: 250, events: ["harvest_crop"] },
        ],
        reward: { gold: 400, chest: "wooden" },
    },
    {
        id: "chests", name: "Chests", minLevel: 2, tint: "#ffb020", icon: "/images/guide/ch-chests.webp",
        blurb: "Where most of your early gear comes from.",
        steps: [
            { key: "chest_open", label: "Open a chest", why: "Chests drop gear, gold and the occasional pet. They come from quests, the wheel, the boss and the sea — you will never be short of them for long.", href: "/marketplace/inventory", cta: "Open one", gold: 200, events: ["open_chest"] },
            { key: "chest_spin", label: "Spin the daily wheel", why: "One free spin a day, twenty wedges, a jackpot that grows every time anyone in the Den spins it. It costs nothing to take.", href: "/marketplace/spin", cta: "Spin", gold: 200, events: ["daily_spin"] },
            { key: "chest_checkin", label: "Check in for the day", why: "A streak pays more the longer you hold it, and it resets if you miss a day. Thirty seconds, every day, forever.", href: "/marketplace/play", cta: "Check in", gold: 200, events: ["daily_checkin"] },
        ],
        reward: { gold: 400, chest: "iron" },
    },
    {
        id: "pets", name: "Pets", minLevel: 2, tint: "#ff9ad5", icon: "/images/guide/ch-pets.webp",
        blurb: "A companion that fights beside you and earns while you're away.",
        steps: [
            { key: "pet_equip", label: "Equip a pet", why: "An equipped pet adds its passive to everything you do and levels up alongside you. Only one at a time, so pick for what you actually play.", href: "/marketplace/pets", cta: "Equip a pet", gold: 200, events: ["equip_pet"] },
            { key: "pet_feed", label: "Feed it a treat", why: "Treats are pet XP. Each level scales the pet's passive, up to five times its starting value — a maxed pet is a real stat line.", href: "/marketplace/farm", cta: "Feed it", gold: 200, events: ["feed_pet"] },
        ],
        reward: { gold: 350, chest: "iron" },
    },
    {
        id: "boss", name: "The Boss", minLevel: 3, tint: "#ff6f7d", icon: "/images/guide/ch-boss.webp",
        blurb: "The whole Den against one monster, every week.",
        steps: [
            { key: "boss_look", label: "Go and look at the boss", why: "Everyone fights the same boss. Its weakness changes each week, and gear matching that element hits far harder.", href: "/marketplace/boss", cta: "See the boss", gold: 150, events: ["view_boss"] },
            { key: "boss_hit", label: "Land a strike", why: "You get a handful of strikes a day. Damage earns raffle tickets toward the prize when the boss falls, so showing up matters more than hitting hard.", href: "/marketplace/boss", cta: "Strike it", gold: 250, events: ["boss_attack"] },
            { key: "boss_cheer", label: "Cheer another member", why: "Three cheers a day. It buffs their next hit and pays you XP and gold for doing it — the Den does more damage when people use them.", href: "/marketplace/boss", cta: "Cheer someone", gold: 200, events: ["cheer"] },
        ],
        reward: { gold: 500, chest: "iron" },
    },
    {
        id: "town", name: "The Town", minLevel: 3, tint: "#8fd8ff", icon: "/images/guide/ch-town.webp",
        blurb: "Where the other members actually are.",
        steps: [
            { key: "town_pet", label: "Pet somebody else's animal", why: "Everyone's hero and pets stand in the plaza. Petting one pays you both, and it's the fastest way to meet the rest of the Den.", href: "/marketplace/town", cta: "Go to town", gold: 200, events: ["pet_other"] },
            { key: "town_rate", label: "Rate a farm", why: "Three ratings a day, one per person. Farms rank against each other on the total, so a visit is worth something to whoever built it.", href: "/marketplace/town", cta: "Visit a farm", gold: 200, events: ["farm_rate"] },
            { key: "town_quest", label: "Finish a town quest", why: "You don't sign up for these. The Quartermaster posts five a day — the same five for everyone — and they're jobs you were going to do anyway. Do one, then collect the gold off him.", href: "/marketplace/town", cta: "See the board", gold: 200, events: ["town_quest"] },
        ],
        reward: { gold: 500, chest: "iron" },
    },
    {
        id: "sea", name: "The Sea", minLevel: 5, tint: "#6fd0ff", icon: "/images/guide/ch-sea.webp",
        blurb: "Fishing, voyages, and digging up what washed ashore.",
        steps: [
            { key: "sea_fish", label: "Land a fish", why: "Casting is free and quick. Fish pay gold, and the rare ones are worth putting on your profile.", href: "/marketplace/fishing", cta: "Go fishing", gold: 200, events: ["fish_caught"] },
            { key: "sea_sail", label: "Send the boat out", why: "A voyage runs for hours in the background and comes back loaded. Start one before you close the tab and it works while you don't.", href: "/marketplace/sailing", cta: "Set sail", gold: 250, events: ["sail_voyage"] },
            { key: "sea_dig", label: "Dig for treasure", why: "There is a real treasure chest buried in the sand. Uncover every tile of it and the chest is yours, at whatever tier was down there — this is the only place chests come from.", href: "/marketplace/sailing", cta: "Dig", gold: 250, events: ["sail_dig"] },
        ],
        reward: { gold: 600, chest: "gold" },
    },
    {
        id: "kitchen", name: "The Kitchen", minLevel: 5, tint: "#ffb45e", icon: "/images/guide/ch-kitchen.webp",
        blurb: "Turns what the farm grows into buffs that matter.",
        steps: [
            { key: "kitchen_recipe", label: "Learn a recipe", why: "Recipes drop from the wheel, chests and the town. Each one unlocks a dish with its own buff.", href: "/marketplace/cooking", cta: "Open the kitchen", gold: 200, events: ["recipe_learned"] },
            { key: "kitchen_cook", label: "Cook something", why: "Cooking is a timing minigame — hit the band and the dish comes out better. Eat it before a boss night.", href: "/marketplace/cooking", cta: "Cook", gold: 250, events: ["cooked"] },
        ],
        reward: { gold: 450, chest: "iron" },
    },
    {
        // THE TWO SCREENS THAT FILL THEMSELVES. Nothing here is an action — the compendium is written by
        // grantItem on every acquisition you already made, and collection pieces bank the moment they land.
        // Which is exactly why it needs a chapter: a member can be carrying a stat bonus for weeks without
        // knowing the screen that shows it exists, and the owned-vs-worn rule below is the single least
        // guessable thing in the game.
        id: "shelf", name: "The Shelf", minLevel: 6, tint: "#a8c4ff", icon: "/images/guide/ch-shelf.webp",
        blurb: "The things you own quietly pay you for owning them.",
        steps: [
            { key: "shelf_compendium", label: "Open the compendium", why: "Every item you have ever held is recorded here permanently — including the ones you sold, salvaged or traded away. Cross ten and it starts paying real stats into every fight you take, and it keeps paying at twenty-five, fifty and a hundred.", href: "/marketplace/compendium", cta: "See the compendium", gold: 200, events: ["view_compendium"] },
            { key: "shelf_sets", label: "Find a set you're close to", why: "Gear sets pay when you WEAR the pieces together. Collections are the opposite — trophies pay for being owned and you never equip them at all, so a collection you finished two months ago is still working right now.", href: "/marketplace/sets", cta: "Check my sets", gold: 250, events: ["view_sets"] },
        ],
        reward: { gold: 450, chest: "iron" },
    },
    {
        id: "forge", name: "The Forge", minLevel: 8, tint: "#ff9a3c", icon: "/images/guide/ch-forge.webp",
        blurb: "Where spare gear becomes better gear.",
        steps: [
            { key: "forge_salvage", label: "Salvage a spare piece", why: "Duplicate gear is raw material. Salvaging breaks it into tiered parts and costs you nothing you were using.", href: "/marketplace/blacksmith", cta: "Open the forge", gold: 200, events: ["craft_salvage", "sell_gear"] },
            { key: "forge_enhance", label: "Enhance a piece you wear", why: "Parts hammer straight into a piece's stats, and a lucky strike rolls a bonus affix on top. This is how a favourite item keeps up.", href: "/marketplace/blacksmith", cta: "Enhance something", gold: 300, events: ["craft_enhance"] },
        ],
        reward: { gold: 600, chest: "gold" },
    },
    {
        id: "deco", name: "Making It Yours", minLevel: 8, tint: "#b98cff", icon: "/images/guide/ch-deco.webp",
        blurb: "The farm is also a place you decorate.",
        steps: [
            { key: "deco_place", label: "Place a decoration", why: "A hundred of them, and the good ones carry real buffs. Where you put things is up to you — people come and look.", href: "/marketplace/farm", cta: "Decorate", gold: 200, events: ["place_deco", "arrange_deco"] },
            // CREATIONS GETS A STEP, NOT A CHAPTER, and the step is LOOKING rather than buying. The bench sells
            // tokens for real money and does nothing else, so a Creations chapter would be a chapter that
            // cannot be finished without paying — the exact paywall the store chapter below refuses, except
            // worse, because an unfinishable chapter sits on the guide forever. Here it lands in front of
            // somebody who is already decorating, which is the only moment the price means anything.
            { key: "deco_creation", label: "See what a Creation is", why: "Custom art, drawn to your description, yours permanently and nobody else's. It costs real money and you never have to buy one — but it is worth knowing what the option is before you decide you don't want it.", href: "/marketplace/creations", cta: "Have a look", gold: 200, events: ["view_creations"] },
        ],
        reward: { gold: 350, chest: "iron" },
    },
    {
        id: "mine", name: "The Mine", minLevel: 10, tint: "#c39b6a", icon: "/images/guide/ch-mine.webp",
        blurb: "Three trips a day, and the deeper you go the worse the odds.",
        steps: [
            { key: "mine_trip", label: "Take a trip down", why: "Every level down pays better ore and raises the chance the roof comes in. You choose when to surface — that's the whole game.", href: "/marketplace/mining", cta: "Go down", gold: 250, events: ["mine_trip", "ore_mined"] },
            { key: "mine_smelt", label: "Smelt your ore", why: "Raw ore is worth little; smelted, it becomes the parts the forge runs on. The smelter is its own timing game.", href: "/marketplace/mining", cta: "Smelt", gold: 300, events: ["ore_smelted"] },
        ],
        reward: { gold: 700, chest: "gold" },
    },
    {
        id: "dungeons", name: "The Dungeons", icon: "/images/guide/ch-dungeons.webp", minLevel: 10, tint: "#b98cff",
        blurb: "Ten floors down, and one run a day at each.",
        steps: [
            { key: "delve_run", label: "Walk into a dungeon", why: "Ten floors, one encounter each, and a boss at the bottom. Your health and your swing come off your level and the gear you are wearing, so this is the first place a good loadout really shows.", href: "/marketplace/dungeons", cta: "Descend", gold: 250, events: ["delve_start"] },
            { key: "delve_boss", label: "Fell a dungeon boss", why: "Reach floor ten and the thing waiting there pays a purse, a chest and parts on top of everything you carried down. Die on the way and you still keep the lot — there is no way to lose what you already banked.", href: "/marketplace/dungeons", cta: "Go and kill it", gold: 400, events: ["delve_clear"] },
        ],
        reward: { gold: 700, chest: "gold" },
    },
    {
        id: "arena", name: "The Arena", minLevel: 10, tint: "#ff6f7d", icon: "/images/guide/ch-arena.webp",
        blurb: "Everything you have built, pointed at somebody else.",
        steps: [
            { key: "arena_class", label: "Pick a class", why: "Reaver, Warden or Runecaller. It is the one choice here you cannot drift into — each starts with different health, damage reduction and accuracy, and the tree you spend points in follows from it. Changing your mind later costs gold, not progress.", href: "/marketplace/arena", cta: "Choose", gold: 250, events: ["arena_class"] },
            { key: "arena_win", label: "Win a bout", why: "The ring reads the same four stat sources the boss does — your gear, your compendium, your companion and your badges all swing. Nothing here is a separate grind; it is the scoreboard for everything else you own.", href: "/marketplace/arena", cta: "Find a fight", gold: 350, events: ["arena_win"] },
            { key: "arena_ladder", label: "Take a rung of the Long Road", why: "A hundred named fighters, each beatable exactly once, walked in order. They do not spend your daily arena challenges, so the Road is always open — and from the thirteenth rung they start bringing moves no member can learn.", href: "/marketplace/arena", cta: "Walk the Road", gold: 400, events: ["arena_ladder"] },
        ],
        reward: { gold: 700, chest: "gold" },
    },
    {
        // TWO STEPS, NOT THREE. Fusing is the third thing the bench does and it is deliberately not a step:
        // it takes three gems of one kind, and gems drop only from the mine and the arena — nine members in
        // the whole Den hold any at all. A step most people cannot finish stops a chapter dead.
        id: "jeweller", name: "The Jeweller", minLevel: 12, tint: "#4fd18b", icon: "/images/guide/ch-jeweller.webp",
        blurb: "A reason to keep the piece you already like.",
        steps: [
            { key: "jewel_socket", label: "Cut a socket", why: "One socket per item, permanent, and priced off the item's rarity — 1,500 gold into a common is a cheap experiment, 20,000 into a mythic is a commitment. Cut it into something you actually intend to keep wearing.", href: "/marketplace/jeweller", cta: "Open the bench", gold: 250, events: ["socket_cut"] },
            { key: "jewel_set", label: "Set a gem in it", why: "Five kinds, one per combat stat, five tiers each. The gem is separate from the item, so a lucky drop is useful the moment it lands instead of only if it happens to beat what you are already wearing.", href: "/marketplace/jeweller", cta: "Set a stone", gold: 350, events: ["gem_set"] },
        ],
        reward: { gold: 700, chest: "gold" },
    },
    {
        id: "trade", name: "Trading", minLevel: 12, tint: "#7defd0", icon: "/images/guide/ch-trade.webp",
        blurb: "Members trade gear and pets directly.",
        steps: [
            { key: "trade_open", label: "Offer somebody a trade", why: "Gear and pets both move. You'll end up with duplicates of things somebody else needs, and vice versa.", href: "/marketplace/trade", cta: "Open trading", gold: 250, events: ["trade_propose", "trade_accept"] },
        ],
        reward: { gold: 500, chest: "gold" },
    },
    {
        id: "store", name: "The Actual Shop", minLevel: 1, tint: "#ffe28a", icon: "/images/guide/ch-store.webp",
        blurb: "The part that happens in Montgomery.",
        steps: [
            { key: "store_notify", label: "Turn on notifications", why: "Boss fights, trade offers and restock alerts. It's the only way to hear about a raid before it's over — and the Den only raids for a few hours.", href: "/marketplace/notifications", cta: "Turn them on", gold: 250, verify: "push" },
            { key: "store_wishlist", label: "Tell us what you're hunting", why: "Add a card to Looking For and we message you when one lands in the case. It costs nothing and it works.", href: "/looking-for", cta: "Add a card", gold: 250, verify: "wishlist" },
            // NOT "buy something". Finishing the Pathfinder used to require a real purchase, which made the
            // last step of a 33-step guide a paywall — you could do every single thing in the game and still be
            // told you were not done until you spent money. The lesson (being a customer pays you in here) is
            // worth teaching; charging for the last tick is not.
            { key: "store_browse", label: "See what's in the case", why: "Have a look at what's in stock — new arrivals land most weeks. And whenever you do buy something, in store or here, it pays XP and gold into this account automatically. You never have to buy anything to finish this guide.", href: "/shop", cta: "Browse the shop", gold: 300, events: ["view_shop", "browse_shop"], verify: "shopvisit" },
        ],
        reward: { gold: 800, chest: "gold" },
    },
];

// Every page a step sends you to. GuideStrip shows on these as well as the game pages, so a step can never
// link somewhere the guide then vanishes — which is exactly what happened with /looking-for, a page the guide
// itself sends you to and then abandoned you on. Derived from the catalog rather than listed by hand, so
// adding a step to a new page cannot reintroduce it.
export const GUIDE_STEP_PATHS = [...new Set(GUIDE_CHAPTERS.flatMap((c) => c.steps.map((s) => s.href)))];

export const chapterById = (id) => GUIDE_CHAPTERS.find((c) => c.id === id) || null;
export const ALL_STEPS = GUIDE_CHAPTERS.flatMap((c) => c.steps.map((s) => ({ ...s, chapter: c.id })));
export const stepByKey = (key) => ALL_STEPS.find((s) => s.key === key) || null;

// Keys are namespaced so they can share mkt_buyer.onboarding_done with the fifteen original tasks without any
// chance of collision, and without a migration for a feature that is entirely derived from activity anyway.
export const DONE_STEP = (key) => `g:${key}`;
export const DONE_CHAPTER = (id) => `gc:${id}`;
export const SEEDED = "g:seeded";
