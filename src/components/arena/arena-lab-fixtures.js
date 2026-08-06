"use client";

import { npcOffer } from "@/lib/marketplace/arena-npc.js";
import { arenaLevelFor, CLASSES, classById, pointsSpent, RESPEC_CLASS, RESPEC_ONE, RESPEC_TREE, treeAbilities, treeState } from "@/lib/marketplace/arena-classes.js";
import { upgradeView } from "@/lib/marketplace/arena-upgrades.js";

// One source for the fixture's build, so the kit strip, the tree and the header all describe the SAME hero.
const TREE_CLASS = "reaver";
const TREE_TAKEN = { rv_might: 3, rv_crit: 2, rv_strike: 1, rv_flurry: 1 };
const TREE_XP = 2400;
import { vpPreview, boutLaurels } from "@/lib/marketplace/arena-rewards.js";

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
        name: "Ashfall", from: "Ashfall Crown", kind: "spell", cooldown: 6, power: 4.35, hits: 1,
        effect: { head: "×3.83", sub: "damage", line: "×3.83 Fire damage, cuts 40% guard",
            tags: [{ t: "Cuts 40% guard", k: "good" }] },
        defensive: false, blurb: "Discharges everything at once.", element: "fire", rarity: "mythic", rank: 4,
    },
    {
        id: "widowfang:opportunist", itemId: "widowfang",
        sprite: "/images/arena/skill-opportunist.webp",
        name: "Widow's Mercy", from: "Widowfang", kind: "execute", cooldown: 4, power: 2.4, hits: 1,
        effect: { head: "×3.6", sub: "under 35%", line: "×2.4 damage — ×3.6 if they are under 35%",
            tags: [{ t: "×2.4 otherwise", k: "bad" }] },
        defensive: false, blurb: "Hits far harder on a wounded foe.", element: "shadow", rarity: "legendary", rank: 3,
    },
    {
        id: "warden_plate:packTactics", itemId: "warden_plate",
        sprite: "/images/arena/skill-packTactics.webp",
        name: "Pack Wall", from: "Warden Plate", kind: "ward", cooldown: 3, power: 1, hits: 1,
        effect: { head: "18%", sub: "soaked", line: "Soaks 18% of your vigour from the next blow",
            tags: [{ t: "On their turn", k: "good" }] },
        defensive: true, blurb: "Braces you against the next blow.", element: "earth", rarity: "epic", rank: 2,
    },
    {
        id: "gambler_ring:highroller", itemId: "gambler_ring",
        sprite: "/images/arena/skill-highroller.webp",
        name: "Last Coin", from: "Gambler's Ring", kind: "gamble", cooldown: 5, power: 3, hits: 1,
        effect: { head: "×6", sub: "or nothing", line: "×6 damage on a coin flip, nothing on the other side",
            tags: [{ t: "Coin flip", k: "bad" }] },
        defensive: false, blurb: "All of it, or none of it.", element: "storm", rarity: "epic", rank: 2,
    },
];

// One of each NEW kind, so the lab shows the redesign rather than four variants of "deal damage".
export const NEW_KIND_ABILITIES = [
    { id: "emberfang:eruptChance", itemId: "emberfang", sprite: "/images/arena/skill-eruptChance.webp",
        name: "Emberfang", from: "Emberfang Blade", kind: "rend", cooldown: 3, power: 1.5, hits: 1,
        effect: { head: "5%", sub: "a turn, 3 turns", line: "Burns for 3 more turns after it lands",
            tags: [{ t: "Stacks with itself", k: "good" }] },
        defensive: false, blurb: "Erupts, and keeps burning.", element: "fire", rarity: "epic", rank: 2 },
    { id: "packclaw:onslaught", itemId: "packclaw", sprite: "/images/arena/skill-onslaught.webp",
        name: "Packclaw", from: "Packclaw Gauntlets", kind: "flurry", cooldown: 3, power: 0.95, hits: 3,
        effect: { head: "3×", sub: "×0.95 hits", line: "3 hits of ×0.95 — every one can crit",
            tags: [{ t: "More crit rolls", k: "good" }] },
        defensive: false, blurb: "Hits hardest while they're fresh.", element: "storm", rarity: "epic", rank: 2 },
    { id: "leechband:bloodlust", itemId: "leechband", sprite: "/images/arena/skill-bloodlust.webp",
        name: "Bloodlust", from: "Leechband", kind: "drain", cooldown: 3, power: 1.9, hits: 1,
        effect: { head: "×1.9", sub: "damage", line: "×1.9 damage, and you keep 50% of it",
            tags: [{ t: "Heals 50% of it", k: "good" }] },
        defensive: false, blurb: "Feeds on the fight.", element: "shadow", rarity: "legendary", rank: 3 },
    { id: "giantsbane:giantSlayer", itemId: "giantsbane", sprite: "/images/arena/skill-giantSlayer.webp",
        name: "Giantsbane", from: "Giantsbane Maul", kind: "sunder", cooldown: 4, power: 1.6, hits: 1,
        effect: { head: "−35%", sub: "their guard", line: "×1.6 damage and strips 35% of their guard for 2 turns",
            tags: [{ t: "For 2 turns", k: "good" }] },
        defensive: false, blurb: "Made for bigger things than you.", element: "earth", rarity: "legendary", rank: 3 },
    { id: "banner:warbanner", itemId: "banner", sprite: "/images/arena/skill-warbanner.webp",
        name: "Warbanner", from: "Warbanner of the Den", kind: "riposte", cooldown: 4, power: 1, hits: 1,
        effect: { head: "50%", sub: "sent back", line: "Their next blow returns 50% of itself to them",
            tags: [{ t: "On their turn", k: "good" }] },
        defensive: true, blurb: "Nobody wants to fight under it.", element: "light", rarity: "mythic", rank: 4 },
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

// Recap fixtures on the VP contract. These carried posFrom/posTo/rank, which the move to Victory Points
// removed — and because the Recap component gated on `recap.rank`, the lab could not have shown the bug.
const RECAP_WIN = {
    won: true, foe: FOE, reward: { gold: 214, xp: 89, vp: 96, laurels: 121 },
    vpGain: 96, vpFrom: 1040, vpTo: 1136, rankTo: 9, size: 84,
    npcTier: null, npcUnlocked: false,
    feats: [
        { id: "clinical", name: "Clinical", laurels: 45, vp: 8, color: "#6fd0ff", blurb: "Won inside six rounds." },
    ],
    streak: 3, bestStreak: 5, rounds: 6,
};

const RECAP_RANKUP = {
    ...RECAP_WIN,
    reward: { gold: 306, xp: 121, vp: 168, laurels: 256 },
    vpGain: 168, vpFrom: 1040, vpTo: 1208, rankTo: 6,
    npcTier: 14, npcUnlocked: true,
    feats: [
        { id: "comeback", name: "Comeback", laurels: 70, vp: 15, color: "#ff9f1c", blurb: "Won from under a fifth of your vigour." },
        { id: "giantkiller", name: "Giant-Killer", laurels: 65, vp: 15, color: "#b061ff", blurb: "Beat a loadout a quarter stronger than yours." },
        { id: "devastating", name: "Devastating", laurels: 35, vp: 5, color: "#ffd75e", blurb: "Landed three or more critical hits." },
    ],
    streak: 4, rounds: 11,
};

const RECAP_LOSS = {
    won: false, foe: FOE, reward: { gold: 0, xp: 0, vp: 0, laurels: 38 },
    vpGain: 0, vpFrom: 1040, vpTo: 1040, rankTo: 12, size: 84,
    npcTier: null, npcUnlocked: false, feats: [],
    streak: 0, bestStreak: 5, rounds: 7,
};

const MY_POWER = 340;

const TARGETS = [
    { id: "foe-1", rank: 11, vp: 980, power: 300, name: "Roan Vasquez", sprite: FOE_SPRITE, level: 34, wins: 22, losses: 9, vigour: 241, might: 27 },
    { id: "foe-2", rank: 9, vp: 1240, power: 372, name: "Petra Nkemdirim", sprite: YOU_SPRITE, level: 36, wins: 31, losses: 14, vigour: 258, might: 29 },
    { id: "foe-3", rank: 6, vp: 1810, power: 448, name: "Silas Ward", sprite: FOE_SPRITE, level: 39, wins: 44, losses: 12, vigour: 279, might: 32 },
    { id: "foe-4", rank: 4, vp: 2260, power: 520, name: "Junie Halloway", sprite: YOU_SPRITE, level: 41, wins: 51, losses: 18, vigour: 296, might: 34 },
].map((t) => ({ ...t, reward: { vp: vpPreview(MY_POWER, t.power), laurels: boutLaurels({ won: true, myPower: MY_POWER, theirPower: t.power }) } }));

const BOARD = [
    { rank: 1, vp: 5120, name: "Ivo Karras", sprite: FOE_SPRITE, level: 47, you: false },
    { rank: 2, vp: 4480, name: "Mira Ostrowski", sprite: YOU_SPRITE, level: 45, you: false },
    { rank: 3, vp: 3960, name: "Dane Feathers", sprite: FOE_SPRITE, level: 44, you: false },
    { rank: 4, vp: 2260, name: "Junie Halloway", sprite: YOU_SPRITE, level: 41, you: false },
    { rank: 5, vp: 2040, name: "Ozzy Tran", sprite: FOE_SPRITE, level: 40, you: false },
    { rank: 6, vp: 1810, name: "Silas Ward", sprite: FOE_SPRITE, level: 39, you: false },
    { rank: 7, vp: 1520, name: "Bex Amado", sprite: YOU_SPRITE, level: 38, you: false },
    { rank: 8, vp: 1390, name: "Cal Rutherford", sprite: FOE_SPRITE, level: 37, you: false },
    { rank: 9, vp: 1240, name: "Petra Nkemdirim", sprite: YOU_SPRITE, level: 36, you: false },
    { rank: 10, vp: 1105, name: "Wren Sotelo", sprite: FOE_SPRITE, level: 35, you: false },
];

const AWAY = [
    { defending: true, them: { name: "Cal Rutherford", sprite: FOE_SPRITE }, won: true, myPos: 12, rounds: 8 },
    { defending: true, them: { name: "Wren Sotelo", sprite: YOU_SPRITE }, won: false, myPos: 13, rounds: 11 },
];

/** The ladder-screen state. `bout` is layered on top per scene. */
export function baseState(extra = {}) {
    return {
        unlocked: true,
        // The Fight tab's kit strip reads me.abilities, and this was still handing it the GEAR-era list — so
        // the lab showed four sprites that no longer come from anywhere. Derive it the way the server does.
        me: { ...ME, rank: 12, vp: 1040, power: MY_POWER, abilities: treeAbilities(TREE_CLASS, TREE_TAKEN, "fire") },
        rank: 12, size: 84,
        vp: 1040, laurels: 640,
        band: RANK_HUNTER,
        fightsLeft: 7, fightsPerDay: 10,
        stats: { wins: 34, losses: 19, streak: 3, bestStreak: 5, bestVp: 1040, npcBest: 11 },
        targets: TARGETS,
        // The Gauntlet, straight from the real catalog so the lab cannot drift from what the server offers.
        gauntlet: npcOffer(11).map((n) => ({
            ...n, beaten: n.tier <= 11,
            reward: { vp: vpPreview(MY_POWER, n.gearPower), laurels: boutLaurels({ won: true, myPower: MY_POWER, theirPower: n.gearPower }) },
        })),
        board: BOARD,
        gold: 12500,
        // Progression, built from the REAL catalog so the lab cannot drift from what the server publishes.
        progress: (() => {
            const xp = TREE_XP;
            const lvl = arenaLevelFor(xp);
            const classId = TREE_CLASS;
            const taken = TREE_TAKEN;
            const spent = pointsSpent(taken);
            const avail = Math.max(0, lvl.level - spent);
            return {
                xp, level: lvl.level, into: lvl.into, span: lvl.span,
                classId, cls: classById(classId), classes: CLASSES,
                points: { total: lvl.level, spent, available: avail },
                needsClass: false,
                tree: treeState(classId, taken, avail),
                respec: { one: RESPEC_ONE(spent), tree: RESPEC_TREE(spent), klass: RESPEC_CLASS(spent) },
            };
        })(),
        upgrades: upgradeView({ conditioning: 4, footwork: 2, edge: 1 }),
        podium: [{ place: 1, chest: "gold" }, { place: 2, chest: "iron" }, { place: 3, chest: "wooden" }],
        bout: null,
        away: null,
        ...extra,
    };
}

// ── THE SCENES ───────────────────────────────────────────────────────────────────────────────────────────────
export const SCENES = {
    newkinds: {
        label: "New skill kinds",
        note: "One of each new archetype — rend, flurry, drain, sunder, riposte — on the ladder card layout.",
        state: () => baseState({ me: { ...ME, abilities: NEW_KIND_ABILITIES } }),
    },
    newbout: {
        label: "Fight w/ new kinds",
        note: "A bout whose kit is rend / flurry / drain / sunder — so each new effect can be cast and watched.",
        state: () => baseState({
            me: { ...ME, abilities: NEW_KIND_ABILITIES },
            bout: makeBout({
                cd: {},
                me: { element: "fire", abilities: NEW_KIND_ABILITIES, might: 24, speed: 29 },
            }),
        }),
    },
    pickclass: {
        label: "Choose a class",
        note: "The first arena level asks which discipline your points go into.",
        state: () => {
            const b = baseState();
            return { ...b, progress: { ...b.progress, classId: null, cls: null, needsClass: true, tree: [], points: { total: 1, spent: 0, available: 1 } } };
        },
    },
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
