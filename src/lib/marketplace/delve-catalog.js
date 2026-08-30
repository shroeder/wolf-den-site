// ── DUNGEON DELVES: THE CATALOG ──────────────────────────────────────────────────────────────────────────────
// Pure data — four dungeons, their themes, their foes, and the encounter deck each one is dealt from. No DB,
// no server-only, so the client can render a dungeon card without a round trip and the art scripts can read the
// same list the game does.
//
// FOUR DUNGEONS, gated on level: 10 / 20 / 30 / 50. Each is ten floors with one encounter a floor and a boss
// on the tenth. Each has its own theme, its own palette and its own bestiary — a Sunken Vault encounter should
// never turn up in the Ember Deep, or the four dungeons are one dungeon with four backdrops.

export const DELVE_FLOORS = 10;

// A run must contain at least this many FIGHTS including the boss. Without a floor is just "open a chest,
// open a chest, win" — the danger has to be real often enough that potions and HP mean something. Enforced
// when the deck is dealt, not by rerolling encounters mid-run (see dealFloors).
export const MIN_FIGHTS = 5;

export { KIND } from "@/lib/marketplace/delve-kinds.js";
export { DECKS, EVENTS, eventsFor } from "@/lib/marketplace/delve-events.js";

// ── THE FOUR DUNGEONS ────────────────────────────────────────────────────────────────────────────────────────
// `tint` drives the UI accents; `bg` is the generated backdrop; every foe and event carries its own sprite key
// so nothing falls back to an emoji. Difficulty rises with the gate: deeper dungeons hit harder and pay better.
// ── YOUR VIGOUR AND YOUR MIGHT ───────────────────────────────────────────────────────────────────────────────
// You do not have a fixed pool of health down here — you bring what your LEVEL and your EQUIPPED GEAR are
// worth. Gear that was only ever a boss-damage number now decides whether you survive floor seven, which is
// the point: a delve should reward the loadout you built.
//
//   lv10 / 22 gear ->  94 hp, 16 attack        lv30 / 170 gear -> 220 hp, 41 attack
//   lv20 / 106 gear -> 162 hp, 30 attack       lv55 / 240 gear -> 313 hp, 60 attack
export const delveVigour = (level = 1, gearPower = 0) => Math.round(60 + level * 2.2 + gearPower * 0.55);
export const delveMight = (level = 1, gearPower = 0) => Math.round(9 + level * 0.45 + gearPower * 0.11);

// ── HOW THE DUNGEONS ARE TUNED, AND WHY ──────────────────────────────────────────────────────────────────────
// Foe and boss HP are MULTIPLES OF YOUR ATTACK (foeX / bossX), so a fight is roughly the same number of
// exchanges for everyone. Foe DAMAGE is absolute, so the reward for gear is that the same hit is a smaller
// slice of you.
//
// That split matters more than it looks. The first cut used long attrition fights and behaved as a STEP, not a
// curve: whether you win was decided by a DPS-to-HP ratio, variance averaged out over fifteen exchanges, and
// every tuning attempt produced 100% death or 0% with nothing between. Short fights put luck back in.
//
// Simulated 5,000 runs per cell (weak / mid / strong gear for that gate):
//
//                  no upgrades        half upgrades       fully upgraded
//   Hollow          93 /  0 /  0       1 /  0 /  0         0 /  0 /  0
//   Sunken         100 / 90 /  2      58 /  0 /  0         0 /  0 /  0
//   Ember          100 /100 / 97     100 / 43 /  1        18 /  0 /  0
//   Astral         100 /100 /100     100 / 87 / 51        43 /  1 /  0
//
// Upgrades roughly HALVE the danger rather than erasing it — the ceilings below were cut for exactly that
// reason. Walking into the Spire un-upgraded in poor gear is meant to be hopeless; that is what the other
// three dungeons and the provisions shop are for.
// ── xpPer CUT 35% (2026-08-09), goldPer UNTOUCHED ────────────────────────────────────────────────────────────
// A run paid 216 XP, which was the best per-action payout in the game — a boss strike pays 39, a salvage 10, a
// harvest 6 — and delving came to ~9% of every point the pack earned within a fortnight of opening.
//
// The RUN COUNT is not the problem and never was: startDelve refuses with `already_today` (delves.js), so it is
// one run per dungeon per day, four a day, and that cap stays. This is purely about what one run is worth.
//
// The XP is what got cut, not the gold — the purse is the dungeon's whole draw and delve gold is a modest 7.5%
// of minting.
export const DUNGEONS = [
    {
        id: "hollow", name: "The Hollow Warren", minLevel: 10, tint: "#8fd08a",
        blurb: "A collapsed badger warren under the old orchard. Cramped, damp, and full of things that bite.",
        bg: "/images/delves/bg-hollow.webp",
        loot: { parts: [1, 2], chest: "wooden", bigChest: "iron", frags: [3, 5], gear: ["rare"], gearOdds: 0.06 },
        foeX: 2.5, bossX: 6.0, dmg: [12, 19], goldPer: [18, 34], xpPer: [5, 8],
        boss: { id: "hollow_boss", name: "The Warren Mother", dmg: [16, 26], sprite: "/images/delves/foe-warren-mother.webp",
            blurb: "Something far too large for these tunnels, and it has been waiting." },
        foes: [
            { id: "rootrat", name: "Root Rat", sprite: "/images/delves/foe-rootrat.webp" },
            { id: "grub", name: "Bloated Grub", sprite: "/images/delves/foe-grub.webp" },
            { id: "badger", name: "Snarling Badger", sprite: "/images/delves/foe-badger.webp" },
            { id: "thornling", name: "Thornling", sprite: "/images/delves/foe-thornling.webp" },
        ],
    },
    {
        id: "sunken", name: "The Sunken Vault", minLevel: 20, tint: "#5ad0d0",
        blurb: "A flooded treasury beneath the docks. The water is cold, the gold is real, and so is what guards it.",
        bg: "/images/delves/bg-sunken.webp",
        loot: { parts: [2, 3], chest: "iron", bigChest: "gold", frags: [4, 7], gear: ["rare", "epic"], gearOdds: 0.07 },
        foeX: 2.7, bossX: 6.5, dmg: [21, 33], goldPer: [30, 55], xpPer: [7, 12],
        boss: { id: "sunken_boss", name: "The Drowned Warden", dmg: [28, 43], sprite: "/images/delves/foe-drowned-warden.webp",
            blurb: "It still wears the vault key on a chain. It has not let go in a very long time." },
        foes: [
            { id: "eelhound", name: "Eelhound", sprite: "/images/delves/foe-eelhound.webp" },
            { id: "barnacle", name: "Barnacle Brute", sprite: "/images/delves/foe-barnacle.webp" },
            { id: "siren", name: "Vault Siren", sprite: "/images/delves/foe-siren.webp" },
            { id: "coffer", name: "Animate Coffer", sprite: "/images/delves/foe-coffer.webp" },
        ],
    },
    {
        id: "ember", name: "The Ember Deep", minLevel: 30, tint: "#ff9f1c",
        blurb: "A magma seam the miners broke into and sealed again. Whatever they sealed in is still burning.",
        bg: "/images/delves/bg-ember.webp",
        loot: { parts: [3, 4], chest: "iron", bigChest: "gold", frags: [6, 10], gear: ["epic"], gearOdds: 0.08 },
        foeX: 2.9, bossX: 7.0, dmg: [30, 46], goldPer: [48, 82], xpPer: [12, 19],
        boss: { id: "ember_boss", name: "The Cinder Tyrant", dmg: [41, 62], sprite: "/images/delves/foe-cinder-tyrant.webp",
            blurb: "It was a smith once. Now it is the forge." },
        foes: [
            { id: "emberling", name: "Emberling", sprite: "/images/delves/foe-emberling.webp" },
            { id: "slagbeast", name: "Slag Beast", sprite: "/images/delves/foe-slagbeast.webp" },
            { id: "ashwraith", name: "Ash Wraith", sprite: "/images/delves/foe-ashwraith.webp" },
            { id: "magmite", name: "Magmite", sprite: "/images/delves/foe-magmite.webp" },
        ],
    },
    {
        id: "astral", name: "The Astral Spire", minLevel: 50, tint: "#b98cff",
        blurb: "A tower that is only there on some nights. Ten floors up is the same as ten floors down.",
        bg: "/images/delves/bg-astral.webp",
        loot: { parts: [4, 5], chest: "gold", bigChest: "gold", frags: [8, 14], gear: ["epic", "legendary"], gearOdds: 0.09 },
        foeX: 3.1, bossX: 7.5, dmg: [41, 63], goldPer: [75, 130], xpPer: [18, 30],
        boss: { id: "astral_boss", name: "The Hollow Star", dmg: [56, 84], sprite: "/images/delves/foe-hollow-star.webp",
            blurb: "It has no face, and it is looking at you." },
        foes: [
            { id: "voidmoth", name: "Void Moth", sprite: "/images/delves/foe-voidmoth.webp" },
            { id: "starhusk", name: "Star Husk", sprite: "/images/delves/foe-starhusk.webp" },
            { id: "mirrorkin", name: "Mirrorkin", sprite: "/images/delves/foe-mirrorkin.webp" },
            { id: "riftling", name: "Riftling", sprite: "/images/delves/foe-riftling.webp" },
        ],
    },
];
export const dungeonById = (id) => DUNGEONS.find((d) => d.id === id) || null;

// ── WHAT A FIGHT IS WORTH ────────────────────────────────────────────────────────────────────────────────────
// Killing something used to pay gold and XP and nothing else, which made every fight in the dungeon the same
// fight with different art — you already have gold, and XP arrives on its own from everything else in the game.
// A kill now rolls a real table. Nothing here is guaranteed except on the boss, and the odds ride the event's
// own `lootMult`, so the encounters written as dangerous ("A Mated Pair", "The Old One") are also the ones worth
// picking a fight with.
//
// Expected haul over a five-fight run in the Warren: ~1 forge part roll, ~0.7 fragment drops, ~0.5 potions,
// ~0.3 chests and a bit under a 1-in-3 shot at a piece of gear. The boss pays a chest and parts outright.
// ── AND FOUND MOMENTS PAY LESS OFTEN ─────────────────────────────────────────────────────────────────────────
// Removing chests from the CLAIMS took a quarter off the total and left the rest still too rich: measured
// against the 37 members who play on a given day it was 3.5 chests each, and the heaviest were taking six to
// twelve. These are all legitimate "you dug it up" drops and they keep paying chests — just at a rate where
// finding one is a small event again rather than the third one before lunch.
export const FIGHT_DROPS = {
    parts: 0.22,     // salvage for the Forge
    frags: 0.14,     // chest fragments for the docks
    potion: 0.10,    // the resource that actually decides a run
    // 0.06 -> 0.02. A run is many fights deep, so six percent a fight was a chest most runs and often two;
    // the dungeon was the second biggest source in the game at 572 a month across 27 people.
    chest: 0.02,     // a whole loot chest
    // ── THE SECOND DESCENT ───────────────────────────────────────────────────────────────────────────
    // BOSS ONLY — this line is never rolled on an ordinary kill, which is why it can afford to be a real
    // number. A run is many fights deep, so anything rolled per-fight has to be tiny (see the chest
    // tombstone above); a boss is at most four rolls a day and only if you actually finish.
    //
    // AND IT FEEDS ITSELF, WHICH IS THE THING TO SIZE FOR. Spending one buys four more boss rolls, so the
    // real rate is the sum of the series: at 6% over four bosses the expected haul is 0.24 a day, and the
    // chain multiplies that by 1/(1 - 0.24) ≈ 1.3. Bounded, and nowhere near a member who never stops
    // delving. At 20% it would be 1/(1-0.8) = five times, which is a different game.
    //
    // Fortune is deliberately NOT applied to it — see rollFightLoot. Every other line here scales with luck
    // and should; a line that hands back the DAY is the one place where a lucky member getting more of them
    // compounds into more chances at more of them.
    descent: 0.06,   // another go at all four dungeons
};

// ── UPGRADES ─────────────────────────────────────────────────────────────────────────────────────────────────
// Bought with gold, permanent, and deliberately few. Each one changes how a run FEELS rather than adding a
// number to a sheet: more healing, more attempts at healing, or less to heal from.
// The ceilings are DELIBERATELY LOW. The first cut allowed 7 potions healing 92% each — 644% of your health
// against a run that deals about 250% — and every dungeon fell to 0% death the moment you finished upgrading.
// A maxed player should be safer, not immortal, so the whole pool now tops out near 360% and upgrades roughly
// halve the danger instead of deleting it.
export const DELVE_TRACKS = {
    flask: {
        col: "flask_level", effect: "Potion strength", max: 4, name: "Deeper Flask", icon: "/images/delves/track-flask.webp",
        desc: "Each potion restores more of your health.",
        // 60% base, +3 points a level → 72% at max. Never near 100: a potion is a lifeline, not a reset button.
        fmt: (lv) => `${60 + lv * 3}% healed`,
        cost: (lv) => 1200 + lv * 1100,
    },
    satchel: {
        col: "satchel_level", effect: "Potions carried", max: 2, name: "Wider Satchel", icon: "/images/delves/track-satchel.webp",
        desc: "Carry another potion in with you.",
        fmt: (lv) => `${3 + lv} potion${3 + lv === 1 ? "" : "s"}`,
        cost: (lv) => 2600 + lv * 2400,
    },
    ward: {
        col: "ward_level", effect: "Damage taken", max: 4, name: "Warded Cloak", icon: "/images/delves/track-ward.webp",
        desc: "Take less damage from everything down there.",
        fmt: (lv) => `-${(lv * 2.5).toFixed(1).replace(/\.0$/, "")}% damage taken`,
        cost: (lv) => 1500 + lv * 1300,
    },
};

export const POTION_BASE_HEAL = 0.60;   // 60% of max HP, before Deeper Flask
export const POTION_BASE_COUNT = 3;     // before Wider Satchel
export const potionHealFrac = (flaskLv = 0) => POTION_BASE_HEAL + Math.max(0, flaskLv) * 0.03;
export const potionCount = (satchelLv = 0) => POTION_BASE_COUNT + Math.max(0, satchelLv);
export const wardCut = (wardLv = 0) => Math.min(0.10, Math.max(0, wardLv) * 0.025);

// ── ENCOUNTER ART ────────────────────────────────────────────────────────────────────────────────────────────
// Art is resolved SERVER-side and sent with the floor, so the client never has to guess a filename that might
// not exist. Two rules, in order:
//
//   1. A RARE find has its own picture. These are the 1-in-13 moments; showing the same strongbox you have seen
//      thirty times would waste the only floor anyone tells someone else about.
//   2. Everything else gets its DUNGEON's version of that kind — ev-hollow-chest, ev-astral-chest. A Warren
//      chest is a farmer's box in the dirt and a Spire chest is a display case in a starfield; one shared icon
//      across all four decks quietly undid the theming the decks exist for.
// ── WHICH FOE IS ON THIS FLOOR ───────────────────────────────────────────────────────────────────────────────
// ONE resolver, because two of them is how a rat's shadow turned into a grub. The floor stores `foeId` when the
// run is dealt so the stage can tease a silhouette before you commit — but the tease and the fight were reading
// it through separate expressions with separate fallbacks: the silhouette fell back to `foes[0]` and the fight
// fell back to `pick(foes)`. Any floor without a stored id (a run dealt before ids existed) therefore showed
// one creature and produced another.
//
// The fallback is now derived from the FLOOR NUMBER, which both callers have and neither can disagree about.
export function foeForFloor(dungeon, floor) {
    const foes = dungeon?.foes || [];
    if (!foes.length) return null;
    const stored = floor?.foeId ? foes.find((f) => f.id === floor.foeId) : null;
    return stored || foes[(Math.max(1, Number(floor?.n) || 1) - 1) % foes.length];
}

// ── THE ROOM YOU ARE STANDING IN ─────────────────────────────────────────────────────────────────────────────
// A backdrop per DUNGEON per KIND. Ten floors used to share one plate, so the run read as one room with the
// camera nudged around it — a merchant, a trap and the boss all standing in the same corridor. The room now
// changes when the encounter does, which is the only thing that makes ten floors feel like ten places.
//
// A mimic deliberately gets the CHEST room: the whole trick is that the floor looks like a payday right up
// until the lid opens. `bg-<dungeon>.png` stays as the fallback so a missing plate degrades to the old look
// rather than to a black box.
const BG_KINDS = new Set(["fight", "boss", "chest", "cache", "merchant", "shrine", "well", "trap", "rest", "puzzle"]);
export function encounterBg(dungeonId, event) {
    const d = dungeonById(dungeonId);
    const fallback = d?.bg || null;
    if (!event) return fallback;
    const kind = event.kind === "mimic" ? "chest" : event.kind;
    return BG_KINDS.has(kind) ? `/images/delves/bg-${dungeonId}-${kind}.webp` : fallback;
}

export function encounterArt(dungeonId, event) {
    if (!event) return null;
    if (event.art) return `/images/delves/${event.art}.webp`;
    // A mimic must look EXACTLY like that dungeon's chest until it bites — that is the entire joke. So it
    // borrows the chest icon rather than having one of its own, and only becomes the mimic sprite once the
    // fight starts (the run sends run.foe.sprite from then on).
    if (event.kind === "mimic") return `/images/delves/ev-${dungeonId}-chest.webp`;
    // Fights use the foe's own sprite, which the run supplies; everything else is this dungeon's version.
    if (event.kind === "fight" || event.kind === "boss") return null;
    return `/images/delves/ev-${dungeonId}-${event.kind}.webp`;
}

// ── WHAT A CHEST SHARD IS WORTH ──────────────────────────────────────────────────────────────────────────────
// Shards stopped fusing into chests when chests became something you dig up, so a delve pays coin for them.
// It lives HERE because both delves.js (the log line as you find them) and delve-floors.js (the payout and the
// wrap card) need it, and a rate that is written down twice is two rates the moment one of them is tuned.
export const DELVE_SHARD_DOUBLOONS = 3;
