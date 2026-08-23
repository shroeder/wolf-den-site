import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";
import { moveChips, chipsFor, CHIP_RATE } from "@/lib/marketplace/chips.js";
import { slot5, playSpin, FREE_SPIN_OFFERS, LINES } from "@/lib/marketplace/casino-slot5.js";
import { MIN_BET, MAX_BET } from "@/lib/marketplace/casino.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { COLLECTIBLES } from "@/lib/marketplace/collectibles.js";

// ── PLAYING THE FIVE-REEL MACHINE ────────────────────────────────────────────────────────────────────────────
// Gold in, chips out, and the gold never comes back. That asymmetry is the whole design (see chips.js), and it
// makes this function simpler than the three-reel one it stands beside: there is no payout to compute in the
// staked currency, no RTP ceiling to respect, and no way for a bug here to mint gold.
//
// THE BET IS TAKEN FIRST AND ATOMICALLY. `gold >= $2` inside the UPDATE, so two taps cannot spend the same
// coin, and if that write does not come back nothing else happens — there is no version of this where the
// reels roll on credit.
//
// THE SPIN IS RESOLVED ON THE SERVER, once, and the client is handed a transcript to play back. The free-spin
// OFFER is the one thing the member decides, and it is decided before the round runs, so the choice cannot be
// made after seeing what it would have paid.

const clampBet = (n) => Math.max(MIN_BET, Math.min(MAX_BET, Math.round(Number(n) || MIN_BET)));

// The floor is still owner-gated. Same gate the rest of the casino uses; the machine is finished long before
// the room is opened, and un-gating is a deliberate act somewhere else.
const OPEN = false;
export const slot5OpenFor = (buyerId) => OPEN || isOwner(buyerId);

/**
 * One press of the button.
 *
 * `offerId` names which free-spin deal the member has chosen. It is read even when no free spins trigger,
 * because the screen offers the choice up front — you pick your deal, then you spin, which is what makes it a
 * decision rather than a menu that appears at the moment it stops mattering.
 */
// ── ⚠ OWNER-ONLY: FORCE A BONUS ─────────────────────────────────────────────────────────────────────────────
// REMOVE BEFORE THE FLOOR OPENS. Registered on the master "remove before launch" checklist.
//
// Free spins come once in ninety-three spins and the pick once in two hundred and thirty-three, which makes
// both of them nearly impossible to LOOK at. Getting the free round on screen for the first time meant either
// spending four thousand gold hunting one or building a fake response — and a fake response only proves the
// code downstream of the fetch, which is exactly the half that was already fine.
//
// REJECTION SAMPLING, NOT A RIGGED GRID. It re-rolls whole spins until one of them naturally triggers, and
// then plays THAT. So the spin on screen is a real spin the engine actually produced, with real reels and a
// real payout, and there is not one line of special-case code anywhere near the payout path — which is the
// part that would be dangerous to have a test hook in.
//
// The chips it mints are logged under their own reason so a forced spin can never be mistaken for play when
// the floor's numbers are read.
const FORCE_TRIES = 40000;
function forcedSpin(m, stake, offerId, want) {
    for (let i = 0; i < FORCE_TRIES; i += 1) {
        const p = playSpin(m, { bet: stake, offerId });
        if (want === "free" && p.free) return p;
        if (want === "pick" && (p.locked || p.hold || p.warren)) return p;
        // A DEEP TUMBLE, ON DEMAND. The chain that opens the free round is one spin in a hundred and thirty
        // two by design, which makes the single most elaborate animation on the floor the one nobody can
        // look at — including me, which is how it shipped unwatched the first time.
        if (want === "chain" && p.chain && p.chain.cascades >= 4) return p;
        // A round that extends itself. Roughly a quarter of free rounds do it, which is often enough to
        // matter and far too rare to sit and wait for while judging how the moment lands.
        if (want === "again" && p.free && p.free.added > 0) return p;
    }
    // Never hang and never lie: if it could not find one, the member gets an ordinary spin.
    return null;
}

// ── WHAT COMES OUT OF A BURROW ───────────────────────────────────────────────────────────────────────────────
// One pool per stage, chosen so the animals get rarer and stranger as the warren gets deeper — field mice and
// chicks near the surface, phoenixes and dragons at the bottom. All of them are pets the Den already draws;
// none of this is new art.
const WARREN_PETS = {
    hollow: ["field_mouse", "pantry_mouse", "bunny", "hedgehog", "frog", "chick", "fox_kit", "beaver"],
    sunken: ["crab", "axolotl", "seahorse", "jellyfish", "turtle", "tropical_fish", "penguin", "reef_seahorse"],
    ember: ["cinder_scarab", "ember_whelp", "imp", "molten_salamander", "pit_beetle", "spice_moth", "cinder_hound"],
    astral: ["fairy", "geode_sprite", "spirit_fox", "lantern_jelly", "raven", "owl", "stormcrow", "butterfly"],
    kinghoard: ["gilded_magpie", "golden_goose", "radiant_phoenix", "elder_dragon", "unicorn", "griffin", "pegasus"],
};
const WARREN_ELDER = "eternal_wolf";

let warrenArtCache = null;
async function warrenArt() {
    // Cached for the life of the server process: it is the same hundred rows for every member and every
    // round, and a bonus that hits the database for its own art on every trigger is a bonus that gets
    // slower the more popular it is.
    if (warrenArtCache) return warrenArtCache;
    const want = [...new Set([...Object.values(WARREN_PETS).flat(), WARREN_ELDER])];
    const rows = await db.query(`SELECT pet_id AS k, url FROM mkt_pet_sprite WHERE pet_id = ANY($1)`, [want])
        .catch(() => []);
    const by = Object.fromEntries(rows.map((r) => [r.k, r.url]));
    warrenArtCache = {
        pets: Object.fromEntries(Object.entries(WARREN_PETS)
            .map(([k, ids]) => [k, ids.map((id) => by[id]).filter(Boolean)])),
        elder: by[WARREN_ELDER] || null,
    };
    return warrenArtCache;
}

export async function spinSlot5(buyerId, { bet, machine, offerId, force } = {}) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    if (!slot5OpenFor(buyerId)) return { ok: false, error: "closed" };

    const m = slot5(machine);
    const stake = clampBet(bet);
    // An unknown offer falls back to the middle one rather than erroring: it arrives in a POST body, and all
    // three are worth the same to within half a percent, so a lie about it buys nothing.
    const offer = FREE_SPIN_OFFERS.find((o) => o.id === offerId) || FREE_SPIN_OFFERS[1];

    const paid = await db.queryOne(
        `UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`,
        [buyerId, stake],
    ).catch(() => null);
    if (!paid) return { ok: false, error: "no_gold" };
    await logCoin(buyerId, -stake, "casino_slot5_bet", { balanceAfter: paid.gold, meta: { bet: stake, machine: m.id } });

    // The force is read from the request but only honoured for the owner — a POST body is something anybody
    // can write, and "the button is hidden" is not a permission check.
    const want = isOwner(buyerId) && ["free", "pick", "chain", "again"].includes(force) ? force : null;
    const r = (want && forcedSpin(m, stake, offer.id, want)) || playSpin(m, { bet: stake, offerId: offer.id });

    // ── CONVERTED ONCE, AT THE END ───────────────────────────────────────────────────────────────────────
    // The engine works in multiples of the bet and knows nothing about chips; the rate is applied here and
    // only here. Rounding once on the total rather than per win matters: three lines paying 0.4 chips each
    // round to zero individually and to one together, and a machine that pays nothing for a three-line win
    // is a machine somebody will rightly call broken.
    const won = chipsFor(stake, r.total / stake);
    let chips = null;
    if (won > 0) {
        chips = await moveChips(buyerId, won, want ? "slot5_forced" : "slot5", {
            ref: m.id,
            meta: { bet: stake, base: r.base.total / stake, free: r.free ? r.free.total / stake : 0, locked: r.locked ? r.locked.total / stake : 0 },
        });
    }

    return {
        ok: true,
        gold: Number(paid.gold),
        chips: chips ?? await chipsOf(buyerId),
        bet: stake,
        // The grid, and everything the grid turned into. The client animates from this and computes nothing.
        grid: r.grid,
        // ── THE TUMBLE ───────────────────────────────────────────────────────────────────────────────
        // A cascading machine sends the WHOLE chain: every grid, which cells broke, the multiplier at that
        // break, and what it paid. The screen shatters and drops from this list — it decides nothing, the
        // same as everywhere else, and it means a cascade can be replayed exactly for a bug report.
        chain: r.chain ? {
            cascades: r.chain.cascades,
            trigger: m.cascade?.trigger || null,
            label: m.cascade?.label || null,
            // ── A RUNNING TOTAL, NOT A SUM OF PARTS ──────────────────────────────────────────────
            // `chips` here is what the WHOLE SPIN is worth up to and including this break, not what this
            // break paid. It has to be, because chipsFor rounds up and floors any win at one chip, so
            // seven separately-rounded steps summed to 42 on a spin that paid 32 — the counter climbed
            // past the payout and then fell back to it. A machine that overstates what it owes you and
            // then corrects itself is worse than one that pays nothing.
            //
            // Running the same rounding over the running gold instead means every value on screen is a
            // real chip figure and the last one IS the payout, exactly.
            steps: (() => {
                let run = 0;
                return r.chain.steps.map((st) => {
                    run += st.paid;
                    return {
                        grid: st.grid,
                        broken: st.broken,
                        mult: st.mult,
                        chips: chipsFor(stake, run / stake),
                        wins: st.wins.map((w) => ({ ...w, chips: chipsFor(stake, w.amount / stake) })),
                    };
                });
            })(),
        } : null,
        // ── THE LOCKS ────────────────────────────────────────────────────────────────────────────────
        // What the member built before the door opened. Sent whole; the taps reveal it in order.
        built: r.built ? {
            picked: r.built.picked,
            spins: r.built.spins,
            base: m.free?.spins || 8,
            mult: r.built.mult,
            label: m.second?.label || "The Locks",
        } : null,
        // ── EVERY LINE ARRIVES ALREADY IN CHIPS ──────────────────────────────────────────────────────
        // The screen used to multiply each line by the rate itself and round, which is the same conversion
        // written twice — and the copy rounded per line instead of once, so a three-doubloon line printed
        // "0 chips" under a line it had just drawn across the grid. Converted here, by the same function
        // that pays the total, and the client only renders the number.
        lines: r.base.wins.filter((w) => w.kind === "line").map((w) => ({ ...w, chips: chipsFor(stake, w.amount / stake) })),
        scatters: r.base.scatters,
        scatterWin: r.base.wins.find((w) => w.kind === "scatter") || null,
        // ── THE FREE ROUND, SPIN BY SPIN ─────────────────────────────────────────────────────────────
        // Every grid, in order, with what each one paid — because the round is PLAYED on the screen rather
        // than summarised. A member who is handed "10 spins ran, 81 chips" has not had a bonus round; they
        // have had a receipt for one.
        //
        // Per-spin chips are converted here, by the same function that pays the total, so the counter can
        // climb as the round runs without the client doing any arithmetic of its own.
        free: r.free ? {
            offer: offer.id,
            // ── THE CABINET'S OWN LABEL ──────────────────────────────────────────────────────────
            // `offer` in this file is always a FREE_SPIN_OFFERS entry — the deal chooser's, which only
            // The Hunt uses — so every cabinet on the floor announced its bonus as "Ten spins". The
            // Harvest opened fourteen tumbling spins at double and the fanfare said "Ten spins"; The
            // Vault opened a round the member had just built and said the same. The engine sets the
            // real one on the round it produced.
            label: r.free.label || offer.label,
            // Which of the five shapes this cabinet's round is — the screen names it, because "ten spins"
            // means something different on a machine whose multiplier climbs than on one whose wilds stick.
            kind: r.free.kind || m.free?.kind || "deals",
            // Opened by the tumbling rather than by a scatter — the screen says which, because they feel
            // completely different and only one of them is something you watched happen.
            byCascade: Boolean(r.free.byCascade),
            // ── ONE `mult`, NOT TWO ──────────────────────────────────────────────────────────────
            // This object carried the key twice: the round's own multiplier, and then a lookup of the
            // offer id in FREE_SPIN_OFFERS. The second one wins in an object literal, and it only
            // resolves for The Hunt — every other cabinet's offer id ("growing", "built", "fixed") is
            // not in that list, so it fell to 1. The Vault reported x1 for a round the member had just
            // spent six taps building to x2, and The Harvest's doubled tumbles reported x1 as well.
            mult: r.free.mult || 1,
            // Spins bought by retriggering, and the round's opening length, so the screen can say "14 + 14"
            // rather than silently showing 28.
            added: r.free.added || 0,
            base: r.free.base || offer.spins,
            // Each free spin carries its winning LINES in chips, exactly like the base spin does, because the
            // screen draws them exactly like the base spin does. Sending the raw engine wins meant the round
            // had nothing to light up and no number to call, which is most of why it played like a
            // fast-forward instead of ten spins.
            spins: r.free.spins.map((sp) => ({
                grid: sp.grid,
                wins: sp.wins
                    .filter((w) => w.kind === "line")
                    .map((w) => ({ ...w, chips: chipsFor(stake, w.amount / stake) })),
                scatterWin: sp.wins.find((w) => w.kind === "scatter") || null,
                chips: chipsFor(stake, sp.total / stake),
                // What this one spin paid as a multiple of the bet, so the screen knows when a single free
                // spin deserves the horns rather than a coin rattle.
                multiple: sp.total / stake,
                // ── A FREE SPIN ON A CASCADING MACHINE IS A CHAIN ────────────────────────────────
                // Same shape as the base game's, so the screen plays it with the same code. Without
                // this The Harvest's free round animated fourteen flat grids — the tumble switched off
                // for the round you play the tumbling machine to reach.
                chain: sp.chain ? {
                    cascades: sp.chain.cascades,
                    trigger: m.cascade?.trigger || null,
                    steps: (() => {
                        let run = 0;
                        return sp.chain.steps.map((st) => {
                            run += st.paid;
                            return {
                                grid: st.grid, broken: st.broken, mult: st.mult,
                                chips: chipsFor(stake, run / stake),
                                wins: st.wins.map((w) => ({ ...w, chips: chipsFor(stake, w.amount / stake) })),
                            };
                        });
                    })(),
                } : null,
                // And whether THIS spin bought more spins, and how — a chain that ran away with itself
                // and a third scatter landing are not the same moment and must not read as one.
                retrigger: sp.retrigger || null,
            })),
            total: r.free.total,
            chips: chipsFor(stake, r.free.total / stake),
        } : null,
        // ── THE WARREN ───────────────────────────────────────────────────────────────────────────────
        // Every stage, every burrow, every critter, resolved before the first tap — the screen reveals, it
        // never decides, which is the same rule the rest of this file follows and the reason a round can be
        // replayed exactly from a bug report. Chips are converted here so the count-up on screen is real
        // money rather than the client's arithmetic.
        warren: r.warren ? {
            label: m.second?.label || "The Warren",
            board: 15,
            reached: r.warren.reached,
            full: r.warren.full,
            stages: r.warren.stages.map((st) => ({
                key: st.key,
                name: st.name,
                opened: st.opened.map((n) => (n.kind === "pups"
                    ? { kind: "pups", pups: n.pups.map((v) => chipsFor(stake, (v * (stake / LINES.length)) / stake)) }
                    : { kind: n.kind })),
            })),
            hoard: r.warren.hoard ? {
                opened: r.warren.hoard.opened.map((o) => (o.kind === "mound"
                    ? { kind: "mound", chips: chipsFor(stake, (o.value * (stake / LINES.length)) / stake) }
                    : { kind: "mother" })),
            } : null,
            chips: chipsFor(stake, r.warren.total / stake),
            // The animals, by stage, so the screen shows the member's own world rather than numbered boxes.
            art: await warrenArt(),
        } : null,

        // ── TEN SPINS, AND EVERY WILD LOCKS ──────────────────────────────────────────────────────────
        // Deliberately the SAME SHAPE as `free`, because it is the same thing — a round of spins the screen
        // plays one at a time — and the client should not need a second player for it. What is different is
        // `held` and `justHeld` per spin, which is the mechanic made visible.
        locked: r.locked ? {
            label: r.locked.label,
            kind: "sticky",
            mult: r.locked.mult || 1,
            added: r.locked.added || 0,
            base: r.locked.base || (m.second?.spins || 10),
            spins: r.locked.spins.map((sp) => ({
                grid: sp.grid,
                wins: sp.wins
                    .filter((w) => w.kind === "line")
                    .map((w) => ({ ...w, chips: chipsFor(stake, w.amount / stake) })),
                scatterWin: sp.wins.find((w) => w.kind === "scatter") || null,
                chips: chipsFor(stake, sp.total / stake),
                multiple: sp.total / stake,
                // Cells already locked when this spin started, and the ones that clamp shut on it.
                held: sp.held || [],
                justHeld: sp.justHeld || [],
                retrigger: sp.retrigger || null,
            })),
            total: r.locked.total,
            chips: chipsFor(stake, r.locked.total / stake),
        } : null,
        // In chips, which is the only number on this screen a member should have to hold in their head.
        wonChips: won,
        // And the multiple, for the "big win" threshold — see the note on celebration below.
        multiple: r.total / stake,
        rate: CHIP_RATE,
        lineCount: LINES.length,
    };
}

// The animals The Deep can haul up. Named rather than derived: a pet's catalogue entry has no "lives in
// water" flag, and inventing one to serve a single bonus round is a schema change to avoid a list.
const SEA_PETS = new Set(["crab", "turtle", "marlin", "dolphin", "penguin", "seahorse", "octopus", "squid",
    "reef_fish", "shark", "narwhal", "jellyfish", "starfish", "lobster", "eel", "pufferfish", "manta",
    "deep_angler", "coelacanth", "whale", "seal", "otter", "walrus", "swordfish", "tuna"]);

// ── WHOSE PETS ───────────────────────────────────────────────────────────────────────────────────────────────
// The member's own, because a bonus round where you pet YOUR animals is a different thing from one where you
// tap anonymous boxes — the pets are the thing they have been collecting all along, and this is the only place
// in the game that pays you for having them.
//
// Falls back to the whole catalogue for anybody who owns none yet, rather than showing an empty paddock: a
// bonus round that looks broken because you have not played another feature is worse than a generic one.
// Sprites come from mkt_pet_sprite, the same table the farm and the boss screen read.

async function chipsOf(buyerId) {
    const row = await db.queryOne(`SELECT COALESCE(chips, 0)::bigint AS chips FROM mkt_buyer WHERE id = $1`, [buyerId]);
    return Number(row?.chips || 0);
}

// ── WHAT COUNTS AS A WIN WORTH CELEBRATING ───────────────────────────────────────────────────────────────────
// About seven wins in ten on a twenty-line machine pay back less than the stake. That is not a trick — it is
// what twenty lines BUYS: a line hit several times a minute instead of a dead screen. But a machine that
// throws a fanfare at a 0.4x is doing the thing Luke objected to in the first place ("its lame to get .2 to
// 1.2"), and real cabinets do exactly that on purpose. It has a name in the trade, "a loss disguised as a
// win", and it is the one thing about them worth refusing to copy.
//
// So the line lights, the chips tick up, and that is all. The horns are for wins that actually beat the stake,
// and the big celebration is for wins that beat it several times over.
export const CELEBRATE_AT = 1;      // below this: the line lights and the counter moves, nothing else
export const BIG_WIN_AT = 10;       // and this is where the room stops what it is doing
