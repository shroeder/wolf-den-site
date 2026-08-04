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

// Encounter KINDS. `fight` is the only one that can kill you; the rest are texture, reward or a gamble.
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
export const DUNGEONS = [
    {
        id: "hollow", name: "The Hollow Warren", minLevel: 10, tint: "#8fd08a",
        blurb: "A collapsed badger warren under the old orchard. Cramped, damp, and full of things that bite.",
        bg: "/images/delves/bg-hollow.png",
        foeX: 2.5, bossX: 6.0, dmg: [12, 19], goldPer: [18, 34], xpPer: [10, 18],
        boss: { id: "hollow_boss", name: "The Warren Mother", dmg: [16, 26], sprite: "/images/delves/foe-warren-mother.png",
            blurb: "Something far too large for these tunnels, and it has been waiting." },
        foes: [
            { id: "rootrat", name: "Root Rat", sprite: "/images/delves/foe-rootrat.png" },
            { id: "grub", name: "Bloated Grub", sprite: "/images/delves/foe-grub.png" },
            { id: "badger", name: "Snarling Badger", sprite: "/images/delves/foe-badger.png" },
            { id: "thornling", name: "Thornling", sprite: "/images/delves/foe-thornling.png" },
        ],
    },
    {
        id: "sunken", name: "The Sunken Vault", minLevel: 20, tint: "#5ad0d0",
        blurb: "A flooded treasury beneath the docks. The water is cold, the gold is real, and so is what guards it.",
        bg: "/images/delves/bg-sunken.png",
        foeX: 2.7, bossX: 6.5, dmg: [21, 33], goldPer: [30, 55], xpPer: [16, 28],
        boss: { id: "sunken_boss", name: "The Drowned Warden", dmg: [28, 43], sprite: "/images/delves/foe-drowned-warden.png",
            blurb: "It still wears the vault key on a chain. It has not let go in a very long time." },
        foes: [
            { id: "eelhound", name: "Eelhound", sprite: "/images/delves/foe-eelhound.png" },
            { id: "barnacle", name: "Barnacle Brute", sprite: "/images/delves/foe-barnacle.png" },
            { id: "siren", name: "Vault Siren", sprite: "/images/delves/foe-siren.png" },
            { id: "coffer", name: "Animate Coffer", sprite: "/images/delves/foe-coffer.png" },
        ],
    },
    {
        id: "ember", name: "The Ember Deep", minLevel: 30, tint: "#ff9f1c",
        blurb: "A magma seam the miners broke into and sealed again. Whatever they sealed in is still burning.",
        bg: "/images/delves/bg-ember.png",
        foeX: 2.9, bossX: 7.0, dmg: [30, 46], goldPer: [48, 82], xpPer: [26, 42],
        boss: { id: "ember_boss", name: "The Cinder Tyrant", dmg: [41, 62], sprite: "/images/delves/foe-cinder-tyrant.png",
            blurb: "It was a smith once. Now it is the forge." },
        foes: [
            { id: "emberling", name: "Emberling", sprite: "/images/delves/foe-emberling.png" },
            { id: "slagbeast", name: "Slag Beast", sprite: "/images/delves/foe-slagbeast.png" },
            { id: "ashwraith", name: "Ash Wraith", sprite: "/images/delves/foe-ashwraith.png" },
            { id: "magmite", name: "Magmite", sprite: "/images/delves/foe-magmite.png" },
        ],
    },
    {
        id: "astral", name: "The Astral Spire", minLevel: 50, tint: "#b98cff",
        blurb: "A tower that is only there on some nights. Ten floors up is the same as ten floors down.",
        bg: "/images/delves/bg-astral.png",
        foeX: 3.1, bossX: 7.5, dmg: [41, 63], goldPer: [75, 130], xpPer: [40, 66],
        boss: { id: "astral_boss", name: "The Hollow Star", dmg: [56, 84], sprite: "/images/delves/foe-hollow-star.png",
            blurb: "It has no face, and it is looking at you." },
        foes: [
            { id: "voidmoth", name: "Void Moth", sprite: "/images/delves/foe-voidmoth.png" },
            { id: "starhusk", name: "Star Husk", sprite: "/images/delves/foe-starhusk.png" },
            { id: "mirrorkin", name: "Mirrorkin", sprite: "/images/delves/foe-mirrorkin.png" },
            { id: "riftling", name: "Riftling", sprite: "/images/delves/foe-riftling.png" },
        ],
    },
];
export const dungeonById = (id) => DUNGEONS.find((d) => d.id === id) || null;

// ── THE EVENT DECK ───────────────────────────────────────────────────────────────────────────────────────────
// Fifty-odd non-boss events, each with its own flavour, so ten floors never read the same twice and four
// dungeons don't share a script. `only` scopes an event to one dungeon; everything else is shared texture that
// re-skins per theme via the dungeon's own palette.
//
// `weight` is relative within the pool for that dungeon. Fights are weighted heavily because MIN_FIGHTS has to
// be reachable without the dealer having to force them in.
const E = (id, kind, title, text, extra = {}) => ({ id, kind, title, text, weight: 10, ...extra });

export const EVENTS = [
    // ── FIGHTS (shared shape, foe picked from the dungeon's own bestiary) ──
    E("f_ambush", KIND.fight, "Ambush", "It was waiting in the dark and it moves first.", { weight: 34 }),
    E("f_block", KIND.fight, "Blocked Passage", "Something big is in the way, and it is not moving.", { weight: 30 }),
    E("f_pack", KIND.fight, "A Pack of Them", "One would be a nuisance. There are several.", { weight: 22, dmgMult: 1.25, lootMult: 1.4 }),
    E("f_wounded", KIND.fight, "Wounded Beast", "It is already hurt. That makes it worse, not better.", { weight: 18, hpMult: 0.6, dmgMult: 1.3 }),
    E("f_elite", KIND.fight, "Something Older", "Bigger than the rest, and it has been down here longer.", { weight: 12, hpMult: 1.6, dmgMult: 1.2, lootMult: 2 }),
    E("f_guard", KIND.fight, "The Doorkeeper", "It guards a door you were going to walk through anyway.", { weight: 16, lootMult: 1.3 }),

    // ── MIMICS — a chest that is a fight. The whole point is that it looks identical until you open it. ──
    E("m_chest", KIND.mimic, "A Chest, Unattended", "Sitting in the middle of the floor. Nobody leaves a chest in the middle of a floor.", { weight: 9, dmgMult: 1.3 }),
    E("m_hoard", KIND.mimic, "Too Good To Be True", "Gold spilling out of the lid. Far too much of it.", { weight: 6, dmgMult: 1.5, lootMult: 1.8 }),

    // ── CHESTS ──
    E("c_plain", KIND.chest, "A Strongbox", "Iron-bound and left behind. The hinges give easily.", { weight: 20 }),
    E("c_buried", KIND.chest, "Half-Buried Casket", "You'd have walked past it if the corner hadn't caught the light.", { weight: 14 }),
    E("c_ornate", KIND.chest, "An Ornate Coffer", "Someone cared about this one.", { weight: 8, lootMult: 1.6 }),
    E("c_cracked", KIND.chest, "Cracked Open Already", "Someone got here first. They left in a hurry, and left some of it.", { weight: 12, lootMult: 0.6 }),

    // ── CACHES (gold) ──
    E("g_purse", KIND.cache, "A Dropped Purse", "Still tied. Whoever dropped it did not come back for it.", { weight: 18 }),
    E("g_vein", KIND.cache, "Coin in the Silt", "Scattered across the floor like someone ran with their hands full.", { weight: 14 }),
    E("g_tribute", KIND.cache, "A Tribute Pile", "Stacked neatly. Left as an offering to something.", { weight: 9, lootMult: 1.8 }),

    // ── MERCHANTS ──
    E("v_wanderer", KIND.merchant, "A Wanderer", "Someone else is down here, and they are willing to trade.", { weight: 14 }),
    E("v_hermit", KIND.merchant, "The Hermit", "He has lived here longer than the dungeon has had a name.", { weight: 9 }),
    E("v_ghostshop", KIND.merchant, "A Shop That Shouldn't Be", "A counter, a lamp, and a shopkeeper who does not blink.", { weight: 6 }),

    // ── SHRINES — heal, or bargain health for reward ──
    E("s_font", KIND.shrine, "A Cracked Font", "Still trickling. It smells clean, which down here is remarkable.", { weight: 14 }),
    E("s_altar", KIND.shrine, "A Bloodied Altar", "It wants something from you before it gives anything back.", { weight: 10, bargain: true }),
    E("s_statue", KIND.shrine, "A Kneeling Statue", "Its hands are cupped. Something is expected.", { weight: 9, bargain: true }),

    // ── WELLS — pure gamble ──
    E("w_wishing", KIND.well, "A Wishing Well", "Deep, dark, and it has swallowed a lot of coins.", { weight: 12 }),
    E("w_mirror", KIND.well, "A Still Pool", "Your reflection is a beat behind you.", { weight: 8 }),

    // ── TRAPS — damage, no fight ──
    E("t_dart", KIND.trap, "Dart Holes", "You notice them a fraction after you should have.", { weight: 14 }),
    E("t_floor", KIND.trap, "The Floor Gives", "One step is not like the others.", { weight: 12 }),
    E("t_gas", KIND.trap, "Bad Air", "Sweet-smelling, which is the worst sign.", { weight: 10 }),
    E("t_ceiling", KIND.trap, "Falling Stone", "The ceiling has been waiting a long time to do that.", { weight: 9 }),

    // ── REST ──
    E("r_camp", KIND.rest, "An Old Camp", "Cold ashes, a bedroll, no body. You take a moment.", { weight: 12 }),
    E("r_quiet", KIND.rest, "A Quiet Stretch", "Nothing happens. It is almost worse.", { weight: 14 }),
    E("r_spring", KIND.rest, "A Warm Spring", "Steam, and for once it isn't something breathing.", { weight: 9 }),

    // ── PUZZLES — a real choice with two outcomes ──
    E("p_doors", KIND.puzzle, "Two Doors", "One is warm to the touch. One is not.", { weight: 11 }),
    E("p_lever", KIND.puzzle, "An Unmarked Lever", "It could be drainage. It could be the ceiling.", { weight: 10 }),
    E("p_bridge", KIND.puzzle, "A Rotten Bridge", "Cross it, or take the long way round and lose the light.", { weight: 9 }),
    E("p_riddle", KIND.puzzle, "Words Cut Into Stone", "A question, and space beneath it for an answer.", { weight: 8 }),

    // ── DUNGEON-SPECIFIC COLOUR ──
    E("h_roots", KIND.trap, "Grasping Roots", "The orchard is still alive down here, and it is not friendly.", { only: "hollow", weight: 14 }),
    E("h_burrow", KIND.chest, "A Hoarder's Burrow", "Something has been dragging shiny things down here for years.", { only: "hollow", weight: 12, lootMult: 1.4 }),
    E("h_hive", KIND.fight, "Broken Hive", "You put a boot through it before you saw it.", { only: "hollow", weight: 16, dmgMult: 1.2 }),
    E("h_cellar", KIND.rest, "The Old Cellar", "Cider barrels, most of them burst. One of them isn't.", { only: "hollow", weight: 10 }),

    E("k_bilge", KIND.trap, "Rising Bilge", "The water is at your knees, and it wasn't a minute ago.", { only: "sunken", weight: 14 }),
    E("k_strongroom", KIND.chest, "The Strongroom", "The door was already open. That should worry you more than it does.", { only: "sunken", weight: 11, lootMult: 1.5 }),
    E("k_ledger", KIND.puzzle, "A Waterlogged Ledger", "Someone recorded what was stored here. Some of it is still legible.", { only: "sunken", weight: 9 }),
    E("k_current", KIND.fight, "Something in the Current", "It circles once before it comes at you.", { only: "sunken", weight: 16 }),

    E("e_vent", KIND.trap, "A Steam Vent", "It goes off on a schedule. You learn the schedule the hard way.", { only: "ember", weight: 14 }),
    E("e_forge", KIND.merchant, "An Abandoned Forge", "Still hot. Someone has left tools, and a price list.", { only: "ember", weight: 11 }),
    E("e_crucible", KIND.shrine, "The Crucible", "Put your hand in and it will give you something. It will also take something.", { only: "ember", weight: 10, bargain: true }),
    E("e_flow", KIND.fight, "Out of the Magma", "It rises out of the flow without hurrying.", { only: "ember", weight: 16 }),

    E("a_stair", KIND.puzzle, "A Stair That Loops", "You have climbed this flight before. Twice.", { only: "astral", weight: 12 }),
    E("a_orrery", KIND.chest, "A Broken Orrery", "The planets came off. They are worth a great deal.", { only: "astral", weight: 11, lootMult: 1.6 }),
    E("a_window", KIND.well, "A Window With No Outside", "You can throw something through it. You will not get it back. Probably.", { only: "astral", weight: 10 }),
    E("a_echo", KIND.fight, "Your Own Shape", "It is wearing your face and it is not doing it well.", { only: "astral", weight: 16, dmgMult: 1.2, lootMult: 1.5 }),
];

/** The event pool a given dungeon draws from: shared events plus its own. */
export const eventsFor = (dungeonId) => EVENTS.filter((e) => !e.only || e.only === dungeonId);

// ── UPGRADES ─────────────────────────────────────────────────────────────────────────────────────────────────
// Bought with gold, permanent, and deliberately few. Each one changes how a run FEELS rather than adding a
// number to a sheet: more healing, more attempts at healing, or less to heal from.
// The ceilings are DELIBERATELY LOW. The first cut allowed 7 potions healing 92% each — 644% of your health
// against a run that deals about 250% — and every dungeon fell to 0% death the moment you finished upgrading.
// A maxed player should be safer, not immortal, so the whole pool now tops out near 360% and upgrades roughly
// halve the danger instead of deleting it.
export const DELVE_TRACKS = {
    flask: {
        col: "flask_level", max: 4, name: "Deeper Flask", icon: "/images/delves/track-flask.png",
        desc: "Each potion restores more of your health.",
        // 60% base, +3 points a level → 72% at max. Never near 100: a potion is a lifeline, not a reset button.
        fmt: (lv) => `${60 + lv * 3}% healed`,
        cost: (lv) => 1200 + lv * 1100,
    },
    satchel: {
        col: "satchel_level", max: 2, name: "Wider Satchel", icon: "/images/delves/track-satchel.png",
        desc: "Carry another potion in with you.",
        fmt: (lv) => `${3 + lv} potion${3 + lv === 1 ? "" : "s"}`,
        cost: (lv) => 2600 + lv * 2400,
    },
    ward: {
        col: "ward_level", max: 4, name: "Warded Cloak", icon: "/images/delves/track-ward.png",
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
