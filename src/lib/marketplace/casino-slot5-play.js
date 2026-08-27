import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";
import { moveChips, chipsFor, CHIP_RATE } from "@/lib/marketplace/chips.js";
import { slot5, playSpin, FREE_SPIN_OFFERS, LINES, COLOSSAL_ROWS, COLOSSAL_TOTAL_LINES } from "@/lib/marketplace/casino-slot5.js";
import { MIN_BET, MAX_BET } from "@/lib/marketplace/casino.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { COLLECTIBLES } from "@/lib/marketplace/collectibles.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { spinSources, splitChips } from "@/lib/marketplace/casino-win-source.js";

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

// ── THE FLOOR IS OPEN (2026-08-26) ───────────────────────────────────────────────────────────────────────────
// This flag is a SECOND, INDEPENDENT gate and it outlived the release by twenty minutes. The casino was opened
// by removing three owner checks — the building on the street, the page's redirect, and the API route — and
// every one of those let a member reach the machines. They then pressed the button and got `closed`, because
// the five-reel cabinets ask this instead of asking the room. Working for exactly one person, which is the
// signature of an owner gate nobody remembered.
//
// The old comment here said un-gating "is a deliberate act somewhere else", which was true and was the trap:
// it pointed at the room without saying that the room opening would not open this. If a feature is ever gated
// twice, grep the WHOLE subsystem for a second flag before calling it released — `OPEN`, `*OpenFor`, and a
// bare `isOwner` in a play path are the three shapes it takes here.
const OPEN = true;
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
function forcedSpin(m, stake, offerId, want, meter = []) {
    for (let i = 0; i < FORCE_TRIES; i += 1) {
        const p = playSpin(m, { bet: stake, offerId, meter });
        if (want === "free" && p.free) return p;
        if (want === "pick" && (p.locked || p.hold || p.warren)) return p;
        // A DEEP TUMBLE, ON DEMAND. The chain that opens the free round is one spin in a hundred and thirty
        // two by design, which makes the single most elaborate animation on the floor the one nobody can
        // look at — including me, which is how it shipped unwatched the first time.
        if (want === "chain" && p.chain && p.chain.cascades >= 4) return p;
        // A round that extends itself. Roughly a quarter of free rounds do it, which is often enough to
        // matter and far too rare to sit and wait for while judging how the moment lands.
        if (want === "again" && p.free && p.free.added > 0) return p;
        // ── A SPIN THAT HOLDS ────────────────────────────────────────────────────────────────────────
        // One spin in seventeen holds a reel, and forcing free spins is NOT the same thing: three scatters
        // can all land on one reel, in which case nothing was ever one short and the machine never held.
        // I proved that by filming it and watching a forced bonus resolve with no hold at all.
        //
        // Same rule the screen uses: walk the reels, count what landed before each one, and keep the spin
        // if any reel arrives exactly one short of opening something.
        // The room past the bottom of the Warren — one bonus in thirty-two, which is one spin in about
        // seven thousand. There is no watching that happen on its own clock.
        if (want === "hoard" && p.warren?.full) return p;
        // The Vault's two. Three moons is the rarest trigger on that cabinet and three tumbles in one spin is
        // not much commoner — neither is something to sit and wait for while judging how it lands.
        if (want === "gems" && p.gems) return p;
        // ── THE COLOSSAL CABINET'S TWO ───────────────────────────────────────────────────────────────
        // `free` already matches its bonus, since playColossal returns a free round in the same field. These
        // two are the things the free round cannot be relied on to show: a WILD COLUMN CROSSING from the
        // small board to the big one — the whole point of the machine, and a full column on a 5x3 is rare —
        // and a five-of-a-kind of one of the giants, which is the top of the paytable and the thing anybody
        // playing it is actually hunting.
        if (want === "send" && (p.colossal?.sent || []).length) return p;
        if (want === "giant" && (p.colossal?.colWins || []).some((w) => (w.symbol === "keeper" || w.symbol === "dire") && w.count >= 4)) return p;
        if (want === "winagain" && p.winAgain) return p;
        if (want === "tease") {
            const targets = [{ sym: m.scatter, need: 3 },
                m.second?.kind === "hold" ? { sym: m.second.trigger, need: m.second.need || 6 }
                    : { sym: m.bonus, need: 5 }].filter((t) => t.sym);
            for (let k = 0; k < p.grid.length; k += 1) {
                for (const t of targets) {
                    let soFar = 0;
                    for (let r = 0; r < k; r += 1) soFar += p.grid[r].filter((x) => x === t.sym).length;
                    if (soFar === t.need - 1) return p;
                }
            }
        }
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

// ── THE WIN IT AGAIN METER ───────────────────────────────────────────────────────────────────────────────────
// The Vault remembers its last few wins and pays the lot back when a spin tumbles three times in a row. Held
// in mkt_casino_meter.recent (mig401) as MULTIPLES OF THE BET, never chips: a meter filled at 25 a spin and
// emptied at 2,500 would hand somebody a number nobody won.
//
// Read before the spin and written after, in one place, so there is no path where a spin pays out of the
// meter and the meter does not move.
async function readMeter(buyerId, machineId) {
    const row = await db.queryOne(
        `SELECT recent FROM mkt_casino_meter WHERE buyer_id = $1 AND machine = $2`, [buyerId, machineId],
    ).catch(() => null);
    const raw = row?.recent;
    const list = Array.isArray(raw) ? raw : [];
    // ── A ZERO IS A ROW ENTRY, NOT A MISSING ONE ─────────────────────────────────────────────────────────
    // This ended in `.filter((n) => n > 0)`, from when only a WINNING spin was pushed and a zero could only
    // mean corrupt data. Then dead spins started pushing blanks — which is the entire tension of the meter,
    // because a blank ages your good wins one place closer to falling off the end — and this line quietly
    // undid all of it: the row went to the database with its blanks and came back COMPACTED, wins shuffled
    // left, always five-of-five full. Luke: "I've never seen a blank in the row, they're always populated."
    // He never could. The engine pushes a blank on 59.6% of spins and the row is genuinely full 1.4% of the
    // time; this filter was rebuilding a full row on every read.
    return list.map((n) => Number(n) || 0);
}

async function saveMeter(buyerId, machineId, recent) {
    await db.query(
        `INSERT INTO mkt_casino_meter (buyer_id, machine, recent, updated_at) VALUES ($1, $2, $3::jsonb, NOW())
         ON CONFLICT (buyer_id, machine) DO UPDATE SET recent = $3::jsonb, updated_at = NOW()`,
        [buyerId, machineId, JSON.stringify(recent)],
    ).catch(() => {});
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
    const want = isOwner(buyerId) && ["free", "pick", "chain", "again", "tease", "hoard", "gems", "winagain"].includes(force) ? force : null;
    // The meter as it stood before this pull. Handed to the engine rather than settled here — see the note
    // on playSpin's `meter` parameter for why that matters to the gate.
    const before = m.winAgain ? await readMeter(buyerId, m.id) : [];
    const r = (want && forcedSpin(m, stake, offer.id, want, before)) || playSpin(m, { bet: stake, offerId: offer.id, meter: before });
    if (m.winAgain) await saveMeter(buyerId, m.id, r.meter || []);

    // ── CONVERTED ONCE, AT THE END ───────────────────────────────────────────────────────────────────────
    // The engine works in multiples of the bet and knows nothing about chips; the rate is applied here and
    // only here. Rounding once on the total rather than per win matters: three lines paying 0.4 chips each
    // round to zero individually and to one together, and a machine that pays nothing for a three-line win
    // is a machine somebody will rightly call broken.
    const won = chipsFor(stake, r.total / stake);
    // ── AND WHERE EVERY ONE OF THOSE CHIPS CAME FROM ─────────────────────────────────────────────────────
    // The ledger used to record the payout and three of the eight places it could have come from, so "was
    // that a payline or a bonus" had no answer for most wins — see the header of casino-win-source.js. The
    // split rides on the chip event because that is the row the admin report reads: it is the ledger, it
    // cannot miss a payout, and it goes back further than casino_play telemetry does.
    const gold = spinSources(r, stake);
    const from = splitChips(won, gold);
    let chips = null;
    if (won > 0) {
        chips = await moveChips(buyerId, won, want ? "slot5_forced" : "slot5", {
            ref: m.id,
            meta: { bet: stake, machine: m.id, forced: Boolean(want), from },
        });
    }

    // WHAT ACTUALLY HAPPENED ON THIS PULL. The features list is the part worth having: a cabinet's tune
    // is mostly its feature rate, and until now the only way to know one was to read the paytable and
    // hope. `forced` marks an owner test spin so the report can drop it.
    const features = [];
    if (r.free) features.push("free");
    if (r.locked) features.push("locked");
    if (r.winAgain) features.push("winagain"); // the row emptying, not r.fired - that field is the CLIENT shape
    if (r.locked?.spins?.some((sp) => sp.retrigger)) features.push("retrigger");
    await trackActivity(buyerId, "casino_play", {
        game: "slot5", machine: m.id, bet: stake,
        wonChips: won, multiple: Number((r.total / stake).toFixed(3)),
        features, forced: Boolean(want), from,
    }).catch(() => {});

    return {
        ok: true,
        gold: Number(paid.gold),
        chips: chips ?? await chipsOf(buyerId),
        bet: stake,
        // The grid, and everything the grid turned into. The client animates from this and computes nothing.
        grid: r.grid,
        // ── THE METER BAR ACROSS THE TOP ─────────────────────────────────────────────────────────────
        // `slots` is what the row holds, `recent` is what is in it AFTER this spin, and `fired` is the
        // payout when three tumbles emptied it. The screen lights the row left to right off `fired`; it
        // has no arithmetic of its own to do.
        meter: m.winAgain ? {
            slots: m.winAgain.slots, need: m.winAgain.need, label: m.winAgain.label,
            // What to DRAW. On an ordinary spin that is the row as it now stands; on a firing spin it is the
            // row the payout was made of, because the animation lights those slots before it empties them.
            // ── IN CHIPS, LIKE EVERY OTHER NUMBER ON THE SCREEN ──────────────────────────────────
            // Luke: "does 7 equal 27? is it using some conversion accidentally?" It was. The row is
            // stored as MULTIPLES OF THE BET (see readMeter — deliberately, so a bet change cannot
            // corrupt it), and the screen was rendering `multiple x bet`, which is the ENGINE's unit,
            // not chips. Chips are `engine x CHIP_RATE`, and CHIP_RATE is 0.25 — so a spin that paid 7
            // chips wrote 27 into the row, every slot read four times too big, and the total promised
            // 606 for a payout of about 152. Converted here, with chipsFor, exactly like the pups and
            // the geode and the win itself. Stored in multiples, shown in chips.
            recent: (r.winAgain ? r.winAgain.row : (r.meter || []))
                .map((v) => (v > 0 ? chipsFor(stake, v) : 0)),
            // ── AND WHAT THE ROW LOOKS LIKE ONCE THE DUST SETTLES ───────────────────────────────
            // `recent` on a firing spin is the row that was PAID, because the animation lights those
            // slots before it empties them — so the row the fire leaves behind was never sent, and the
            // bar sat on the old entries until the next spin replaced them. Luke, having won 401:
            // "I spun once, and got 401, but it put 113 and 8." Those two were the old row, still on
            // screen after the payout that consumed them. This is the row AFTER, so the bar can settle
            // onto it instead of lying about what it is holding.
            next: (r.meter || []).map((v) => (v > 0 ? chipsFor(stake, v) : 0)),
            cleared: Boolean(r.winAgain),
            fired: r.winAgain ? { total: chipsFor(stake, r.winAgain.paid), cascades: r.winAgain.cascades } : null,
        } : null,
        // ── THE GEM VAULT ────────────────────────────────────────────────────────────────────────────
        // The whole board and the order it comes out in. The screen maps the tile a finger landed on to the
        // next stone in that order — see runGems for why that is the honest way round.
        gems: r.gems ? {
            order: r.gems.order, board: r.gems.board, won: r.gems.won, sets: r.gems.sets, tiles: r.gems.tiles,
            total: chipsFor(stake, r.gems.total / stake),
        } : null,
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
        // ── THE COLOSSAL CABINET SENDS TWO GRIDS ─────────────────────────────────────────────────────
        // Its own branch rather than a fifth set of flags threaded through the free-round mapping below,
        // because almost nothing about it is the same shape: two boards, two win lists, a hundred lines
        // between them, a transfer that crosses from one to the other, and a bonus whose length was bought
        // by a scatter count. Everything is converted to chips here, like every other payout in this file.
        colossal: r.colossal ? (() => {
            const c = r.colossal;
            const toChips = (list) => list.map((w) => ({ ...w, chips: chipsFor(stake, w.amount / stake) }));
            const spinOf = (x) => ({
                main: x.main, col: x.col, sent: x.sent, giants: x.giants,
                mainWins: toChips(x.mainWins), colWins: toChips(x.colWins),
                // What the multiplier reel was showing, and what it applied. Sent even when it is 1 so the
                // screen can draw the reel honestly rather than inferring a multiplier from the payout.
                reelMult: x.reelMult, applied: x.applied,
                scatters: x.scatters,
                chips: chipsFor(stake, x.total / stake),
                multiple: x.total / stake,
            });
            return {
                label: m.colossal.label,
                rows: COLOSSAL_ROWS,
                lines: COLOSSAL_TOTAL_LINES,
                ...spinOf(c),
                // The free round, when the pair of boards found three moons. `bySctr` decided the length
                // before the first bonus spin was rolled, so the screen can announce it up front.
                free: r.free ? {
                    label: r.free.label,
                    base: r.free.base,
                    scatters: r.free.scatters,
                    chips: chipsFor(stake, r.free.total / stake),
                    spins: r.free.spins.map(spinOf),
                } : null,
            };
        })() : null,
        free: r.free && !r.colossal ? {
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
                // ── THE THINGS THAT MAKE A ROUND CHANGE AS IT RUNS ───────────────────────────────
                // `mult` is what THIS spin was paid at, which on a collecting round is not the round's
                // flat multiplier — it grows every time a pearl lands, so the round's own number is 1 and
                // useless. `held`/`justHeld` are the wilds welded to the board: already held when the
                // reels started, and the ones that clamp shut on this spin, which is the moment worth
                // watching. `pearls` is where the collectors landed.
                //
                // All four were missing here while the SECOND round's mapping a hundred lines down sends
                // held and justHeld — which is why sticky worked when it was a second round and silently
                // did nothing the day it became the main one. The Deep's new round collected 4.9 pearls a
                // go in the simulator and drew x1 with nothing held on the screen.
                mult: sp.mult || 1,
                held: sp.held || [],
                justHeld: sp.justHeld || [],
                pearls: sp.pearls || [],
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
            geodes: r.warren.geodes,
            full: r.warren.full,
            // ── VISITS, NOT ROOMS ────────────────────────────────────────────────────────────────
            // The last room LOOPS — an Elder down there opens one geode and puts you straight back on
            // the same wall — so this is an ordered list of VISITS and the Deep Warren can appear in it
            // several times. A visit that ended on an Elder in the last room carries the geode it
            // opened, because from the round's point of view the geode is part of that visit rather
            // than a separate room.
            stages: r.warren.stages.map((st) => ({
                key: st.key,
                name: st.name,
                room: st.stage + 1,
                geode: st.geode != null
                    ? chipsFor(stake, (st.geode * (stake / LINES.length)) / stake)
                    : null,
                opened: st.opened.map((n) => (n.kind === "pups"
                    ? { kind: "pups", pups: n.pups.map((v) => chipsFor(stake, (v * (stake / LINES.length)) / stake)) }
                    : { kind: n.kind })),
                // ── AND WHAT THE WALL STILL HELD ─────────────────────────────────────────────────
                // Only on the visit the Mother ended, because that is the only one with anything left
                // to say. Converted the same way as `opened` — the screen must never do arithmetic on
                // a payout, and a number shown in different units from the one beside it is a lie.
                rest: st.rest ? st.rest.map((n) => (n.kind === "pups"
                    ? { kind: "pups", pups: n.pups.map((v) => chipsFor(stake, (v * (stake / LINES.length)) / stake)) }
                    : { kind: n.kind })) : null,
            })),
            chips: chipsFor(stake, r.warren.total / stake),
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
