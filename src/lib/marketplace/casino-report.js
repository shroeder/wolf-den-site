import "server-only";

import { db } from "@/lib/db";
import { SLOT_MACHINES } from "@/lib/marketplace/casino.js";
import { slot5 } from "@/lib/marketplace/casino-slot5.js";
import { isBonus, SOURCE_LABEL, WIN_SOURCES } from "@/lib/marketplace/casino-win-source.js";

// ── WHAT THE FLOOR IS ACTUALLY DOING ─────────────────────────────────────────────────────────────────────────
// Luke: "I just wanna know how much coin people spent and how many chips they won, by person. And I need to
// drill in and see how they won it by slot machine, and if it was from the bonus or just a normal win on a pay
// line, or if it was from keno."
//
// ── TWO CURRENCIES, AND THE OLD REPORT SUBTRACTED ONE FROM THE OTHER ─────────────────────────────────────────
// The floor takes GOLD and pays CHIPS. Every bet on every machine is a gold debit; slot5, keno, bingo and
// blackjack pay chips, and chips leave only at the Counter. This file used to print "staked", "paid out",
// "house keeps" and a return percentage — all four computed as `paid - staked`, which is chips minus gold. At
// CHIP_RATE 1 that arithmetic runs without complaining and means nothing: a "house edge" of 400 says the floor
// took 400 gold and minted 400 fewer chips than it took, and those are not the same quantity.
//
// So there is no net and no RTP here any more. There are two columns — coin spent, chips won — and they are
// never added together. The old three-reel cabinet is the one machine that pays GOLD, and it gets its own
// column for that rather than having its gold counted as chips, which is what `wonChips` was doing to it.
//
// ── IT READS THE LEDGERS, NOT THE ACTIVITY FEED ──────────────────────────────────────────────────────────────
// The previous version was built on `casino_play` rows in mkt_activity_event. Measured against production the
// day this was written: the coin ledger held every casino bet back to the floor opening on 2026-08-21, and
// casino_play held nothing before 2026-08-26 — five of the first six days of the casino were simply absent
// from the report, silently, with a plausible-looking number in every box.
//
// mkt_coin_event and mkt_chip_event are written by logCoin and moveChips inside the same call that moves the
// balance. They cannot miss a play, they carry the machine and the win split in their meta, and they are the
// rows an argument about somebody's balance would be settled from. Telemetry is a convenience; a ledger is the
// record.
//
// ── AND THE OWNER'S TEST SPINS ARE NOT THE FLOOR ─────────────────────────────────────────────────────────────
// `slot5_forced` is a forced outcome from the owner's test panel. On the day this was written those 211 spins
// had minted 473,828 chips against 23,870 from all real play — twenty to one. Folded into a total, every
// number on the screen becomes a description of the test panel. They are counted, reported, and kept out.
const TZ = "America/Chicago";

const num = (v) => Number(v) || 0;

// Which machine a ledger reason belongs to. Named here rather than parsed out of the string: `casino_slot_bet`
// and `casino_slot5_bet` differ by one character, and a prefix match puts the whole five-reel floor inside the
// three-reel cabinet.
const BET_GAME = {
    casino_slot5_bet: "slot5",
    casino_slot_bet: "slot",
    casino_keno_bet: "keno",
    casino_bingo_bet: "bingo",
    casino_blackjack_bet: "blackjack",
    casino_wheel_bet: "wheel",
    casino_gamble_bet: "gamble",
};
// The gold-paying wins. The three-reel cabinet pays gold to this day; keno, bingo and blackjack each have a
// tail of gold wins from before they were moved onto chips, and those rows are real money that was paid out.
const WIN_GAME = {
    casino_slot_win: "slot",
    casino_keno_win: "keno",
    casino_bingo_win: "bingo",
    casino_blackjack_win: "blackjack",
    casino_wheel_win: "wheel",
    casino_gamble_win: "gamble",
};
// A stake handed back is not coin spent. Both of these are perks refunding a bet that was placed, so they come
// off spend rather than being reported as winnings.
const COMP = new Set(["casino_on_the_house", "casino_cat_refund"]);
// Gold the house GAVE, which is neither a stake nor a payout, and belongs in neither column.
const GIFT = new Set(["casino_daily", "casino_test_float"]);

const CHIP_GAME = {
    slot5: "slot5",
    slot5_forced: "slot5",
    casino_keno_win: "keno",
    casino_bingo_win: "bingo",
    casino_blackjack_win: "blackjack",
};

// ── THE TWO FLOORS SHARE THEIR CABINET IDS, AND THEIR NAMES ──────────────────────────────────────────────────
// `slot`, `slot2` .. `slot5` are five three-reel machines AND five five-reel machines, and two of the pairs are
// even called the same thing — there is a "The Hunt" and a "The Harvest" on each floor. Keyed on the bare id,
// a by-cabinet table silently adds a three-reel machine's takings to a five-reel machine's and reports one row
// that describes neither. So every machine key here is `game:id`, and every label says which floor it is on.
const machineKey = (game, id) => `${game}:${id}`;
const machineLabel = (game, id) => {
    if (game === "slot5") return `${slot5(id).label} (5-reel)`;
    if (game === "slot") return `${SLOT_MACHINES[id]?.label || id} (3-reel)`;
    return id;
};

export const GAME_LABEL = {
    slot5: "Five-reel cabinets",
    slot: "Three-reel slots",
    keno: "Keno",
    bingo: "Bingo",
    blackjack: "Blackjack",
    wheel: "The wheel",
    gamble: "Double or nothing",
};

/** An empty tally, so every row has every column whether or not it was ever written to. */
const zero = () => ({ plays: 0, coinSpent: 0, coinComped: 0, coinBack: 0, chipsWon: 0, chipsSpent: 0, best: 0, wins: 0 });

const add = (into, key, field, v) => {
    if (!into[key]) into[key] = zero();
    into[key][field] += v;
    return into[key];
};

// ── THE WINDOW, AND ONE DEFINITION OF EVERY COLUMN ───────────────────────────────────────────────────────────
// Both reports below take the same interval through this one function, with an optional buyer. Splitting the
// floor view and the per-member drill-down into separate queries would be two definitions of "coin spent", and
// the day one of them learned about a new reason code the two screens would disagree by an amount nobody could
// account for.
async function ledgers({ days, buyerId = null }) {
    const iv = `${days} days`;
    const who = buyerId ? " AND e.buyer_id = $2" : "";
    const args = buyerId ? [iv, buyerId] : [iv];
    const [coin, chip] = await Promise.all([
        db.query(
            `SELECT e.buyer_id AS id, e.reason,
                    COUNT(*)::int AS n,
                    COALESCE(SUM(e.delta), 0)::bigint AS total,
                    COALESCE(e.meta->>'machine', '') AS machine
               FROM mkt_coin_event e
              WHERE e.reason LIKE 'casino%' AND e.created_at >= NOW() - $1::interval${who}
              GROUP BY 1, 2, 5`, args).catch(() => []),
        db.query(
            `SELECT e.buyer_id AS id, e.reason, COALESCE(e.ref, '') AS ref,
                    COUNT(*)::int AS n,
                    COALESCE(SUM(e.delta), 0)::bigint AS total,
                    COALESCE(MAX(e.delta), 0)::bigint AS best
               FROM mkt_chip_event e
              WHERE e.created_at >= NOW() - $1::interval${who}
              GROUP BY 1, 2, 3`, args).catch(() => []),
    ]);
    return { coin, chip };
}

// ── WHERE THE CHIPS CAME FROM ────────────────────────────────────────────────────────────────────────────────
// Two queries, because there are two meta shapes in the ledger and both are real history. Rows written from
// 2026-08-26 carry `from`, the full eight-way split in CHIPS (see casino-win-source.js), and those are split
// exactly.
//
// ── THE OLDER ROWS ARE NOT SPLIT AT ALL, AND THAT IS THE CORRECT ANSWER ──────────────────────────────────────
// Rows before it carry `base`, `free` and `locked` as multiples of the bet, and the obvious move — multiply by
// the bet and you have chips — is wrong twice over. It was tried and the arithmetic caught it: the three
// fields summed to 69,605 chips against 23,870 actually paid, on the same rows.
//
//   THE RATE MOVED. Those multiples are GOLD, converted at CHIP_RATE, and the rate was 0.25 when most of them
//   were written and is 1 now (see chip-rate.js). Every legacy row would have to be converted at whatever the
//   rate was at the moment it was written, and the ledger does not record which that was.
//   AND THEY WERE NEVER THE WHOLE PAYOUT. Three of eight sources: The Menagerie's colossal block and its
//   scatter are in neither, which is why a 19-chip win came back base 0, free 0, locked 0.
//
// Scaling three incomplete fields by a rate we would have to guess produces a confident, wrong breakdown, and
// a breakdown nobody can trust is worse than a gap somebody can see. So those payouts are reported as one
// honest bucket, with the one thing their meta does say without ambiguity: how many of them had a bonus in
// them at all.
async function winSources({ days, buyerId = null, byMachine = false }) {
    const iv = `${days} days`;
    const who = buyerId ? " AND e.buyer_id = $2" : "";
    const args = buyerId ? [iv, buyerId] : [iv];
    // Forced spins are left out here for the same reason they are left out of every total: 211 of them had
    // minted twenty times what all real play had, almost entirely into the free-spins column, so a split that
    // included them would report the floor as a free-spins machine because the test panel forces free spins.
    const mach = byMachine ? "COALESCE(e.ref, '')" : "''";
    const [modern, legacy] = await Promise.all([
        db.query(
            `SELECT ${mach} AS machine, s.key AS source,
                    COALESCE(SUM(s.value::numeric), 0)::bigint AS chips,
                    COUNT(*) FILTER (WHERE s.value::numeric > 0)::int AS n
               FROM mkt_chip_event e, LATERAL jsonb_each_text(e.meta->'from') AS s
              WHERE e.reason = 'slot5' AND e.created_at >= NOW() - $1::interval${who}
                AND e.meta ? 'from'
              GROUP BY 1, 2`, args).catch(() => []),
        db.query(
            `SELECT ${mach} AS machine,
                    COALESCE(SUM(e.delta), 0)::bigint AS total,
                    COUNT(*)::int AS n,
                    COUNT(*) FILTER (WHERE COALESCE((e.meta->>'free')::numeric, 0)
                                        + COALESCE((e.meta->>'locked')::numeric, 0) > 0)::int AS bonus_n
               FROM mkt_chip_event e
              WHERE e.reason = 'slot5' AND e.created_at >= NOW() - $1::interval${who}
                AND NOT (e.meta ? 'from') AND e.meta ? 'base'
              GROUP BY 1`, args).catch(() => []),
    ]);

    const bag = {};     // machine -> source -> { chips, n }
    const put = (machine, source, chips, n) => {
        if (chips <= 0) return;
        bag[machine] = bag[machine] || {};
        bag[machine][source] = bag[machine][source] || { chips: 0, n: 0 };
        bag[machine][source].chips += chips;
        bag[machine][source].n += n;
    };
    for (const r of modern) put(r.machine, r.source, num(r.chips), num(r.n));
    for (const r of legacy) {
        put(r.machine, "unsplit", num(r.total), num(r.n));
        if (bag[r.machine]?.unsplit) bag[r.machine].unsplit.bonusPlays = num(r.bonus_n);
    }
    return bag;
}

const sourceRows = (bySource = {}) => Object.entries(bySource)
    .map(([source, v]) => ({
        source,
        label: source === "unsplit" ? "Paid before the split was recorded" : (SOURCE_LABEL[source] || source),
        bonus: isBonus(source),
        chips: v.chips,
        n: v.n || undefined,
        // Only on the unsplit bucket: how many of those payouts had a bonus in them, which is the one thing
        // the old meta says without ambiguity.
        bonusPlays: v.bonusPlays,
    }))
    .sort((a, z) => z.chips - a.chips);

// The headline answer to "bonus or pay line". `unsplit` is its own third number rather than being folded into
// either: a breakdown that guesses is worse than one that admits the rows predate it.
const paylineVsBonus = (rows) => {
    const t = { payline: 0, bonus: 0, unsplit: 0 };
    for (const r of rows) {
        if (r.source === "unsplit") t.unsplit += r.chips;
        else if (r.bonus) t.bonus += r.chips;
        else t.payline += r.chips;
    }
    return t;
};

const gameRows = (byGame) => Object.entries(byGame)
    .map(([game, v]) => ({ game, label: GAME_LABEL[game] || game, ...v }))
    .sort((a, z) => z.coinSpent - a.coinSpent || z.chipsWon - a.chipsWon);

/**
 * The floor, in the two currencies it actually moves.
 *
 * `days` is the window, and the daily rows are store-local: a UTC day boundary falls at 7pm here and would
 * split every evening in two.
 */
export async function getCasinoReport({ days = 7 } = {}) {
    const d = Math.max(1, Math.min(90, Number(days) || 7));
    const iv = `${d} days`;

    const [{ coin, chip }, sources, daily, store, vip, names] = await Promise.all([
        ledgers({ days: d }),
        winSources({ days: d }),
        db.query(
            `SELECT day::text AS date,
                    COALESCE(SUM(spent), 0)::bigint AS coin_spent,
                    COALESCE(SUM(won), 0)::bigint AS chips_won,
                    COALESCE(SUM(plays), 0)::int AS plays
               FROM (
                 SELECT (created_at AT TIME ZONE '${TZ}')::date AS day,
                        SUM(-delta) AS spent, 0 AS won, COUNT(*) AS plays
                   FROM mkt_coin_event
                  WHERE reason LIKE 'casino%bet' AND created_at >= NOW() - $1::interval
                  GROUP BY 1
                 UNION ALL
                 SELECT (created_at AT TIME ZONE '${TZ}')::date AS day,
                        0 AS spent, SUM(delta) AS won, 0 AS plays
                   FROM mkt_chip_event
                  WHERE delta > 0 AND reason <> 'slot5_forced' AND created_at >= NOW() - $1::interval
                  GROUP BY 1
               ) x
              GROUP BY 1 ORDER BY 1`, [iv]).catch(() => []),
        db.query(
            `SELECT COALESCE(item_id, 'item') AS item, COUNT(*)::int AS n,
                    COALESCE(SUM(price), 0)::bigint AS chips
               FROM mkt_chip_purchase
              WHERE created_at >= NOW() - $1::interval
              GROUP BY 1 ORDER BY chips DESC LIMIT 20`, [iv]).catch(() => []),
        db.queryOne(
            `SELECT COUNT(*)::int AS visits, COUNT(DISTINCT buyer_id)::int AS members
               FROM mkt_activity_event
              WHERE event = 'casino_vip_enter' AND created_at >= NOW() - $1::interval`, [iv]).catch(() => null),
        db.query(`SELECT id, COALESCE(NULLIF(display_name, ''), alias) AS name FROM mkt_buyer`).catch(() => []),
    ]);

    const nameOf = new Map(names.map((r) => [r.id, r.name || "Member"]));
    const byPlayer = {};
    const byGame = {};
    const byMachine = {};
    const totals = zero();
    // Kept apart from every total on the screen. See the header.
    const test = { plays: 0, chipsWon: 0 };

    for (const r of coin) {
        const game = BET_GAME[r.reason];
        const spent = -num(r.total);        // bets are negative deltas
        if (game) {
            add(byPlayer, r.id, "coinSpent", spent);
            add(byPlayer, r.id, "plays", num(r.n));
            add(byGame, game, "coinSpent", spent);
            add(byGame, game, "plays", num(r.n));
            totals.coinSpent += spent;
            totals.plays += num(r.n);
            if (r.machine) {
                const k = machineKey(game, r.machine);
                add(byMachine, k, "coinSpent", spent);
                add(byMachine, k, "plays", num(r.n));
            }
        } else if (WIN_GAME[r.reason]) {
            add(byPlayer, r.id, "coinBack", num(r.total));
            add(byGame, WIN_GAME[r.reason], "coinBack", num(r.total));
            totals.coinBack += num(r.total);
            // The three-reel floor pays GOLD, so its cabinets need that column too or a machine that has
            // paid out 14,000 gold reads as a machine that has never paid anything.
            if (r.machine) add(byMachine, machineKey(WIN_GAME[r.reason], r.machine), "coinBack", num(r.total));
        } else if (COMP.has(r.reason)) {
            add(byPlayer, r.id, "coinComped", num(r.total));
            totals.coinComped += num(r.total);
        }
        // GIFT reasons are deliberately counted nowhere: a daily handout is not a bet and not a payout.
    }

    for (const r of chip) {
        const won = num(r.total);
        if (r.reason === "slot5_forced") {
            test.plays += num(r.n);
            test.chipsWon += won;
            continue;
        }
        if (won < 0) {                       // the Counter, the only chip sink
            add(byPlayer, r.id, "chipsSpent", -won);
            totals.chipsSpent += -won;
            continue;
        }
        const game = CHIP_GAME[r.reason];
        if (!game) continue;
        add(byPlayer, r.id, "chipsWon", won);
        add(byPlayer, r.id, "wins", num(r.n));
        byPlayer[r.id].best = Math.max(byPlayer[r.id].best, num(r.best));
        add(byGame, game, "chipsWon", won);
        add(byGame, game, "wins", num(r.n));
        totals.chipsWon += won;
        totals.wins += num(r.n);
        if (r.ref && game === "slot5") {
            const k = machineKey(game, r.ref);
            add(byMachine, k, "chipsWon", won);
            add(byMachine, k, "wins", num(r.n));
            byMachine[k].best = Math.max(byMachine[k].best, num(r.best));
        }
    }

    const floorSources = sourceRows(sources[""] || {});

    return {
        days: d,
        // Every number on this screen is one of these two, and they are never added together.
        units: { spent: "coin", won: "chips" },
        totals: {
            ...totals,
            // What members really parted with: stakes, less the ones a perk handed straight back.
            coinNet: totals.coinSpent - totals.coinComped,
            players: Object.keys(byPlayer).length,
        },
        test,
        byGame: gameRows(byGame),
        byMachine: Object.entries(byMachine).map(([key, v]) => {
            const [game, machine] = key.split(":");
            return { key, game, machine, label: machineLabel(game, machine), ...v };
        }).sort((a, z) => z.coinSpent - a.coinSpent || z.chipsWon - a.chipsWon),
        players: Object.entries(byPlayer)
            .map(([id, v]) => ({ id, name: nameOf.get(id) || "Member", ...v }))
            .sort((a, z) => z.coinSpent - a.coinSpent)
            .slice(0, 50),
        daily: daily.map((r) => ({
            date: r.date, coinSpent: num(r.coin_spent), chipsWon: num(r.chips_won), plays: num(r.plays),
        })),
        // Floor-wide: how much of what the cabinets paid came out of a bonus rather than off the reels.
        sources: floorSources,
        split: paylineVsBonus(floorSources),
        store: store.map((r) => ({ item: r.item, n: num(r.n), chips: num(r.chips) })),
        vip: { visits: num(vip?.visits), members: num(vip?.members) },
    };
}

/**
 * One member, all the way down: what they spent, what they won, on which cabinet, and out of which feature.
 *
 * The same two ledgers and the same reason maps as the floor report — see the note on `ledgers`.
 */
export async function getCasinoPlayerReport({ buyerId, days = 7 } = {}) {
    if (!buyerId) return null;
    const d = Math.max(1, Math.min(90, Number(days) || 7));
    const iv = `${d} days`;

    const [{ coin, chip }, sources, who, recent, keno, blackjack, bingo, store] = await Promise.all([
        ledgers({ days: d, buyerId }),
        winSources({ days: d, buyerId, byMachine: true }),
        db.queryOne(
            `SELECT id, COALESCE(NULLIF(display_name, ''), alias) AS name,
                    COALESCE(gold, 0)::bigint AS gold, COALESCE(chips, 0)::bigint AS chips
               FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        db.query(
            `SELECT created_at AS at, reason, COALESCE(ref, '') AS ref, delta, meta
               FROM mkt_chip_event
              WHERE buyer_id = $1 AND created_at >= NOW() - $2::interval AND delta > 0
              ORDER BY created_at DESC LIMIT 40`, [buyerId, iv]).catch(() => []),
        // ── KENO, BY HOW MANY THEY HIT ───────────────────────────────────────────────────────────────
        // The one thing keno's ledger meta carries that a total cannot say. A member winning off two hits and
        // a member winning the same off eight are playing two different machines.
        db.query(
            `SELECT COALESCE((meta->>'hits')::int, 0) AS hits, COUNT(*)::int AS n,
                    COALESCE(SUM(delta), 0)::bigint AS chips
               FROM mkt_chip_event
              WHERE buyer_id = $1 AND reason = 'casino_keno_win' AND created_at >= NOW() - $2::interval
              GROUP BY 1 ORDER BY 1 DESC`, [buyerId, iv]).catch(() => []),
        db.query(
            `SELECT o AS outcome, COUNT(*)::int AS n
               FROM mkt_chip_event e, LATERAL jsonb_array_elements_text(COALESCE(e.meta->'outcomes', '[]'::jsonb)) AS o
              WHERE e.buyer_id = $1 AND e.reason = 'casino_blackjack_win' AND e.created_at >= NOW() - $2::interval
              GROUP BY 1 ORDER BY n DESC`, [buyerId, iv]).catch(() => []),
        db.query(
            `SELECT COALESCE(meta->>'tier', 'card') AS tier, COUNT(*)::int AS n,
                    COALESCE(SUM(delta), 0)::bigint AS chips,
                    COUNT(*) FILTER (WHERE COALESCE((meta->>'dragon')::int, 0) > 0)::int AS dragon
               FROM mkt_chip_event
              WHERE buyer_id = $1 AND reason = 'casino_bingo_win' AND created_at >= NOW() - $2::interval
              GROUP BY 1 ORDER BY chips DESC`, [buyerId, iv]).catch(() => []),
        db.query(
            `SELECT COALESCE(item_id, 'item') AS item, COUNT(*)::int AS n, COALESCE(SUM(price), 0)::bigint AS chips
               FROM mkt_chip_purchase
              WHERE buyer_id = $1 AND created_at >= NOW() - $2::interval
              GROUP BY 1 ORDER BY chips DESC`, [buyerId, iv]).catch(() => []),
    ]);

    const byGame = {};
    const byMachine = {};
    const totals = zero();
    const test = { plays: 0, chipsWon: 0 };

    for (const r of coin) {
        const game = BET_GAME[r.reason];
        const spent = -num(r.total);
        if (game) {
            add(byGame, game, "coinSpent", spent);
            add(byGame, game, "plays", num(r.n));
            totals.coinSpent += spent;
            totals.plays += num(r.n);
            if (r.machine) {
                const k = machineKey(game, r.machine);
                add(byMachine, k, "coinSpent", spent);
                add(byMachine, k, "plays", num(r.n));
            }
        } else if (WIN_GAME[r.reason]) {
            add(byGame, WIN_GAME[r.reason], "coinBack", num(r.total));
            totals.coinBack += num(r.total);
            if (r.machine) add(byMachine, machineKey(WIN_GAME[r.reason], r.machine), "coinBack", num(r.total));
        } else if (COMP.has(r.reason)) {
            totals.coinComped += num(r.total);
        }
    }
    for (const r of chip) {
        const won = num(r.total);
        if (r.reason === "slot5_forced") { test.plays += num(r.n); test.chipsWon += won; continue; }
        if (won < 0) { totals.chipsSpent += -won; continue; }
        const game = CHIP_GAME[r.reason];
        if (!game) continue;
        add(byGame, game, "chipsWon", won);
        add(byGame, game, "wins", num(r.n));
        totals.chipsWon += won;
        totals.wins += num(r.n);
        totals.best = Math.max(totals.best, num(r.best));
        if (r.ref && game === "slot5") {
            const k = machineKey(game, r.ref);
            add(byMachine, k, "chipsWon", won);
            add(byMachine, k, "wins", num(r.n));
            byMachine[k].best = Math.max(byMachine[k].best, num(r.best));
        }
    }

    // Every cabinet they touched, with its own pay-line-versus-bonus split hung off it.
    const machines = Object.entries(byMachine).map(([key, v]) => {
        const [game, machine] = key.split(":");
        // Only the five-reel floor records a win split — the three-reel cabinets pay one number off one line.
        const rows = game === "slot5" ? sourceRows(sources[machine] || {}) : [];
        return { key, game, machine, label: machineLabel(game, machine), ...v, sources: rows, split: paylineVsBonus(rows) };
    }).sort((a, z) => z.coinSpent - a.coinSpent || z.chipsWon - a.chipsWon);

    const allSources = {};
    for (const bag of Object.values(sources)) {
        for (const [k, v] of Object.entries(bag)) {
            allSources[k] = allSources[k] || { chips: 0, n: 0 };
            allSources[k].chips += v.chips;
            allSources[k].n += v.n;
            if (v.bonusPlays) allSources[k].bonusPlays = (allSources[k].bonusPlays || 0) + v.bonusPlays;
        }
    }
    const overall = sourceRows(allSources);

    return {
        days: d,
        units: { spent: "coin", won: "chips" },
        player: { id: buyerId, name: who?.name || "Member", gold: num(who?.gold), chips: num(who?.chips) },
        totals: { ...totals, coinNet: totals.coinSpent - totals.coinComped },
        test,
        byGame: gameRows(byGame),
        machines,
        sources: overall,
        split: paylineVsBonus(overall),
        keno: keno.map((r) => ({ hits: num(r.hits), n: num(r.n), chips: num(r.chips) })),
        blackjack: blackjack.map((r) => ({ outcome: r.outcome, n: num(r.n) })),
        bingo: bingo.map((r) => ({ tier: r.tier, n: num(r.n), chips: num(r.chips), dragon: num(r.dragon) })),
        store: store.map((r) => ({ item: r.item, n: num(r.n), chips: num(r.chips) })),
        // The last forty payouts, so a number on the screen can be traced back to the spin that made it.
        recent: recent.map((r) => ({
            at: r.at,
            game: CHIP_GAME[r.reason] || r.reason,
            machine: r.ref || null,
            forced: r.reason === "slot5_forced",
            chips: num(r.delta),
            bet: num(r.meta?.bet),
            // `from` is the eight-way split; the biggest slice of it is what this payout mostly was.
            source: r.meta?.from
                ? (Object.entries(r.meta.from).sort((a, z) => num(z[1]) - num(a[1]))[0] || [null])[0]
                : null,
            hits: r.meta?.hits ?? null,
        })),
    };
}

export { SOURCE_LABEL, WIN_SOURCES };
