"use client";

import { resolveSkill, skillsForClass } from "@/lib/marketplace/arena-skills.js";
import { npcOffer } from "@/lib/marketplace/arena-npc.js";

import { act, autoRing, openRing, ringResult } from "@/lib/marketplace/arena-ring.js";
import { LADDER, LADDER_HOUSES, LADDER_SIZE } from "@/lib/marketplace/arena-ladder.js";
import { arenaLevelFor, arenaXpFor, CLASSES, classById, pointsSpent, RESPEC_CLASS, RESPEC_ONE, RESPEC_TREE, treeAbilities, treeState } from "@/lib/marketplace/arena-classes.js";
import { upgradeView } from "@/lib/marketplace/arena-upgrades.js";

// One source for the fixture's build, so the kit strip, the tree and the header all describe the SAME hero.
const TREE_CLASS = "reaver";
const TREE_TAKEN = { rv_might: 3, rv_crit: 2, rv_strike: 1, rv_flurry: 1 };
const TREE_XP = 2400;
import { vpPreview, boutLaurels } from "@/lib/marketplace/arena-rewards.js";
import { CRATES, armouryEv, rollable, rowArt } from "@/lib/marketplace/armoury.js";
// The part sprites are static Blob URLs, so the lab can show them; chest and consumable art live in
// the database and stay blank here — in production rowArt resolves all three.
import { PART_TIERS } from "@/lib/marketplace/forge-parts.js";

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
        effect: { head: "18%", sub: "soaked", line: "Soaks 18% of your health from the next blow",
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
    element: "water", abilities: FOE_ABILITIES, might: 27, gearPower: 168, extra: 0.41,
};

export const ME = {
    level: 31, gearPower: 141, health: 206, might: 24,
    sprite: YOU_SPRITE, name: "You",
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
        me: { element: "fire", abilities: MY_ABILITIES, might: 24, extra: 0.2 },
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
// `arenaXp` comes off the real function rather than a number typed in here: it is the only payout a LOSS
// makes, so a fixture that omitted it is a fixture that could not show the defeat card's actual contents.
const RECAP_WIN = {
    won: true, foe: FOE, reward: { gold: 214, xp: 89, vp: 96, laurels: 121, arenaXp: arenaXpFor({ won: true, myPower: 340, theirPower: 372, kind: "member" }) },
    vpGain: 96, vpFrom: 1040, vpTo: 1136, rankTo: 9, size: 84,
    npcTier: null, npcUnlocked: false,
    feats: [
        { id: "clinical", name: "Clinical", laurels: 45, vp: 8, color: "#6fd0ff", blurb: "Won inside six rounds." },
    ],
    streak: 3, bestStreak: 5, rounds: 6,
};

const RECAP_RANKUP = {
    ...RECAP_WIN,
    reward: { gold: 306, xp: 121, vp: 168, laurels: 256, arenaXp: arenaXpFor({ won: true, myPower: 340, theirPower: 448, kind: "gauntlet" }) },
    vpGain: 168, vpFrom: 1040, vpTo: 1208, rankTo: 6,
    npcTier: 14, npcUnlocked: true,
    feats: [
        { id: "comeback", name: "Comeback", laurels: 70, vp: 15, color: "#ff9f1c", blurb: "Won from under a fifth of your health." },
        { id: "giantkiller", name: "Giant-Killer", laurels: 65, vp: 15, color: "#b061ff", blurb: "Beat a loadout a quarter stronger than yours." },
        { id: "devastating", name: "Devastating", laurels: 35, vp: 5, color: "#ffd75e", blurb: "Landed three or more critical hits." },
    ],
    streak: 4, rounds: 11,
};

const RECAP_LOSS = {
    won: false, foe: FOE, reward: { gold: 0, xp: 0, vp: 0, laurels: 38, arenaXp: arenaXpFor({ won: false, myPower: 340, theirPower: 372, kind: "gauntlet" }) },
    vpGain: 0, vpFrom: 1040, vpTo: 1040, rankTo: 12, size: 84,
    npcTier: null, npcUnlocked: false, feats: [],
    streak: 0, bestStreak: 5, rounds: 7,
};

// ── A THING OFF THE LINE ─────────────────────────────────────────────────────────────────────────────────────
// The same renderer, in the other room. A hooked monster is fought through the arena engine like every other
// NPC, so the only things that differ are the foe, the backdrop the ring draws, and who pays for the win —
// which is exactly what these two scenes are for: to look at the deck without having to hook a Kraken first.
const KRAKEN = {
    id: "fish:kraken_young", name: "Young Kraken", sprite: "/images/sailing/enc/kraken_young.png",
    npc: true, fishing: true, level: null, color: null, element: "water", archetype: "berserker",
    blurb: "Only one arm is aboard so far.",
    abilities: FOE_ABILITIES,
};

// What payFishingMonster actually returns for a tier-4 monster: 120 gold and 40 XP per tier, and one chest at
// the tier the fight earned. Written from that function rather than invented, so the recap in the lab is the
// recap members get.
const HAUL_KRAKEN = { gold: 480, xp: 160, chest: "gold", name: "Young Kraken" };

const MY_POWER = 340;

const TARGETS = [
    { id: "foe-1", rank: 11, vp: 980, power: 300, name: "Roan Vasquez", sprite: FOE_SPRITE, level: 34, wins: 22, losses: 9, health: 241, might: 27 },
    { id: "foe-2", rank: 9, vp: 1240, power: 372, name: "Petra Nkemdirim", sprite: YOU_SPRITE, level: 36, wins: 31, losses: 14, health: 258, might: 29 },
    { id: "foe-3", rank: 6, vp: 1810, power: 448, name: "Silas Ward", sprite: FOE_SPRITE, level: 39, wins: 44, losses: 12, health: 279, might: 32 },
    { id: "foe-4", rank: 4, vp: 2260, power: 520, name: "Junie Halloway", sprite: YOU_SPRITE, level: 41, wins: 51, losses: 18, health: 296, might: 34 },
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
        // Three names the rematch rule is holding back, so the note that explains their absence can be looked
        // at. Real state carries the same shape — see hiddenRecent in arena.js and GrayKitsune's "Eric
        // vanished out of the pick your match on arena screen for me lol."
        hiddenRecent: { n: 3, within: 3 },
        // The real crates, through the real tables, so the shelf can be looked at without a login.
        armoury: CRATES.map((c) => ({
            id: c.id, name: c.name, cost: c.cost, art: c.art, blurb: c.blurb,
            table: rollable(c, { jewels: true }).map((r) => ({ label: r.label, worth: r.worth, w: r.w, art: rowArt(r, { parts: Object.fromEntries(PART_TIERS.map((t) => [t.tier, t.sprite])) }) }))
                .sort((a, z) => z.worth - a.worth),
            ev: armouryEv(c, { jewels: true }),
        })),
        // THE LONG ROAD, through the real catalogue — a hundred rungs, ten houses, with the first fifteen put
        // down so the lab shows both states of a rung and both states of a house header.
        ladder: (() => {
            const beaten = new Set(Array.from({ length: 15 }, (_, i) => i + 1));
            return {
                size: LADDER_SIZE, beaten: beaten.size, houses: LADDER_HOUSES,
                foes: LADDER.map((f) => ({
                    rung: f.rung, id: f.id, name: f.name, house: f.house, champion: f.champion,
                    archetypeName: f.archetypeName, tell: f.tell, power: f.power, color: f.color,
                    sprite: f.sprite, reward: f.reward, beaten: beaten.has(f.rung),
                })),
            };
        })(),
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
        bout: null,
        away: null,
        ...extra,
    };
}

// ── THE SCENES ───────────────────────────────────────────────────────────────────────────────────────────────
export const SCENES = {
    // ── THE THREE THINGS NOBODY PRESSED ──────────────────────────────────────────────────────────────────
    // An extra turn, a lost beat and a wound ticking. All three are asynchronous — they happen between your
    // commands rather than because of one — and all three used to arrive as small grey text at whatever speed
    // the rest of the beat left over. They have their own held banners now, and this is the only way to look
    // at them: on a real account you would have to sit in a fight and wait for the dice.
    //
    // The log is deliberately ONE of each, in a row, so the sheet shows all three in sequence.
    interrupt: {
        label: "Extra turn, frozen, burning",
        note: "The three events a player did not cause. Each holds the ring, names itself and sounds.",
        state: () => baseState({
            bout: makeBout({
                beat: 6, turn: "you", awaiting: "act", hp: 793, maxHp: 2080, foeHp: 2450, foeMaxHp: 2830,
                // ── `me` AND `foe`, NOT `you` AND `them` ─────────────────────────────────────────────
                // The engine's transcript speaks me/foe and ArenaClient translates it ONCE on the way in
                // (see logAll). A fixture written in the screen's vocabulary is therefore translated a
                // second time and comes out inverted: every line reads as the opponent's. Filmed exactly
                // that — "IT IS BURNING ROAN VASQUEZ" over a line that says "You burn".
                log: [
                    { beat: 5, who: "foe", damage: 464, text: "Roan Vasquez casts Overflow — 464. It catches fire.",
                        ability: "Overflow", events: [{ kind: "hit", n: 464, side: "you" }] },
                    { beat: 6, who: "foe", damage: 182, again: true,
                        text: "Roan Vasquez casts Rimebind again — 182.", ability: "Rimebind",
                        events: [{ kind: "hit", n: 182, side: "you" }] },
                    { beat: 6, who: "me", chilledSkip: true, meStun: 2, damage: 0, text: "You cannot act." },
                    { beat: 7, who: "me", burnTick: true, damage: 93, text: "You burn — 93.",
                        events: [{ kind: "burn", n: 93, side: "you" }] },
                ],
            }),
        }),
    },
    // ── THE TWO NEW STATUSES, ON THE BAR ─────────────────────────────────────────────────────────────────
    // A freeze and a burn are the only effects that can cost you a whole turn or kill you without anybody
    // swinging, so they have to be legible while they are ON — not just at the instant they land. This is
    // the state a player is actually looking at: both fighters carrying something, every chip counting down.
    statuses: {
        label: "Frozen & burning",
        note: "Their bar carries a burn, a freeze and a shattered guard; yours carries a burn. What the chips look like mid-bout.",
        state: () => baseState({
            bout: makeBout({
                // On THEM: your burn stacked twice, the freeze that eats their next turn, and Shatter's lockout.
                bleed: { turns: 4, stacks: 2, dmg: 96 },
                foeFrozen: 1,
                foeNoGuard: 3,
                // On YOU: their burn, so both sides of the readout can be seen at once.
                foeBleed: { turns: 2, stacks: 1, dmg: 41 },
                hp: 402, foeHp: 318,
                // ── AND THE STATE DRAWN ON THE BODIES ────────────────────────────────────────────────
                // The chips above are the readout; these are the fighters themselves. Both are set here
                // so one scene shows every state at once: you in the ice with a burn on you, them
                // burning. Without this the only way to look at a freeze was to be frozen in a real bout.
                frozen: true, frozenLeft: 2, burning: true, burnLeft: 3, chilled: 0.1,
                foeBurning: true, foeBurnLeft: 2, foeFrozen: false, foeChilled: 0,
            }),
        }),
    },
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
                me: { element: "fire", abilities: NEW_KIND_ABILITIES, might: 24, extra: 0.2 },
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
        note: "The screen you land on. Rank badge, your kit, who you can challenge.",
        state: () => baseState(),
    },
    away: {
        label: "While you were away",
        note: "Shown once after somebody challenged your spot overnight.",
        state: () => baseState({ away: AWAY }),
    },
    counter: {
        label: "Retaliation",
        note: "Their blow lands and you answer it. `counterEvery` fires the counter on every one of their beats so the choreography can be filmed; ?counterCrit=1 forces the critical version.",
        state: () => baseState({
            bout: makeBout({
                turn: "them",
                hp: 402, maxHp: 520, foeHp: 640, foeMaxHp: 900,
                counterEvery: true,
                incoming: null,
            }),
        }),
    },
    // ── THE TWO EFFECT STATES, ON BOTH BODIES ────────────────────────────────────────────────────────────
    // Stun and haste are the only states a fighter wears that they did not choose, so they have to be legible
    // at a glance and from across the ring. Both on screen at once, one on each fighter, which is also the
    // arrangement that catches them colliding with the health bars or with each other.
    effects: {
        label: "Stunned & hasted",
        note: "The swirl and the green burn. Your fighter is hasted; theirs is stunned and about to lose a swing.",
        state: () => baseState({
            bout: makeBout({ hasted: true, foeStunned: true, turn: "you" }),
        }),
    },
    // ── A REAL RESOLVED FIGHT, FOR WATCHING ──────────────────────────────────────────────────────────────
    // Runs the actual engine over the fixture fighters and hands the screen the transcript it produces, so
    // this scene exercises PLAYBACK rather than a hand-written log: the health bars, the pacing, the crits and
    // the verdict all come from the same list the payout would have read.
    // ── EVERY POP AT ONCE, ON PURPOSE ────────────────────────────────────────────────────────────────────
    // The pop queue holds four groups and drops the oldest the moment a fifth arrives (pushPop, ArenaClient),
    // so a busy beat purges numbers part-way through their fade. A real bout will not reliably deal you
    // thirteen simultaneous riders, so this is a hand-written log where ONE beat carries every rider the
    // reader knows how to draw: a crit, a block, a heal, a steal, a ward soak, thorns both ways, a riposte,
    // both counters, then a bleed tick and a burn tick on the two beats after it.
    //
    // A hand-written log is the wrong thing for asking what the ENGINE does — see the notes on playback and
    // timer. It is the right thing for asking what the SCREEN does when it has to draw thirteen numbers,
    // which is the only question here.
    //
    // ⚠️ HANDED OVER BY THE STUB, NOT MOUNTED, for the reason spelled out on `timer`: a bout that is already
    // on screen when the client mounts is a RESUMED one and opens at its last beat, so a mounted log shows
    // the end of the fight and nothing playing. Written the first time as a mounted bout and filmed exactly
    // that — thirty frames of a finished fight.
    //   node scripts/film.mjs "<lab>?scene=popstorm&chrome=0" out/x --click ".ar-pick-row"
    popstorm: {
        label: "Pop storm",
        note: "One beat carrying every rider at once — thirteen pops against a queue that holds four. Press Challenge to play it.",
        state: () => {
            const b = makeBout();
            return {
                ...baseState({ bout: null }),
                atbBout: {
                    ...b,
                    beat: 0, over: false,
                    maxHp: 1600, foeMaxHp: 1500, hp: 1600, foeHp: 1500,
                    bleed: { turns: 4, stacks: 2, dmg: 96 },
                    foeBleed: { turns: 3, stacks: 1, dmg: 41 },
                    log: [
                        { t: 1, who: "you", damage: 415, crit: true,
                            blocked: 1, healed: 58, stolen: 22, soaked: 31,
                            theirThorns: 44, theirSoak: 18, thorned: 37, takenBack: 26,
                            riposted: 29, countered: 167, counterCrit: true,
                            theirCounter: 88, theirHealed: 40, text: "Everything at once" },
                        { t: 2, who: "foe", damage: 96, kind: "bleed", bleedTick: true, grade: "burn", text: "Bleeding" },
                        { t: 3, who: "you", damage: 41, kind: "rend", burnTick: true, grade: "burn", text: "Burning" },
                    ],
                },
            };
        },
    },
    playback: {
        label: "Playback",
        note: "A whole fight, resolved by the engine and played back blow by blow. This is what a bout looks like now.",
        state: () => {
            const b = makeBout();
            const me = { ...b.me, damage: 210, health: 1600, critChance: 0.35, critMult: 2.4, extra: 0.3,
                armor: 60, pierce: 20, counter: 40, lifesteal: 20, blockChance: 0.15,
                blockReduction: 0.35, stun: 30, haste: 30, bleedChance: 0.55 };
            const foe = { ...b.foe, damage: 180, health: 1500, critChance: 0.2, critMult: 2.0, extra: 0,
                armor: 40, pierce: 0, counter: 0, lifesteal: 0, blockChance: 0.25,
                blockReduction: 0.5, stun: 0, haste: 0 };
            // The ring, headlessly — the same argument as the `timer` scene below: a hand-written log is a
            // fixture of what somebody THOUGHT the engine does, and autoBout was a second engine.
            const r = autoRing(me, foe);
            return baseState({
                // THE SCENE HAS TO ACTUALLY PLAY. This handed over `over: true` and the FINAL hit points, so a
                // scene whose whole note is "played back blow by blow" opened on the victory card and never
                // showed a single blow — which is exactly the thing anyone opening it came to look at. It
                // starts where the fight starts now and the client walks the transcript.
                bout: { ...b, me, foe: { ...b.foe, ...foe }, log: r.log, beat: r.swings,
                    maxHp: me.health, foeMaxHp: foe.health,
                    hp: me.health, foeHp: foe.health, over: false, won: r.won },
            });
        },
    },
    // ── THE TIMER RING, WHICH NOTHING COULD LOOK AT ──────────────────────────────────────────────────────
    // The head callouts, the two bars and the whole atb layout render on `mode === "atb"` and NOTHING ELSE,
    // and no scene set it. So the one part of the ring that is actively being tuned was the one part the lab
    // could not show — every look at it had to be a real owner bout on a real account, which is why it went
    // out with the damage number missing from the callout and nobody caught it.
    //
    // Runs the REAL ring in timer mode and hands over the transcript it produces, bars and all, exactly as
    // ringResult would. Same argument as `playback`: a hand-written log is a fixture of what somebody thought
    // the engine does.
    timer: {
        label: "Timer ring",
        note: "The owner-gated bar mode, played back. Callouts sit over the head of whoever they happened to.",
        state: () => {
            const b = makeBout();
            // Tempos deliberately apart so the two bars visibly fill at different rates — a scene where both
            // bars are identical cannot show what the mode is FOR.
            const me = { ...b.me, damage: 190, health: 1700, critChance: 0.4, critMult: 2.4, extra: 0,
                armor: 60, pierce: 20, counter: 25, blockChance: 0.15, blockReduction: 0.35,
                bleedChance: 0.5, tempo: 1.35 };
            const foe = { ...b.foe, damage: 175, health: 1600, critChance: 0.25, critMult: 2.1, extra: 0,
                armor: 45, pierce: 0, counter: 0, blockChance: 0.2, blockReduction: 0.5,
                burnChance: 0.3, tempo: 1.85 };
            let ring = openRing(me, foe, { foeName: b.foe?.name || "Roan Vasquez" });
            // Played out here rather than left waiting: the screen walks a finished transcript, and a ring
            // parked on `awaiting: "act"` would hand it two lines and stop.
            for (let i = 0; i < 400 && !ring.over; i += 1) {
                if (ring.awaiting !== "act") break;
                ring = act(ring, {});
            }
            const r = ringResult(ring);
            // ── HANDED OVER BY THE STUB, NOT MOUNTED ────────────────────────────────────────────────────
            // `bout: null`, and the fight arrives when Challenge is pressed. It has to: ArenaClient opens a
            // bout that was ALREADY THERE at the end of its transcript, deliberately and correctly — you
            // cannot walk back into a fight and have it replay from the first blow. A scene that mounts with
            // a full log is therefore a scene of a RESUMED bout, which shows the last frame of a fight and
            // nothing playing. Filmed exactly that, and it made every callout look like it was on screen for
            // eight hundred milliseconds doing nothing.
            //
            // Press Challenge and `startedHere` is set, the cursor opens at zero and the client walks the
            // transcript beat by beat, which is the thing worth filming.
            //   node scripts/film.mjs "<lab>?scene=timer&chrome=0" out/x --click ".ar-next"
            return { ...baseState({ bout: null }), atbBout: { ...b, mode: "atb", me, foe: { ...b.foe, ...foe },
                log: r.log, beat: 0, bars: r.log[r.log.length - 1]?.bars || null,
                maxHp: me.health, foeMaxHp: foe.health,
                hp: me.health, foeHp: foe.health, over: false, won: r.won } };
        },
    },
    turn: {
        label: "Your turn",
        note: "The command deck. Attack / Skill / Guard / Item.",
        state: () => baseState({ bout: makeBout() }),
    },
    // ── THE INTERACTIVE BEAT ─────────────────────────────────────────────────────────────────────────────
    // Behind a live bout that is waiting on YOUR input, which on a real account means being mid-fight — you
    // cannot hold a fight still to look at the deck. The deck is built from the real catalog rather than
    // invented, so a skill that gets renamed or recosted shows up here rather than drifting into a fixture
    // nobody re-reads. (There were two of these scenes; the brace went with the timing game.)
    act: {
        label: "Your beat — the deck",
        note: "Pick a command. Cooldowns count down on the buttons.",
        state: () => baseState({
            bout: makeBout({
                awaiting: "act",
                cd: { onslaught: 2 },
                deck: skillsForClass("reaver").map((k) => {
                    const r = resolveSkill(k.id, { [k.id]: [] });
                    return { id: r.id, name: r.name, sprite: r.sprite, blurb: r.blurb,
                        power: r.power, hits: r.hits, cooldown: r.cooldown, free: Boolean(r.free) };
                }),
            }),
        }),
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
            bout: makeBout({ over: true, won: true, foeHp: 0, hp: 71, recap: RECAP_WIN, reward: RECAP_WIN.reward }),
        }),
    },
    rankup: {
        label: "Victory + rank up",
        note: "Crossing a band. The biggest single moment the ladder has.",
        state: () => baseState({
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
    // ── ON THE DECK ──────────────────────────────────────────────────────────────────────────────────────
    // One hardcoded colosseum used to serve every bout, so a Kraken you had just pulled over the rail was
    // answered on hot sand under strung pennants. The backdrop is the only part of the ring that has to know
    // where it is; everything else here is the ordinary fight.
    deck: {
        label: "Deck fight",
        note: "A hooked monster, mid-bout, on the ship. Same ring as the Arena — the plate behind it is the deck.",
        state: () => baseState({
            bout: makeBout({
                fishing: true, foe: KRAKEN,
                foeHp: 268, foeMaxHp: 402, hp: 131, beat: 5,
                clash: { mult: 0.75, note: "Its Water smothers your Fire" },
                log: [
                    { beat: 3, who: "you", grade: "skill", damage: 51, text: "Widow's Mercy — 51.", ability: "Widow's Mercy" },
                    { beat: 3, who: "them", grade: "hit", damage: 27, text: "Young Kraken lashes — you turn aside 11, 27 lands.", ability: null },
                    { beat: 4, who: "you", grade: "crit", damage: 68, text: "You strike clean — 68.", ability: null },
                    { beat: 4, who: "them", grade: "hit", damage: 24, text: "Young Kraken lashes — you turn aside 9, 24 lands.", ability: null },
                ],
            }),
        }),
    },
    // ── AND WHAT IT WAS CARRYING ─────────────────────────────────────────────────────────────────────────
    // The recap read only the Arena's own economy, so this screen said "+0 Victory Points · Streak 0" over a
    // fight that had just paid 480 gold, 160 XP and a gold chest. The haul is the headline here; there is no
    // streak line, because the Arena's streak is not touched by something you pulled out of the sea.
    deckwin: {
        label: "Deck recap — the haul",
        note: "What a landed monster pays. Gold is the headline, the chest is the loot, and no VP or streak appear.",
        state: () => baseState({
            bout: makeBout({
                fishing: true, foe: KRAKEN, over: true, won: true, foeHp: 0, hp: 84,
                recap: { won: true, foe: KRAKEN, fishing: true, haul: HAUL_KRAKEN, rounds: 7 },
            }),
        }),
    },
};

export const SCENE_KEYS = Object.keys(SCENES);
