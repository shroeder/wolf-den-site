import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { bumpQuestProgress } from "@/lib/marketplace/quests.js";
import { grantHaul } from "@/lib/marketplace/fishing.js";
import { COLLECTIBLES } from "@/lib/marketplace/collectibles.js";
import { maybeGrantCasinoPet } from "@/lib/marketplace/pet-drops.js";
import {
    ROUND_MS, openBets, placeBet, roundEndsAt, roundOf, roundPlayers, settleBets,
} from "@/lib/marketplace/casino-rounds.js";
import {
    BANKS, GAMBLE_WIN_CHANCE, POT_RATE, POT_SEED_SHARE, SLOT_BONUSES, applyBonuses, bonusEv, emptyBanks,
    emptyMeter, hasBonus, moonstruckMult, potChance,
} from "@/lib/marketplace/slot-bonus.js";

// ── THE CASINO ───────────────────────────────────────────────────────────────────────────────────────────────
// A room off the town, owner-gated, laid out like the tavern: you walk left and right, other members walking
// around are really there, and the things you interact with are MACHINES rather than people.
//
// Luke's brief: "a slot machine, a blackjack table, roulette, Keno, maybe bingo, maybe three different kinds
// of slot machines... it's a gold sink with a chance to win chests, laurels, doubloons, pet stones,
// consumables, recipes, and maybe five exclusive pets that are hard-to-find late-game things — not powerful,
// they just give casino bonuses. No limit to how much you can play other than how much coin you have."
//
// ── WHAT THIS FILE IS FOR ────────────────────────────────────────────────────────────────────────────────────
// The floor is the easy half and it is mostly free: `mkt_town_presence` already carries a `zone`, so a casino
// is a new zone value and seeing other people in it comes with the tavern's own machinery.
//
// The hard half is the money, and it is the whole reason the odds live in ONE file with a check script
// pointed at them. A payout table is the one kind of content in this game that can mint currency out of
// nothing — this codebase has already been bitten by exactly that once, where awardXp paid gold 1:1 with
// points on a repeatable caller. A slot machine is that bug with a lever on it.
//
// So: every machine's odds are a table here, the return-to-player is COMPUTED from that same table rather
// than asserted in a comment, and scripts/check-casino.mjs fails the build if any machine can pay out more
// than it takes in. The number in the comment cannot drift from the number in the game, because the comment
// does not contain a number.

export const CASINO_ZONE = "casino";

// ── HOUSE EDGE ───────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "yes just like a real machine." So gold does come back — a session has small wins in it rather than
// being a coin shredder with an occasional prize — and the house keeps a share.
//
// Real slots run 85-95% RTP and are tuned to feel generous while being anything but. This sits at the bottom
// of that range on purpose: the Den's gold has other places to be, and the casino is meant to be a SINK
// first. The ceiling is what the check script enforces; the target is what the tables are tuned to.
export const RTP_CEILING = 0.95;     // above this a machine is a money printer; the check script refuses it
export const RTP_TARGET = 0.88;      // what the tables are actually tuned to

export const MIN_BET = 25;
export const MAX_BET = 5000;

// ── THE SLOT: THREE REELS, ONE TABLE ─────────────────────────────────────────────────────────────────────────
// Weighted symbols, three identical reels, and a paytable keyed on what comes up. Three reels rather than
// five because three can be enumerated EXACTLY — every outcome of this machine is one of 6^3 combinations, so
// its return is arithmetic rather than a simulation that happened to look fine on the day it was run.
//
// The symbols are the Den's own currency of meaning: the wolf is the house, and the things below it are the
// things a member already wants.

// ── THE CABINETS ARE THEMED FROM THE DEN'S OWN SPRITE LIBRARY ────────────────────────────────────────────────
// The reels were sixteen symbols drawn specially for them, which was fine and completely disconnected from
// everything else in the game. The Den already owns 113 pet sprites, 469 item sprites, 137 cooking sprites, a
// shelf of fish and a ladder of arena foes — so a slot machine can be a machine about the GAME rather than a
// machine with generic treasure on it, and it costs nothing to draw.
//
// THE SYMBOL IDS DO NOT MOVE. Every weight, every payout line and both gates are keyed on `wolf`, `chest`,
// `laurel` and the rest, and none of that changes — only the picture each one shows. A re-theme cannot alter
// a single number, which is exactly why it is safe to do this to machines that are already tuned.
//
// The ladders are chosen to MATCH THE WEIGHTS: the rarest symbol on each machine is that set's most fearsome
// thing, and the commonest is its most ordinary. On The Deep the jackpot is a leviathan and the blank is a
// sardine; on The Hunt the jackpot is an ascendant and the blank is a straw dummy. And the scatter symbol on
// The Deep is called `star`, so it is a starfish, which is the sort of accident worth keeping.
//
// `cooking:` refs are resolved from mkt_cooking_sprite at read time — those sprites live on Blob rather than
// in public/, so the server has to look them up.
export const SLOT_THEMES = {
    slot: {
        label: "The Hunt",
        blurb: "Pays often. Tops out at 700x.",
        art: {
            // Picked off a contact sheet of all ten foes for READABILITY, not just for rank. The first cut
            // used `nightmare` and `veteran` — both dark armour on a near-black reel, and the nightmare
            // very nearly vanished. A reel symbol that cannot be told apart at a glance is a reel symbol
            // that has failed, however good the character art is.
            wolf: "/images/arena/npc/ascendant.webp",     // the winged one. The jackpot.
            chest: "/images/arena/npc/titan.webp",        // grey stone, unmistakable silhouette
            laurel: "/images/arena/npc/colossus.webp",    // bronze, with a furnace burning in its chest
            doubloon: "/images/arena/npc/warlord.webp",
            bone: "/images/arena/npc/regular.webp",
            moon: "/images/arena/npc/straw.webp",         // the training dummy. The blank.
        },
    },
    slot2: {
        label: "The Harvest",
        blurb: "Pays more often than not. Rarely pays big.",
        art: {
            // The Wolf's Table is the Den's grandest dish, so it is the jackpot. The gold pie is the symbol
            // that drops a coin in a piggy bank, which is the right shape for it.
            wolf: "cooking:r_wolfs_table",
            chest: "cooking:r_gold_pie",
            laurel: "cooking:r_harvest_pie",
            moon: "cooking:r_porridge",
        },
    },
    slot3: {
        label: "The Deep",
        blurb: "Only triples pay. One of them pays 4,000x.",
        art: {
            wolf: "/images/fish/fish_leviathan.png",
            moon: "/images/fish/fish_kraken.png",
            chest: "/images/fish/fish_whale.png",
            laurel: "/images/fish/fish_swordfish.png",
            star: "/images/fish/fish_starfish.png",
            bone: "/images/fish/fish_sardine.png",
        },
    },
};

/** Resolve a theme's art, looking up anything that lives on Blob rather than in public/. */
async function themeArt() {
    const refs = [];
    for (const t of Object.values(SLOT_THEMES)) {
        for (const v of Object.values(t.art)) if (v.startsWith("cooking:")) refs.push(v.slice(8));
    }
    const rows = refs.length
        ? await db.query(`SELECT ref, url FROM mkt_cooking_sprite WHERE ref = ANY($1)`, [refs]).catch(() => [])
        : [];
    const byRef = Object.fromEntries(rows.map((r) => [r.ref, r.url]));
    const out = {};
    for (const [id, t] of Object.entries(SLOT_THEMES)) {
        out[id] = Object.fromEntries(Object.entries(t.art)
            .map(([sym, v]) => [sym, v.startsWith("cooking:") ? (byRef[v.slice(8)] || null) : v])
            .filter(([, url]) => url));
    }
    return out;
}

// ── THREE MACHINES, AND WHY THEY ARE NOT ONE MACHINE PAINTED THREE WAYS ──────────────────────────────────────
// A row of cabinets that differ only in their artwork is a row of one cabinet. What actually makes somebody
// choose a machine is VOLATILITY — how often it pays against how much it pays when it does — and that is a
// real choice with no right answer, which is the only kind worth putting on a floor.
//
//   Wolf's Luck   the all-rounder. Pays something on 3 pulls in 5, tops out at 700x.
//   Den Fortune   the grinder. Pays more often than it doesn't, and almost never pays big.
//   Moonrise      the chase. Only three-of-a-kind pays real money, and it pays 4,000x — kept watchable by a
//                 SCATTER: loose stars pay a little wherever they land, so the screen is not dead for
//                 twenty pulls at a time.
//
// All three return roughly the same amount over a lifetime. None of them is the smart pick; they are three
// different shapes of the same 11-12% edge, and check:casino enumerates every one of them exactly.
export const SLOT_MACHINES = {
    slot: {
        id: "slot",
        label: "The Hunt",
        blurb: "Pays often. Tops out at 700x.",
        symbols: [
            { id: "wolf", label: "Wolf", weight: 1 },
            { id: "chest", label: "Chest", weight: 3 },
            { id: "laurel", label: "Laurel", weight: 5 },
            { id: "doubloon", label: "Doubloon", weight: 8 },
            { id: "bone", label: "Bone", weight: 12 },
            { id: "moon", label: "Moon", weight: 16 },
        ],
        // What a line pays, as a MULTIPLE OF THE BET.
        //
        // THE FIRST TABLE FAILED ITS OWN CHECK, which is the argument for having one: it returned 48% and
        // paid something on one pull in twelve. Correct in the sense that the house could never lose, and it
        // would have read as a broken machine — you would have sat there watching nothing happen.
        //
        // Two changes. Every symbol pays on a PAIR now, not just the top two, which is what a real machine
        // does and what puts something on the screen often enough to be worth watching. And the low pairs
        // pay LESS THAN THE BET on purpose — a moon pair returns 0.4x, so it is a win that is really a
        // smaller loss. That is exactly what slot machines do, and it is honest here because the number on
        // screen is the number you actually got.
        // ── FUNDING THE FEATURES ────────────────────────────────────────────────────────────────────
        // Three doubloons paid 20x and was the third-biggest line on the machine. It now pays 8x and CALLS
        // THE PACK — ten free pulls — which is worth about as much again, arriving as a run of pulls you
        // watch rather than a number that flashes once. That is the whole trade a bonus makes: the same
        // money, spent on something that takes longer and feels like an event.
        //
        // The Nudge is not funded from anywhere, because it is not new money: it only ever converts a hand
        // that ALREADY paid the wolf pair into one that pays the wolf triple, and that 2.2% is what the
        // rest of the table gives up to it.
        pays: {
            three: { wolf: 700, chest: 100, laurel: 35, doubloon: 8, bone: 8, moon: 3.2 },
            two: { wolf: 8, chest: 3, laurel: 1.5, doubloon: 1, bone: 0.5, moon: 0.4 },
        },
    },

    slot2: {
        id: "slot2",
        label: "The Harvest",
        blurb: "Pays more often than not. Rarely pays big.",
        // FOUR symbols, where Wolf's Luck has six — and that, not the weights, is what makes this the
        // grinder. How often three reels show a repeat is driven almost entirely by how FEW distinct
        // symbols there are: six symbols cannot be made to pay "more often than not" at any payout, and the
        // first attempt at this machine tried and came out at 53% of pulls and a 78% return. Four symbols
        // pays on 74% of pulls before a single number is chosen.
        //
        // The cost is the top prize — 80x against Wolf's Luck's 700 and Moonrise's 4,000 — and the cost is
        // the point. This machine is for sitting at, not for chasing.
        symbols: [
            { id: "wolf", label: "Wolf", weight: 3 },
            { id: "chest", label: "Chest", weight: 8 },
            { id: "laurel", label: "Laurel", weight: 14 },
            { id: "moon", label: "Moon", weight: 20 },
        ],
        // The frequent payouts are moon and laurel pairs, and they are paid REAL money — 0.5x and 0.9x —
        // rather than the 0.15x a machine like this could get away with. A grinder whose constant small
        // wins are all a fifth of the stake is not a grinder, it is a slower shredder telling you it is
        // paying you.
        // The Tray tips out on a moon triple, so the moon lines are what pay for it. Three moons returns
        // your stake exactly now rather than 1.2x — which is the right shape anyway: the triple is no longer
        // the prize, it is the thing that HANDS you the prize you have been filling all session.
        pays: {
            three: { wolf: 80, chest: 12, laurel: 3, moon: 1 },
            two: { wolf: 7, chest: 2, laurel: 0.83, moon: 0.3 },
        },
    },

    slot3: {
        id: "slot3",
        label: "The Deep",
        blurb: "Only triples pay. One of them pays 4,000x.",
        symbols: [
            { id: "wolf", label: "Wolf", weight: 1 },
            { id: "moon", label: "Moon", weight: 2 },
            { id: "chest", label: "Chest", weight: 4 },
            { id: "laurel", label: "Laurel", weight: 7 },
            { id: "star", label: "Star", weight: 10 },
            { id: "bone", label: "Bone", weight: 21 },
        ],
        // No pair table at all. The whole return sits on triples and on the scatter below, which is what
        // makes this the volatile one: most pulls are nothing, and the ones that are not are enormous.
        //
        // THE FIRST VERSION OF THIS TABLE RETURNED 173% and check:casino caught it before a single pull.
        // The leak was not the 4,000x jackpot — that is worth 4.4% of the return, because it lands once in
        // ninety thousand pulls. It was BONE, the common symbol, whose triple lands on one pull in ten: at
        // 4x that one line alone paid 40% of the bet back forever. On a machine like this the common
        // symbol's triple has to be worth almost nothing, and here it is worth 1.2x — a hand back, plus a
        // little, which is the right size for the thing that happens all the time.
        // Three stars paid 15x — the single biggest line on the machine. It pays 2x now and OPENS
        // MOONRISE: eight free spins at double. That is worth roughly what the 15x was, and the difference
        // between them is the entire argument for bonuses — one is a number that appears and is gone, the
        // other is eight spins you get to watch knowing every one of them is doubled.
        //
        // The scatter drops from 1.33x to 1.1x to pay for Moonstruck, which is funded by the dead pulls it
        // is made of.
        pays: {
            three: { wolf: 4000, moon: 1200, chest: 200, laurel: 40, star: 2, bone: 1.1 },
            two: {},
        },
        // ── THE SCATTER ── stars pay wherever they land, not only in a line, and it takes TWO of them. It
        // exists for one reason: a machine that pays on 8% of pulls reads as broken however good its
        // average is, and twenty dead pulls in a row is how somebody decides the floor is rigged.
        //
        // Two, not one. A single star pays on 40% of pulls, which would have made the chase machine the
        // most frequent payer on the floor and quietly deleted the reason it exists.
        scatter: { id: "star", pays: { 2: 0.9 } },
    },
};

/** The machine somebody is actually standing at, defaulting to the one this floor opened with. */
export const slotMachine = (id) => SLOT_MACHINES[id] || SLOT_MACHINES.slot;

// Wolf's Luck by name, kept because the room and the check script both grew up with it. Not a copy — the
// same objects.
export const SLOT_SYMBOLS = SLOT_MACHINES.slot.symbols;
export const SLOT_PAYS = SLOT_MACHINES.slot.pays;

/** What one spin pays, as a multiple of the bet. The single source of truth for a result — the screen shows
 *  what this returned rather than working it out again. */
export function slotPayout(reels, machineId = "slot") {
    const m = slotMachine(machineId);
    const [a, b, c] = reels;
    if (a === b && b === c) return m.pays.three[a] || 0;
    // A genuine pair, and only reached when it is NOT three of a kind — that case is handled above and would
    // otherwise be counted twice.
    const pair = a === b ? a : b === c ? b : a === c ? a : null;
    const line = pair ? (m.pays.two[pair] || 0) : 0;
    if (!m.scatter) return line;
    // Scatter pays INSTEAD of a line, not on top of it — Moonrise has no pair table, so the two can never
    // both be non-zero anyway, but stacking them would be a way to quietly add return nobody priced.
    const stars = reels.filter((r) => r === m.scatter.id).length;
    return Math.max(line, m.scatter.pays[stars] || 0);
}

/** Exact return-to-player, enumerated over every combination rather than sampled.
 *  Exported so the check script and the game read the SAME number from the SAME table. */
export function slotRtp(machineId = "slot") {
    const m = slotMachine(machineId);
    const total = m.symbols.reduce((n, s) => n + s.weight, 0);
    let paid = 0;
    for (const a of m.symbols) {
        for (const b of m.symbols) {
            for (const c of m.symbols) {
                const p = (a.weight / total) * (b.weight / total) * (c.weight / total);
                paid += p * slotPayout([a.id, b.id, c.id], machineId);
            }
        }
    }
    return paid;
}

/** How often a machine pays ANYTHING. A number worth having next to the return: they are the two halves of
 *  what a machine feels like, and either one alone describes it wrong. */
export function slotHitRate(machineId = "slot") {
    const m = slotMachine(machineId);
    const total = m.symbols.reduce((n, s) => n + s.weight, 0);
    let hits = 0;
    for (const a of m.symbols) {
        for (const b of m.symbols) {
            for (const c of m.symbols) {
                if (slotPayout([a.id, b.id, c.id], machineId) > 0) {
                    hits += (a.weight / total) * (b.weight / total) * (c.weight / total);
                }
            }
        }
    }
    return hits;
}

const pickSymbol = (machineId = "slot") => {
    const syms = slotMachine(machineId).symbols;
    const total = syms.reduce((n, s) => n + s.weight, 0);
    let r = Math.random() * total;
    for (const s of syms) { r -= s.weight; if (r <= 0) return s.id; }
    return syms[syms.length - 1].id;
};

const clampBet = (v) => Math.max(MIN_BET, Math.min(MAX_BET, Math.round(Number(v) || 0)));


// ── WHAT A MACHINE REMEMBERS ABOUT YOU ───────────────────────────────────────────────────────────────────────
// Four of the six bonuses carry state between pulls, so a pull stopped being a pure function of the reels.
// The meter is per player PER MACHINE — a tray filled at Den Fortune has nothing to do with a streak at
// Moonrise, and sharing one row between cabinets would let a feature on one fund a feature on another.
//
// Everything in it is in STAKE UNITS. See migration 394 for why that is not a detail.
async function loadMeter(buyerId, machineId) {
    const row = await db.queryOne(
        // `banks` was missing from this list when the column was added, so every pull loaded three empty
        // banks, fed them one coin, and saved that — 36 coins fed across 70 pulls left one coin standing.
        // A meter that is written but never read is worse than one that does not exist.
        `SELECT tray, streak, free_pulls, free_mult, pending, banks FROM mkt_casino_meter WHERE buyer_id = $1 AND machine = $2`,
        [buyerId, machineId],
    ).catch(() => null);
    if (!row) return emptyMeter();
    const banks = typeof row.banks === "string" ? JSON.parse(row.banks || "{}") : (row.banks || {});
    return {
        tray: Number(row.tray) || 0,
        streak: Number(row.streak) || 0,
        freePulls: Number(row.free_pulls) || 0,
        freeMult: Number(row.free_mult) || 1,
        pending: Number(row.pending) || 0,
        banks: Object.keys(banks).length ? banks : emptyBanks(),
    };
}

// The key is (buyer_id, machine) and it is a real PRIMARY KEY, so this ON CONFLICT names the whole of it.
// Naming less than the key is a 42P10 and naming a partial index without its WHERE is two weeks of silently
// lost writes; this codebase has paid for both.
const saveMeter = (buyerId, machineId, meter) => db.query(
    `INSERT INTO mkt_casino_meter (buyer_id, machine, tray, streak, free_pulls, free_mult, pending, banks, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (buyer_id, machine) DO UPDATE
        SET tray = $3, streak = $4, free_pulls = $5, free_mult = $6, pending = $7, banks = $8, updated_at = NOW()`,
    [buyerId, machineId, meter.tray, meter.streak, meter.freePulls, meter.freeMult, meter.pending,
        JSON.stringify(meter.banks || emptyBanks())],
).catch(() => {});

/** Every meter a member has, for the room to draw. */
export async function casinoMeters(buyerId) {
    if (!buyerId) return {};
    const rows = await db.query(
        // `banks` missing here too — the same omission as in loadMeter, in the other query that reads this
        // table. The banks filled correctly on the server and the room drew three empty pigs, which is the
        // worst version of the bug: nothing looks broken, the feature just silently does not exist.
        `SELECT machine, tray, streak, free_pulls, free_mult, pending, banks FROM mkt_casino_meter WHERE buyer_id = $1`,
        [buyerId],
    ).catch(() => []);
    return Object.fromEntries(rows.map((r) => [r.machine, {
        tray: Number(r.tray) || 0,
        streak: Number(r.streak) || 0,
        freePulls: Number(r.free_pulls) || 0,
        freeMult: Number(r.free_mult) || 1,
        pending: Number(r.pending) || 0,
        mult: moonstruckMult(Number(r.streak) || 0),
        banks: (typeof r.banks === "string" ? JSON.parse(r.banks || "{}") : (r.banks || {})),
    }]));
}

/**
 * ONE PULL.
 *
 * The bet is taken FIRST and atomically — `gold >= $2` in the UPDATE, so two taps cannot both spend the same
 * coin and a member can never bet gold they do not have. If that write does not come back, nothing else
 * happens: there is no version of this where the reels roll on credit.
 *
 * The payout is computed from the same table the RTP is computed from, so what the machine pays and what the
 * check script proves it pays cannot come apart.
 */
export async function spinSlot(buyerId, { bet, machine } = {}) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    // An unknown cabinet name falls back to Wolf's Luck rather than erroring: `machine` arrives in a POST
    // body, and the worst a lie about it can do is pay you from a table that was itself checked.
    const m = slotMachine(machine);
    const stake = clampBet(bet);

    // A pull banked by Pack Call or Moonrise costs nothing. The meter is read BEFORE the stake is taken,
    // because whether there is a stake to take is the first thing it decides.
    const meter = await loadMeter(buyerId, m.id);
    const free = meter.freePulls > 0;

    const perks = await casinoPerks(buyerId);
    // ── ON THE HOUSE ─────────────────────────────────────────────────────────────────────────────────────
    // Copper Paw and the Night Auditor pay for the odd play. Refunded AFTER the debit rather than skipping
    // it, so the ledger still shows the bet being placed and the stake coming back — a play that never
    // appears in the coin log is a play nobody can audit.
    let onHouse = false;
    let paid;
    if (free) {
        // No debit, no ledger row for a bet that was not placed — and the free pull is spent here so a
        // failure further down cannot hand out the same pull twice.
        meter.freePulls -= 1;
        paid = await db.queryOne(`SELECT gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
        if (!paid) return { ok: false, error: "no_gold" };
    } else {
        paid = await db.queryOne(
            `UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`,
            [buyerId, stake],
        ).catch(() => null);
        if (!paid) return { ok: false, error: "no_gold" };
        await logCoin(buyerId, -stake, "casino_slot_bet", { balanceAfter: paid.gold, meta: { bet: stake, machine: m.id } });
    }

    if (!free && onTheHouse(perks)) {
        const back = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`,
            [buyerId, stake]).catch(() => null);
        if (back) {
            onHouse = true;
            paid.gold = back.gold;
            await logCoin(buyerId, stake, "casino_on_the_house", { balanceAfter: back.gold, meta: { game: "slot" } });
        }
    }

    const reels = [pickSymbol(m.id), pickSymbol(m.id), pickSymbol(m.id)];

    // ── WHAT THE FEATURES DO TO THIS PULL ────────────────────────────────────────────────────────────────
    // All six live in slot-bonus.js, as one pure function, because logic that decides payouts and lives
    // inside a database call can only be checked by spending money. check:slot-bonus plays millions of pulls
    // through the same function this line calls.
    const fx = applyBonuses({
        machineId: m.id,
        machine: m,
        reels,
        meter,
        free,
        payout: (r) => slotPayout(r, m.id),
        rollSymbol: () => pickSymbol(m.id),
    });
    const { nudged, awarded } = fx;
    const struck = fx.struck;
    const tipped = fx.tipped;
    const mult = fx.mult;

    // ── THE POT ──────────────────────────────────────────────────────────────────────────────────────────
    // Fed by every PAID pull, and takeable by any of them. The chance is proportional to the stake, which is
    // the only fair way: a 2,500 bet contributes a hundred times what a 25 bet does, so it must have a
    // hundred times the chance. Anything else is a machine where the cheap bet is the smart bet.
    let potWon = 0;
    if (hasBonus(m.id, "pot") && !free) {
        await feedPot(stake);
        if (Math.random() < potChance(stake)) potWon = await takePot(buyerId);
    }

    const won = Math.round(stake * mult) + potWon;

    let gold = paid.gold;
    if (won > 0) {
        const back = await db.queryOne(
            `UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`,
            [buyerId, won],
        ).catch(() => null);
        if (back) {
            gold = back.gold;
            // The machine stamps its OWN jackpot. Anything downstream that wants to count them — the badges
            // do — then counts a fact the slot asserted, instead of re-deriving "three wolves" from a
            // multiplier it would have to keep in step with the paytable forever.
            await logCoin(buyerId, won, "casino_slot_win", {
                balanceAfter: gold,
                // Each machine stamps its OWN jackpot, and each one's jackpot is its own top symbol — so
                // the badge that counts them keeps working across three cabinets without knowing there are
                // three. See badges.js: it counts the fact, never re-derives it.
                meta: { bet: stake, reels, mult, machine: m.id, jackpot: reels.every((r) => r === m.symbols[0].id) },
            });
        }
    }
    // Three of a kind on the top symbol is this machine's rarest event, so it is the one that is certain.
    const prize = await rollCasinoPrize(buyerId, { jackpot: reels.every((r) => r === m.symbols[0].id), perks });
    // The five. Rolled on every play at absolute odds — see maybeGrantCasinoPet.
    await tickCasinoQuests(buyerId, "slot", won);
    const pet = withCasinoPerk(await maybeGrantCasinoPet(buyerId).catch(() => null));

    // Double or Nothing gambles the win that is SITTING THERE, so the amount is remembered rather than sent
    // back up and trusted on the way in. Only on a paid pull: gambling a free pull's winnings would be a
    // coin flip on money that cost nothing, which is a different game.
    meter.pending = hasBonus(m.id, "gamble") && won > 0 && !free ? won : 0;
    await saveMeter(buyerId, m.id, meter);

    return {
        ok: true, machine: m.id, reels, mult, bet: stake, won, gold, prize, pet, onHouse,
        free, nudged, awarded, struck: struck > 1 ? struck : null, tipped: tipped > 0 ? tipped : null,
        fed: fx.fed?.length ? fx.fed : null, burst: fx.burst?.length ? fx.burst : null,
        potWon: potWon > 0 ? potWon : null, pot: await readPot(),
        meter: { tray: meter.tray, streak: meter.streak, freePulls: meter.freePulls, freeMult: meter.freeMult, pending: meter.pending, mult: moonstruckMult(meter.streak) },
    };
}

// ── WHAT THE CASINO PETS ARE WORTH ───────────────────────────────────────────────────────────────────────────
// Five pets whose only source is this floor and whose only effect is on this floor. A pet that made you
// better at fighting would be a pet everybody has to chase; these are for people who like the wheel.
//
// EVERY PERK IS BOUNDED, and that is not a style choice — the check script computes each machine's return
// with ALL FIVE owned and fails if it crosses the ceiling. The ceiling is what makes these safe to hand out:
// they cannot be tuned into a money printer by accident, because a printer is what the check is looking for.
//
//   freePlay     the stake comes back. Adds its own value straight onto the return.
//   prizeChance  more non-gold prizes. Does not touch the gold maths at all.
//   prizeTierUp  prizes roll from a better shelf.
//   wheelRefund  a share of a LOSING wheel spin, so it only ever helps where the wheel already took it.
export const CASINO_PETS = COLLECTIBLES.filter((p) => p.casinoExclusive && p.casinoPerk);

// What a perk IS, in a sentence, written once. The floor shows it on the rail and the drop banner says it
// at the moment the pet arrives — a prestige drop whose effect has to be looked up elsewhere lands flat.
export function perkPhrase(k = {}) {
    if (k.freePlay) return `Pays for about 1 play in ${Math.round(1 / k.freePlay)}`;
    if (k.wheelRefund) return `Pushes ${Math.round(Math.min(1, k.wheelRefund / REFUND_CHANCE) * 100)}% back on the odd losing spin`;
    if (k.prizeChance) return "Finds prizes the house missed";
    if (k.prizeTierUp) return "Prizes come off a better shelf";
    return "Works the floor";
}

/** A dropped pet, told what it does. maybeGrantCasinoPet is shared with every other pet source, so the
 *  casino-specific half is added here rather than bent into the generic granter. */
export const withCasinoPerk = (pet) => {
    if (!pet) return null;
    const def = CASINO_PETS.find((p) => p.id === pet.id);
    return { ...pet, perk: perkPhrase(def?.casinoPerk) };
};

/** Everything the pets in a member's collection add up to. Owned, not equipped: these are not combat pets
 *  and making somebody re-equip to use the casino would be a rule nobody would guess. */
export async function casinoPerks(buyerId) {
    const out = { freePlay: 0, prizeChance: 0, prizeTierUp: false, wheelRefund: 0, pets: [] };
    if (!buyerId) return out;
    // OWNERSHIP LIVES IN mkt_cosmetic_unlock. This read mkt_item_collected, which is the COMPENDIUM — every
    // piece of gear you have ever seen — so it matched nothing a pet drop ever writes and every perk on this
    // floor was permanently off. The pets would have dropped, shown their banner, and done nothing forever.
    const rows = await db.query(
        `SELECT ref FROM mkt_cosmetic_unlock WHERE buyer_id = $1 AND category = 'pet'`, [buyerId],
    ).catch(() => []);
    const owned = new Set(rows.map((r) => r.ref));
    for (const pet of CASINO_PETS) {
        if (!owned.has(pet.id)) continue;
        out.pets.push({ id: pet.id, name: pet.name, perk: perkPhrase(pet.casinoPerk) });
        const k = pet.casinoPerk;
        out.freePlay += k.freePlay || 0;
        out.prizeChance += k.prizeChance || 0;
        out.wheelRefund += k.wheelRefund || 0;
        if (k.prizeTierUp) out.prizeTierUp = true;
    }
    return out;
}

/** The stake back, before anything else happens. Returns true when the house is paying for this one. */
const onTheHouse = (perks) => (perks?.freePlay || 0) > 0 && Math.random() < perks.freePlay;



// ── THE POT ──────────────────────────────────────────────────────────────────────────────────────────────────
// One row for the whole floor. Every slot bet on every cabinet feeds it and any pull on any machine can take
// it, which is what makes a shared progressive worth more than three private ones: the number on the wall is
// one everybody is building.
//
// `seed` is the part held back to start the NEXT pot, so a pot that was just won does not read as broken by
// showing a zero. Both halves come out of the same contribution, so the return is still exactly POT_RATE.
export async function readPot() {
    const row = await db.queryOne(`SELECT amount, seed, won_by, won_amount, won_at FROM mkt_casino_pot WHERE id = 'floor'`)
        .catch(() => null);
    if (!row) return { amount: 0, seed: 0 };
    return {
        amount: Number(row.amount) || 0,
        seed: Number(row.seed) || 0,
        lastWin: row.won_at ? { amount: Number(row.won_amount) || 0, at: row.won_at } : null,
    };
}

/** Every paid pull pays into the pot. Free pulls do not — nothing was staked, so there is nothing to take a
 *  slice of, and crediting them would be the house feeding its own jackpot. */
// ── ROUNDING A FRACTION OF A SMALL BET ───────────────────────────────────────────────────────────────────────
// 3% of a 25 bet is 0.75 gold, and rounding that to 1 is a 33% overpayment on every minimum-stake pull —
// which is most of them. Rounding the two halves SEPARATELY was worse still: 0.6 rounded to 1 and 0.15
// rounded to 0, so the pot took more than its share and the seed never filled at all. Measured: 70 gold into
// the pot over 70 pulls where 53 was owed.
//
// Stochastic rounding instead — take the whole number, then the fraction as a probability. Over any run of
// pulls the average is exactly the rate, which is the property the ceiling was priced on; on a single pull it
// is a coin nobody sees.
const roundStochastic = (x) => Math.floor(x) + (Math.random() < (x % 1) ? 1 : 0);

const feedPot = (stake) => db.query(
    `UPDATE mkt_casino_pot SET amount = amount + $1, seed = seed + $2, updated_at = NOW() WHERE id = 'floor'`,
    [roundStochastic(stake * POT_RATE * (1 - POT_SEED_SHARE)), roundStochastic(stake * POT_RATE * POT_SEED_SHARE)],
).catch(() => {});

/**
 * Take the pot, if this pull took it.
 *
 * The whole amount moves in ONE conditional update — `amount = seed, seed = 0` guarded on the amount being
 * unchanged — so two players hitting in the same instant cannot both be paid it. Whoever's update lands first
 * wins it; the other reads back zero and is paid nothing, which is the only correct answer.
 */
async function takePot(buyerId) {
    const before = await db.queryOne(`SELECT amount, seed FROM mkt_casino_pot WHERE id = 'floor'`).catch(() => null);
    const amount = Number(before?.amount) || 0;
    if (amount <= 0) return 0;
    const claimed = await db.queryOne(
        `UPDATE mkt_casino_pot
            SET amount = seed, seed = 0, won_at = NOW(), won_by = $1, won_amount = $2, updated_at = NOW()
          WHERE id = 'floor' AND amount = $2
      RETURNING won_amount`,
        [buyerId, amount],
    ).catch(() => null);
    return claimed ? amount : 0;
}

// ── WHAT THE BOUNTIES COUNT ──────────────────────────────────────────────────────────────────────────────────
// One function for all three machines, so the fourth one somebody adds cannot quietly fail to tick a card.
// The per-game metric is what lets a bounty ask for the WHEEL specifically rather than for "gamble more",
// which is the difference between a bounty and a nag.
export async function tickCasinoQuests(buyerId, game, won) {
    await bumpQuestProgress(buyerId, "casino_play", 1).catch(() => {});
    await bumpQuestProgress(buyerId, `casino_${game}`, 1).catch(() => {});
    if (won > 0) await bumpQuestProgress(buyerId, "casino_win", 1).catch(() => {});
}

// ── THE PRIZE ON TOP ─────────────────────────────────────────────────────────────────────────────────────────
// Luke's brief again: "it's a gold sink with a chance to win like chests, laurels, doubloons, pet stones,
// consumables, recipes." Gold alone makes the floor a shredder with a slightly slower blade — what makes a
// machine worth sitting at is the possibility of something you cannot buy with the gold it just took.
//
// TWO WAYS TO GET ONE, and the split is the whole design:
//
//   the rare roll   a flat chance on ANY play, win or lose. It is small, it is not tied to the gold outcome,
//                   and it means a losing session can still turn up something — which is what stops a bad
//                   run being purely a bad run.
//   the jackpot     three wolves, five of five, or the wolf pocket. Guaranteed, and from a better shelf.
//
// PRIZES ARE ON TOP OF THE RETURN, deliberately, and the check script says so out loud rather than folding
// them into the RTP. The gold maths is exact and provable; a chest is worth whatever a chest is worth to the
// person who opened it, and pretending otherwise would be a number that looks rigorous and is invented.
// The rate is kept low enough that it cannot become the reason to play.
export const PRIZE_CHANCE = 0.015;    // any play, win or lose

// What the shelves hold. Weighted, and the tiers move up with the occasion rather than the table changing.
export const PRIZE_SHELF = [
    { kind: "doubloons", weight: 34 },
    { kind: "consumable", weight: 26 },
    { kind: "chest", weight: 20 },
    { kind: "recipe", weight: 10 },
    { kind: "seed", weight: 6 },
    { kind: "gear", weight: 4 },
];

const pickPrize = () => {
    const total = PRIZE_SHELF.reduce((n, p) => n + p.weight, 0);
    let r = Math.random() * total;
    for (const p of PRIZE_SHELF) { r -= p.weight; if (r <= 0) return p.kind; }
    return "doubloons";
};

/**
 * Roll for something that is not gold.
 *
 * `jackpot` means the machine did its rarest thing, so a prize is certain and comes from a better tier. Every
 * other play takes the flat chance. Granting goes through the SAME function a fishing haul uses, so a chest
 * from a slot machine and a chest from the sea are the same chest and land in the same place.
 */
export async function rollCasinoPrize(buyerId, { jackpot = false, perks = null } = {}) {
    const chance = PRIZE_CHANCE + (perks?.prizeChance || 0);
    if (!jackpot && Math.random() >= chance) return null;
    let tier = jackpot
        ? (Math.random() < 0.35 ? "legendary" : "epic")
        : (Math.random() < 0.2 ? "rare" : "common");
    // The Magpie never takes the smaller shiny.
    if (perks?.prizeTierUp) {
        const ladder = ["common", "rare", "epic", "legendary"];
        tier = ladder[Math.min(ladder.length - 1, ladder.indexOf(tier) + 1)] || tier;
    }
    const kind = jackpot && Math.random() < 0.5 ? "chest" : pickPrize();
    const prize = await grantHaul(buyerId, kind, tier).catch(() => null);
    if (prize) {
        // NOT logCoin: it drops any event with a zero delta ("no-op rows add noise"), and a prize moves no
        // gold, so every prize this floor has ever handed out was silently unrecorded. The activity log is
        // where non-gold events belong anyway, and it is what the casino badges count.
        await trackActivity(buyerId, "casino_prize", { kind: prize.kind, tier, jackpot }).catch(() => {});
    }
    return prize ? { ...prize, tier, jackpot } : null;
}


/**
 * DOUBLE OR NOTHING.
 *
 * The only bet in the building with no edge on it: exactly even money, entirely optional, and it costs the
 * ceiling nothing because its expected value is precisely zero. A gamble feature at 48% would be the house
 * taking a second bite out of a win it has already raked, which is the sort of thing a player finds out
 * about eventually and never forgives.
 *
 * The amount comes from the METER, never from the request. `pending` is what the last paid pull actually
 * won, recorded server-side, so the size of the gamble is not something a POST body gets an opinion about.
 */
export async function gambleWin(buyerId, { machine } = {}) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const m = slotMachine(machine);
    if (!hasBonus(m.id, "gamble")) return { ok: false, error: "no_gamble" };

    const meter = await loadMeter(buyerId, m.id);
    const stake = Math.round(meter.pending || 0);
    if (stake <= 0) return { ok: false, error: "nothing_to_gamble" };

    // The win is already in the player's gold, so the gamble takes it back first and pays the result. Taking
    // it back with the same `gold >= $2` guard every other bet uses means a gamble can never go through on
    // gold that has already been spent elsewhere.
    const taken = await db.queryOne(
        `UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`,
        [buyerId, stake],
    ).catch(() => null);
    if (!taken) return { ok: false, error: "no_gold" };
    await logCoin(buyerId, -stake, "casino_gamble_bet", { balanceAfter: taken.gold, meta: { machine: m.id } });

    const won = Math.random() < GAMBLE_WIN_CHANCE;
    let gold = taken.gold;
    if (won) {
        const back = await db.queryOne(
            `UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, stake * 2],
        ).catch(() => null);
        if (back) {
            gold = back.gold;
            await logCoin(buyerId, stake * 2, "casino_gamble_win", { balanceAfter: gold, meta: { machine: m.id } });
        }
    }

    // Win or lose, the gamble is over — a win cannot be rolled again, or "even money" becomes a martingale
    // and the variance stops being anything the floor priced.
    meter.pending = 0;
    await saveMeter(buyerId, m.id, meter);
    return { ok: true, machine: m.id, staked: stake, won, payout: won ? stake * 2 : 0, gold };
}

// ── THE WHEEL ────────────────────────────────────────────────────────────────────────────────────────────────
// Roulette, in the Den's own shape rather than a copy of Monte Carlo. A real European wheel returns 97.3%
// (36/37) and an American one 94.7% — the first is above our ceiling and the second only just under it, and
// both are the way they are because a physical wheel has to have 37 pockets. Ours does not.
//
// Twenty segments: nine gold, nine violet, and TWO wolves. The wolves are the house's edge made visible —
// they are on the wheel where you can see them, rather than hidden in a payout that is quietly short.
//
// How often the Croupier's Cat pushes chips back. The PET carries the expected cost; this only decides
// whether that cost arrives as a dribble or as a moment. See spinWheel.
export const REFUND_CHANCE = 0.05;

// ── EVERY PET OWNED ──────────────────────────────────────────────────────────────────────────────────────────
// The worst case the odds have to survive. check-casino runs each machine's return through perkedRtp with
// THIS and fails if any of them crosses the ceiling — so a perk cannot be nudged upward without the gate
// noticing. Built from the pet list rather than typed out, because a hand-copied budget is a budget that
// silently stops matching the pets.
export const MAX_PERKS = CASINO_PETS.reduce((out, pet) => {
    const k = pet.casinoPerk || {};
    out.freePlay += k.freePlay || 0;
    out.prizeChance += k.prizeChance || 0;
    out.wheelRefund += k.wheelRefund || 0;
    if (k.prizeTierUp) out.prizeTierUp = true;
    return out;
}, { freePlay: 0, prizeChance: 0, wheelRefund: 0, prizeTierUp: false });

/**
 * A machine's return once the pets are in play — the one formula, used by the games' pricing and by the
 * check script, so the gate can never be checking arithmetic the floor does not run.
 *   freePlay    hands the stake back on some plays, which adds its own rate straight onto the return
 *   wheelRefund pays a share of a LOSS, and only on plays that were not already free
 * prizeChance and prizeTierUp are deliberately absent: they buy chests, not gold, and folding a chest into
 * a percentage produces a number that looks rigorous and is invented.
 */
export function perkedRtp(base, perks = MAX_PERKS, lossChance = 0) {
    const free = Math.min(1, perks?.freePlay || 0);
    return base + free + (1 - free) * lossChance * (perks?.wheelRefund || 0);
}

// Every bet on this wheel returns exactly 90%, which is deliberate: there is no "smart" bet to discover and
// no trap bet to fall into. What you choose changes the SHAPE of the outcome — often and small, or rarely and
// enormous — and never the value of it.
export const WHEEL = [
    ...Array.from({ length: 9 }, (_, i) => ({ i, kind: "gold" })),
    ...Array.from({ length: 9 }, (_, i) => ({ i: i + 9, kind: "violet" })),
    { i: 18, kind: "wolf" }, { i: 19, kind: "wolf" },
];

export const WHEEL_BETS = {
    gold:   { label: "Gold", pays: 2, hits: (seg) => seg.kind === "gold" },
    violet: { label: "Violet", pays: 2, hits: (seg) => seg.kind === "violet" },
    wolf:   { label: "Wolf", pays: 9, hits: (seg) => seg.kind === "wolf" },
    // One pocket out of twenty. The long shot, and the only bet on the floor that can pay 18x.
    single: { label: "One pocket", pays: 18, hits: (seg, pick) => seg.i === Number(pick) },
};

/** Exact return for one wheel bet, enumerated over all twenty pockets. */
export function wheelRtp(betId, pick = 0) {
    const bet = WHEEL_BETS[betId];
    if (!bet) return 0;
    const wins = WHEEL.filter((seg) => bet.hits(seg, pick)).length;
    return (wins / WHEEL.length) * bet.pays;
}

// ── ONE WHEEL, EVERYBODY'S CHIPS ─────────────────────────────────────────────────────────────────────────────
// The wheel is shared now: bets go on during a forty-five-second window, then it spins once and every chip on
// the floor is scored against the same pocket. That is what roulette IS — a table where each player gets a
// private wheel is a slot machine with a wheel painted on it.
//
// Which means a spin no longer resolves in the request that placed the bet, and it must not: you choose your
// pocket, so a draw you could see before betting again would be an unlimited payout. The outcome does not
// exist until the window shuts — see casino-rounds.js.
export async function spinWheel(buyerId, { bet, choice = "gold", pick = 0 } = {}) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const rule = WHEEL_BETS[choice];
    if (!rule) return { ok: false, error: "bad_bet" };
    const stake = clampBet(bet);
    const cleanPick = Math.max(0, Math.min(WHEEL.length - 1, Math.round(Number(pick) || 0)));

    // Anything owed from an earlier round is paid before the new bet goes on, so a player never has two
    // rounds of winnings stacked up behind a stake they are about to place.
    const settled = await settleWheel(buyerId);

    const perks = await casinoPerks(buyerId);
    const placed = await placeBet(buyerId, "wheel", {
        stake, choice: { bet: choice, pick: cleanPick }, reason: "casino_wheel_bet",
    });
    if (!placed.ok) return placed;

    // ── ON THE HOUSE ─────────────────────────────────────────────────────────────────────────────────────
    // Copper Paw and the Night Auditor pay for the odd play. Refunded AFTER the debit rather than skipping
    // it, so the ledger still shows the bet being placed and the stake coming back.
    let gold = placed.gold;
    let onHouse = false;
    if (onTheHouse(perks)) {
        const back = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`,
            [buyerId, stake]).catch(() => null);
        if (back) {
            onHouse = true;
            gold = back.gold;
            await logCoin(buyerId, stake, "casino_on_the_house", { balanceAfter: back.gold, meta: { game: "wheel" } });
        }
    }

    // The bounty ticks when you PLAY, which is now: the chips are down. What the wheel does with them is a
    // separate moment, and tying a daily task to it would mean a bounty you complete by waiting.
    await tickCasinoQuests(buyerId, "wheel", 0);

    return {
        ok: true, placed: true, round: placed.round, closesAt: placed.closesAt,
        bet: stake, choice, pick: cleanPick, gold, onHouse, settled,
    };
}

/** One pocket, rolled once for the whole floor. Only ever called for a round that has already closed. */
const rollWheel = () => ({ seg: WHEEL[Math.floor(Math.random() * WHEEL.length)] });

/** Score one chip against the pocket the wheel actually stopped in. */
function scoreWheel(choice, outcome, stake) {
    const rule = WHEEL_BETS[choice?.bet];
    if (!rule) return { won: 0, detail: { hit: false } };
    const hit = rule.hits(outcome.seg, choice.pick);
    return { won: hit ? Math.round(stake * rule.pays) : 0, detail: { hit, seg: outcome.seg } };
}

/**
 * Pay out everything whose round has closed. Runs whenever anybody looks at the wheel, which is what makes
 * a scheduler unnecessary — nothing has to happen the instant a round ends, it only has to have happened by
 * the time somebody asks.
 */
export async function settleWheel(buyerId) {
    const done = await settleBets(buyerId, "wheel", {
        roll: rollWheel, score: scoreWheel, reason: "casino_wheel_win",
    });
    if (!done.length) return [];

    // The floor's furniture fires once per settled round, not once per bet: two chips on one spin is one
    // play, and rolling a prize per chip would price a feature nobody costed.
    const perks = await casinoPerks(buyerId);
    const jackpot = done.some((d) => d.detail?.hit && d.choice?.bet === "wolf");
    const prize = await rollCasinoPrize(buyerId, { jackpot, perks });
    const pet = withCasinoPerk(await maybeGrantCasinoPet(buyerId).catch(() => null));
    const won = done.reduce((n, d) => n + d.won, 0);
    if (won > 0) await tickCasinoQuests(buyerId, "wheel_win", won);
    return done.map((d, i) => (i === 0 ? { ...d, prize, pet } : d));
}

// ── KENO ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Pick five from forty; the house draws ten. What you are paid depends on how many of yours came up, and the
// odds are HYPERGEOMETRIC — drawing without replacement — which is why the check script computes them with
// factorials rather than sampling. Five hits out of five is a 1-in-2,600 event and no simulation short of
// millions of runs would price it honestly.
export const KENO_POOL = 40;
export const KENO_PICKS = 5;
export const KENO_DRAWN = 10;

// By how many of your five came up. Nothing for two or fewer than two is deliberate — a game that pays on
// almost every ticket is a game where nothing means anything.
export const KENO_PAYS = { 0: 0, 1: 0, 2: 0.5, 3: 3, 4: 25, 5: 600 };

const choose = (n, k) => {
    if (k < 0 || k > n) return 0;
    let r = 1;
    for (let i = 1; i <= k; i += 1) r = (r * (n - k + i)) / i;
    return r;
};

/** The exact chance of matching `k` of your picks. Hypergeometric, so this is arithmetic and not an estimate. */
export function kenoChance(k) {
    return (choose(KENO_PICKS, k) * choose(KENO_POOL - KENO_PICKS, KENO_DRAWN - k)) / choose(KENO_POOL, KENO_DRAWN);
}

export function kenoRtp() {
    let r = 0;
    for (let k = 0; k <= KENO_PICKS; k += 1) r += kenoChance(k) * (KENO_PAYS[k] || 0);
    return r;
}

// ── ONE DRAW, EVERYBODY'S TICKETS ────────────────────────────────────────────────────────────────────────────
// Keno is shared too, and for the same reason the wheel is: everybody in the window plays the same ten balls.
// A keno lounge where each player gets private numbers is a slot machine with a grid on it.
//
// And the same rule holds, harder: you PICK your numbers, so a draw visible before the window shuts would let
// anybody buy a five-of-five ticket every round. The ten balls do not exist until the round is over.
export async function playKeno(buyerId, { bet, picks = [] } = {}) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    // The ticket is validated here and not trusted: a POST body can carry six numbers, or the same number
    // five times, or 400. Any of those would break the odds this game was priced on.
    const clean = [...new Set((Array.isArray(picks) ? picks : []).map((n) => Math.round(Number(n))))]
        .filter((n) => n >= 1 && n <= KENO_POOL);
    if (clean.length !== KENO_PICKS) return { ok: false, error: "bad_ticket" };
    const stake = clampBet(bet);

    const settled = await settleKeno(buyerId);
    const perks = await casinoPerks(buyerId);
    const placed = await placeBet(buyerId, "keno", { stake, choice: { picks: clean }, reason: "casino_keno_bet" });
    if (!placed.ok) return placed;

    let gold = placed.gold;
    let onHouse = false;
    if (onTheHouse(perks)) {
        const back = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`,
            [buyerId, stake]).catch(() => null);
        if (back) {
            onHouse = true;
            gold = back.gold;
            await logCoin(buyerId, stake, "casino_on_the_house", { balanceAfter: back.gold, meta: { game: "keno" } });
        }
    }
    await tickCasinoQuests(buyerId, "keno", 0);

    return { ok: true, placed: true, round: placed.round, closesAt: placed.closesAt, bet: stake, picks: clean, gold, onHouse, settled };
}

/** Ten balls from forty, drawn once for the whole floor. Only ever called for a round that has closed. */
const rollKeno = () => {
    const pool = Array.from({ length: KENO_POOL }, (_, i) => i + 1);
    for (let i = pool.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return { drawn: pool.slice(0, KENO_DRAWN) };
};

function scoreKeno(choice, outcome, stake) {
    const drawn = new Set(outcome.drawn || []);
    const hits = (choice.picks || []).filter((n) => drawn.has(n));
    const pays = KENO_PAYS[hits.length] || 0;
    return { won: Math.round(stake * pays), detail: { hits, pays } };
}

export async function settleKeno(buyerId) {
    const done = await settleBets(buyerId, "keno", { roll: rollKeno, score: scoreKeno, reason: "casino_keno_win" });
    if (!done.length) return [];
    const perks = await casinoPerks(buyerId);
    const jackpot = done.some((d) => (d.detail?.hits || []).length === KENO_PICKS);
    const prize = await rollCasinoPrize(buyerId, { jackpot, perks });
    const pet = withCasinoPerk(await maybeGrantCasinoPet(buyerId).catch(() => null));
    const won = done.reduce((n, d) => n + d.won, 0);
    if (won > 0) await tickCasinoQuests(buyerId, "keno_win", won);
    return done.map((d, i) => (i === 0 ? { ...d, prize, pet } : d));
}

// ── WALKING THE FLOOR ────────────────────────────────────────────────────────────────────────────────────────
// Position is clamped server-side: `x` and `y` arrive in a POST body, and a member standing at x = 4000 would
// be a member standing outside the room.
const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(Number(v)) ? Number(v) : lo));

export async function moveCasino(buyerId, { x, y, facing } = {}) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const cx = clampN(x, 4, 96);
    const cy = clampN(y, 55, 90);
    const f = facing === -1 ? -1 : 1;
    await db.query(
        `INSERT INTO mkt_town_presence (buyer_id, x, y, facing, zone, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (buyer_id) DO UPDATE SET x = $2, y = $3, facing = $4, zone = $5, updated_at = NOW()`,
        [buyerId, cx, cy, f, CASINO_ZONE],
    ).catch(() => {});
    return { ok: true };
}

/** Everybody else on the floor right now. 90 seconds is the tavern's own liveness window — someone who closes
 *  the tab drops off rather than haunting the room. */
export async function casinoOccupants(selfId) {
    const rows = await db.query(
        `SELECT p.buyer_id, p.x, p.y, p.facing, b.display_name, b.alias, b.avatar_sprite_url
           FROM mkt_town_presence p JOIN mkt_buyer b ON b.id = p.buyer_id
          WHERE p.zone = $1 AND p.updated_at > NOW() - INTERVAL '90 seconds'
            AND ($2::uuid IS NULL OR p.buyer_id <> $2)
          LIMIT 30`,
        [CASINO_ZONE, selfId || null],
    ).catch(() => []);
    return rows.map((r) => ({
        id: r.buyer_id,
        name: r.display_name || r.alias || "A gambler",
        x: Number(r.x) || 50,
        y: Number(r.y) || 72,
        facing: Number(r.facing) === -1 ? -1 : 1,
        sprite: r.avatar_sprite_url || null,
    }));
}

/** What the room needs to draw itself: your purse, who else is here, and the machine's own numbers. */
// Everything the two shared games need drawn: the live round, its clock, who is in it, and whatever of
// yours is still waiting on one. Settling runs FIRST — a member who closed the tab mid-round should be paid
// before they are shown anything, not after they wonder where their gold went.
async function sharedRounds(buyerId) {
    const now = Date.now();
    const out = {};
    for (const game of ["wheel", "keno"]) {
        const settled = game === "wheel" ? await settleWheel(buyerId) : await settleKeno(buyerId);
        const round = roundOf(game, now);
        out[game] = {
            round,
            msLeft: Math.max(0, roundEndsAt(game, round) - now),
            roundMs: ROUND_MS[game],
            players: await roundPlayers(game, round),
            mine: await openBets(buyerId, game),
            settled,
        };
    }
    return out;
}

export async function getCasinoState(buyerId) {
    const [me, others] = await Promise.all([
        // The avatar comes down with the gold. Everybody ELSE on this floor has been drawn with their own
        // sprite since it opened (see casinoOccupants), which left the one person the player is actually
        // looking at as the only blank on the screen.
        db.queryOne(`SELECT gold, avatar_sprite_url FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        casinoOccupants(buyerId),
    ]);
    return {
        gold: Number(me?.gold) || 0,
        me: { sprite: me?.avatar_sprite_url || null },
        others,
        // Every cabinet's table, so a machine can show what it pays without another round trip. Functions
        // are deliberately absent — the client renders the numbers, the server decides the outcome.
        slots: Object.fromEntries(Object.values(SLOT_MACHINES).map((m) => [m.id, {
            id: m.id, label: m.label, blurb: m.blurb, symbols: m.symbols, pays: m.pays,
            scatter: m.scatter || null, hitRate: slotHitRate(m.id),
            // ── THE NUMBER ON THE MACHINE'S FACE ────────────────────────────────────────────────────
            // The paytable PLUS its features, because that is what the machine returns. Sending the bare
            // paytable had Den Fortune advertising 84.0% while actually paying 87.9% — under-reporting is
            // the safe direction to be wrong in and it is still wrong, and it is the one number on this
            // floor a player might check.
            rtp: slotRtp(m.id) + bonusEv(m.id, m, slotRtp(m.id), slotHitRate(m.id)).total,
            bonuses: SLOT_BONUSES[m.id] || [],
        }])),
        // The themed reel art, resolved — see SLOT_THEMES. Sent rather than hard-coded in the client
        // because a third of it lives on Blob and only the server can look it up.
        art: await themeArt(),
        meters: await casinoMeters(buyerId),
        pot: await readPot(),
        banks: BANKS.map((b) => ({ id: b.id, label: b.label, reel: b.reel, holds: b.holds, tone: b.tone })),
        slot: { symbols: SLOT_SYMBOLS, pays: SLOT_PAYS, minBet: MIN_BET, maxBet: MAX_BET },
        wheel: { segments: WHEEL, bets: Object.fromEntries(Object.entries(WHEEL_BETS).map(([k, v]) => [k, { label: v.label, pays: v.pays }])) },
        keno: { pool: KENO_POOL, picks: KENO_PICKS, drawn: KENO_DRAWN, pays: KENO_PAYS },
        // ── THE TWO SHARED GAMES ────────────────────────────────────────────────────────────────────
        // Which round is running, when it shuts, who is in it, and anything of yours still riding on one.
        // Settled first, so a member who has been away collects before they see the room.
        rounds: await sharedRounds(buyerId),
        perks: await casinoPerks(buyerId),
    };
}
