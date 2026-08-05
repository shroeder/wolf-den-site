"use client";

// ── THE ARENA LAB: FIXTURES ──────────────────────────────────────────────────────────────────────────────────
// DEV ONLY. Handcrafted arena state in exactly the shape `getArenaState` / `publicBout` hand to the client, so
// the real ArenaClient can be mounted against it with no database, no auth, no live opponent and — crucially —
// no burning a real member's ten daily challenges to look at a hit animation.
//
// Every visual condition the fight can be in is a named SCENE. That is deliberately better than playing a live
// bout to find them: a rank-up on the last rung of a band, a double-KO, a foe opening with a spell you have no
// ward for — those are rare in play and instant here, which is the only way to iterate on how they LOOK.
//
// The shapes below are mirrored by hand from arena.js. If the server's contract moves, this drifts — so the lab
// renders a contract check (see ArenaLab) rather than pretending it cannot happen.

// ── THE ART MATTERS FOR THIS ─────────────────────────────────────────────────────────────────────────────────
// These were DiceBear avatars — head-and-shoulders busts. Composition judgements made against them were WRONG:
// a bust floats in the middle of the frame with no feet, so the stage looked like it had a huge dead band and
// the fighters looked marooned. A real member sprite is a 384x384 full-body character with transparency and its
// feet near the bottom edge, which stands on the sand exactly as you would expect.
//
// This is the owner's own hero art, on a page that 404s in production. The DiceBear fallback is kept below
// because members without a generated sprite really do get one, and that case has to look right too.
const REAL_HERO = "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/art/mkt_buyer/1785451567299-855761-foxLTznAa17YruUJudeqk6f1KyEFgt.webp";
const AV = (q) => `/api/marketplace/avatar?${q}&format=png&size=512`;

export const YOU_SPRITE = REAL_HERO;
export const FOE_SPRITE = REAL_HERO;
// The no-sprite-yet case, so the lab can prove that still composes.
export const PLAIN_SPRITE = AV("skinColor=edb98a&top=shortFlat&hairColor=4a312c&clothing=shirtCrewNeck&clothesColor=5199e4&eyes=default&mouth=serious");

// ── ABILITIES ────────────────────────────────────────────────────────────────────────────────────────────────
// Shaped exactly like buildKit's output, including the `effect` headline/tags object that SkillFace reads.
export const MY_ABILITIES = [
    {
        id: "ashfall_crown:overcharge", itemId: "ashfall_crown",
        sprite: "/images/arena/skill-overcharge.webp",
        name: "Ashfall", from: "Ashfall Crown", kind: "spell", cooldown: 6, power: 4.35,
        effect: {
            head: "×3.83", sub: "damage",
            tags: [{ t: "Cuts 40% guard", k: "good" }, { t: "Own Fire", k: "el" }, { t: "Less raw power", k: "bad" }],
        },
        defensive: false, blurb: "Discharges everything at once.", element: "fire", rarity: "mythic", rank: 4,
    },
    {
        id: "widowfang:opportunist", itemId: "widowfang",
        sprite: "/images/arena/skill-opportunist.webp",
        name: "Widow's Mercy", from: "Widowfang", kind: "execute", cooldown: 4, power: 2.4,
        effect: { head: "×2.4", sub: "damage", tags: [{ t: "×3.6 under 35% vigour", k: "good" }] },
        defensive: false, blurb: "Hits far harder on a wounded foe.", element: "shadow", rarity: "legendary", rank: 3,
    },
    {
        id: "warden_plate:packTactics", itemId: "warden_plate",
        sprite: "/images/arena/skill-packTactics.webp",
        name: "Pack Wall", from: "Warden Plate", kind: "ward", cooldown: 3, power: 1,
        effect: {
            head: "18%", sub: "of your vigour soaked",
            tags: [{ t: "Use it on their turn", k: "good" }, { t: "No damage", k: "bad" }],
        },
        defensive: true, blurb: "Braces you against the next blow.", element: "earth", rarity: "epic", rank: 2,
    },
    {
        id: "gambler_ring:highroller", itemId: "gambler_ring",
        sprite: "/images/arena/skill-highroller.webp",
        name: "Last Coin", from: "Gambler's Ring", kind: "gamble", cooldown: 5, power: 3,
        effect: { head: "×6", sub: "damage", tags: [{ t: "Coin flip — or nothing", k: "bad" }] },
        defensive: false, blurb: "All of it, or none of it.", element: "storm", rarity: "epic", rank: 2,
    },
];

export const FOE_ABILITIES = [
    {
        id: "tidecaller:attuned", itemId: "tidecaller",
        sprite: "/images/arena/skill-attuned.webp",
        name: "Tidecall", from: "Tidecaller Staff", kind: "spell", cooldown: 4, power: 2.76,
        effect: { head: "×2.43", sub: "damage", tags: [{ t: "Cuts 40% guard", k: "good" }] },
        defensive: false, blurb: "Channels your affinity.", element: "water", rarity: "mythic", rank: 4,
    },
    {
        id: "breaker_maul:giantSlayer", itemId: "breaker_maul",
        sprite: "/images/arena/skill-giantSlayer.webp",
        name: "Breaker", from: "Breaker Maul", kind: "strike", cooldown: 4, power: 2.5,
        effect: { head: "×2.5", sub: "damage", tags: [{ t: "Timing counts double", k: "good" }] },
        defensive: false, blurb: "Made for bigger things than you.", element: "water", rarity: "legendary", rank: 3,
    },
];

export const FOE = {
    id: "foe-1", name: "Roan Vasquez", sprite: FOE_SPRITE, level: 34,
    element: "water", abilities: FOE_ABILITIES, might: 27, gearPower: 168, speed: 31,
};

export const ME = {
    level: 31, gearPower: 141, vigour: 206, might: 24,
    sprite: YOU_SPRITE, name: "You", position: 12,
    element: "fire", abilities: MY_ABILITIES,
};

const RANK_HUNTER = {
    key: "hunter", name: "Hunter", at: 0.45, color: "#b98cff", index: 3,
    icon: "/images/arena/rank-hunter.webp",
    next: { key: "fang", name: "Fang", at: 0.62, color: "#ff9f1c", icon: "/images/arena/rank-fang.webp", atRung: 52 },
    into: 9, span: 14, beat: 72, of: 84,
};

// ── THE BOUT ─────────────────────────────────────────────────────────────────────────────────────────────────
export function makeBout(over = {}) {
    return {
        foe: FOE,
        beat: 4, turn: "you",
        hp: 148, maxHp: 206, foeHp: 122, foeMaxHp: 241,
        cd: { "ashfall_crown:overcharge": 4, "gambler_ring:highroller": 2 },
        clash: { mult: 0.75, note: "Their Water smothers your Fire" },
        opener: "you",
        me: { element: "fire", abilities: MY_ABILITIES, might: 24, speed: 29 },
        shield: 0, surge: 0, underdog: 1.12,
        items: { poultice: 2, draught: 1 },
        incoming: null,
        log: [
            { beat: 1, who: "you", grade: "hit", damage: 21, text: "You strike — 21.", ability: null },
            { beat: 1, who: "them", grade: "hit", damage: 18, text: "Roan Vasquez swings — you turn aside 9, 18 lands.", ability: null },
            { beat: 2, who: "you", grade: "skill", damage: 44, text: "Widow's Mercy — 44.", ability: "Widow's Mercy" },
            { beat: 2, who: "them", grade: "hit", damage: 22, text: "Roan Vasquez casts Tidecall — you turn aside 11, 22 lands.", ability: "Tidecall" },
            { beat: 3, who: "you", grade: "hit", damage: 19, text: "You strike — 19.", ability: null },
            { beat: 3, who: "them", grade: "hit", damage: 18, text: "Roan Vasquez swings — you turn aside 9, 18 lands.", ability: null },
        ],
        over: false, won: false, rankUp: null, recap: null, reward: null,
        ...over,
    };
}

const RECAP_WIN = {
    won: true, foe: FOE, reward: { gold: 214, xp: 89 },
    posFrom: 12, posTo: 8, size: 84,
    rank: { name: "Hunter", icon: "/images/arena/rank-hunter.webp", color: "#b98cff", into: 13, span: 14, next: "Fang" },
    rankUp: null, streak: 3, bestStreak: 5, rounds: 9,
};

const RECAP_RANKUP = {
    ...RECAP_WIN, posFrom: 12, posTo: 6,
    rank: { name: "Fang", icon: "/images/arena/rank-fang.webp", color: "#ff9f1c", into: 2, span: 15, next: "Warleader" },
    rankUp: { from: "Hunter", to: "Fang", icon: "/images/arena/rank-fang.webp", color: "#ff9f1c" },
    reward: { gold: 306, xp: 121 }, streak: 4, bestStreak: 5, rounds: 11,
};

const RECAP_LOSS = {
    won: false, foe: FOE, reward: null,
    posFrom: 12, posTo: 12, size: 84,
    rank: { name: "Hunter", icon: "/images/arena/rank-hunter.webp", color: "#b98cff", into: 9, span: 14, next: "Fang" },
    rankUp: null, streak: 0, bestStreak: 5, rounds: 7,
};

const TARGETS = [
    { id: "foe-1", position: 11, name: "Roan Vasquez", sprite: FOE_SPRITE, level: 34, wins: 22, losses: 9, vigour: 241, might: 27, reward: { gold: 214, xp: 89 } },
    { id: "foe-2", position: 9, name: "Petra Nkemdirim", sprite: YOU_SPRITE, level: 36, wins: 31, losses: 14, vigour: 258, might: 29, reward: { gold: 286, xp: 111 } },
    { id: "foe-3", position: 6, name: "Silas Ward", sprite: FOE_SPRITE, level: 39, wins: 44, losses: 12, vigour: 279, might: 32, reward: { gold: 394, xp: 149 } },
    { id: "foe-4", position: 4, name: "Junie Halloway", sprite: YOU_SPRITE, level: 41, wins: 51, losses: 18, vigour: 296, might: 34, reward: { gold: 466, xp: 173 } },
];

const BOARD = [
    { position: 1, name: "Ivo Karras", sprite: FOE_SPRITE, level: 47, you: false },
    { position: 2, name: "Mira Ostrowski", sprite: YOU_SPRITE, level: 45, you: false },
    { position: 3, name: "Dane Feathers", sprite: FOE_SPRITE, level: 44, you: false },
    { position: 4, name: "Junie Halloway", sprite: YOU_SPRITE, level: 41, you: false },
    { position: 5, name: "Ozzy Tran", sprite: FOE_SPRITE, level: 40, you: false },
    { position: 6, name: "Silas Ward", sprite: FOE_SPRITE, level: 39, you: false },
    { position: 7, name: "Bex Amado", sprite: YOU_SPRITE, level: 38, you: false },
    { position: 8, name: "Cal Rutherford", sprite: FOE_SPRITE, level: 37, you: false },
    { position: 9, name: "Petra Nkemdirim", sprite: YOU_SPRITE, level: 36, you: false },
    { position: 10, name: "Wren Sotelo", sprite: FOE_SPRITE, level: 35, you: false },
];

const AWAY = [
    { defending: true, them: { name: "Cal Rutherford", sprite: FOE_SPRITE }, won: true, myPos: 12, rounds: 8 },
    { defending: true, them: { name: "Wren Sotelo", sprite: YOU_SPRITE }, won: false, myPos: 13, rounds: 11 },
];

/** The ladder-screen state. `bout` is layered on top per scene. */
export function baseState(extra = {}) {
    return {
        unlocked: true,
        me: ME,
        position: 12, size: 84,
        rank: RANK_HUNTER,
        fightsLeft: 7, fightsPerDay: 10,
        stats: { wins: 34, losses: 19, streak: 3, bestStreak: 5, best: 8 },
        targets: TARGETS,
        board: BOARD,
        podium: [{ place: 1, chest: "gold" }, { place: 2, chest: "iron" }, { place: 3, chest: "wooden" }],
        bout: null,
        away: null,
        ...extra,
    };
}

// ── THE SCENES ───────────────────────────────────────────────────────────────────────────────────────────────
export const SCENES = {
    ladder: {
        label: "Ladder",
        note: "The screen you land on. Rank badge, your kit, podium, who you can challenge.",
        state: () => baseState(),
    },
    away: {
        label: "While you were away",
        note: "Shown once after somebody challenged your spot overnight.",
        state: () => baseState({ away: AWAY }),
    },
    turn: {
        label: "Your turn",
        note: "The command deck. Attack / Skill / Guard / Item.",
        state: () => baseState({ bout: makeBout() }),
    },
    telegraph: {
        label: "Their turn — telegraph",
        note: "Their move named before it lands, with wards offered against it.",
        state: () => baseState({
            bout: makeBout({
                turn: "them",
                incoming: { name: "Tidecall", kind: "spell", element: "water", sprite: "/images/arena/skill-attuned.webp", power: 2.76, isAbility: true },
            }),
        }),
    },
    swing: {
        label: "Their turn — plain swing",
        note: "The non-ability telegraph. Historically the weakest moment on screen.",
        state: () => baseState({
            bout: makeBout({
                turn: "them",
                incoming: { name: "a heavy swing", kind: "swing", element: "water", sprite: null, power: 1, isAbility: false },
            }),
        }),
    },
    braced: {
        label: "Warded + sharpened",
        note: "Both buff states up at once, so the HUD can be judged at its busiest.",
        state: () => baseState({ bout: makeBout({ shield: 37, surge: 2 }) }),
    },
    lowhp: {
        label: "Both nearly dead",
        note: "The danger state. Execute is live under 35%.",
        state: () => baseState({
            bout: makeBout({
                hp: 24, foeHp: 31, beat: 9,
                cd: {},
                log: [{ beat: 9, who: "them", grade: "hit", damage: 34, text: "Roan Vasquez swings — you turn aside 12, 34 lands.", ability: null }],
            }),
        }),
    },
    victory: {
        label: "Victory recap",
        note: "The modal. Place counts down, rank bar, purse, streak.",
        state: () => baseState({
            position: 8,
            bout: makeBout({ over: true, won: true, foeHp: 0, hp: 71, recap: RECAP_WIN, reward: RECAP_WIN.reward }),
        }),
    },
    rankup: {
        label: "Victory + rank up",
        note: "Crossing a band. The biggest single moment the ladder has.",
        state: () => baseState({
            position: 6,
            bout: makeBout({
                over: true, won: true, foeHp: 0, hp: 44,
                recap: RECAP_RANKUP, reward: RECAP_RANKUP.reward, rankUp: RECAP_RANKUP.rankUp,
            }),
        }),
    },
    defeat: {
        label: "Defeat recap",
        note: "You held nothing. Has to land as a loss without feeling like a punishment.",
        state: () => baseState({
            bout: makeBout({ over: true, won: false, hp: 0, foeHp: 58, recap: RECAP_LOSS }),
        }),
    },
};

export const SCENE_KEYS = Object.keys(SCENES);
