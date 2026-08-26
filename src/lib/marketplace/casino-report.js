import "server-only";

import { db } from "@/lib/db";

// ── WHAT THE FLOOR IS ACTUALLY DOING ─────────────────────────────────────────────────────────────────────────
// Luke: "we have full telemetry of casino and visibility of it in admin app, if not do so now."
//
// The telemetry was nearly there and the visibility was not there at all. Every game logs casino_play with its
// bet, its winnings and its multiple — except the original three-reel slot, which logged only the item roll and
// so was missing from every total (fixed in casino.js). What did not exist anywhere was a screen: the numbers
// were reachable only by writing SQL.
//
// ── THE ONE NUMBER THAT MATTERS IS RETURN, AND IT IS COMPUTED FROM PLAY ──────────────────────────────────────
// check:casino proves each machine's paytable keeps a house edge in THEORY. This is the same question asked of
// what really happened: chips staked against chips paid, per machine. A cabinet whose measured return sits far
// from its designed one is either mis-tuned or being played in a way the model did not expect, and neither is
// visible from a paytable.
//
// Chips, not gold. The floor pays chips and chips only leave at the Counter, so mixing the two would answer a
// question nobody asked.
const TZ = "America/Chicago";

const num = (v) => Number(v) || 0;

export async function getCasinoReport({ days = 7 } = {}) {
    const d = Math.max(1, Math.min(90, Number(days) || 7));
    const iv = `${d} days`;

    const [byGame, byMachine, daily, feats, players, prizes, store, vip, gamble, recent] = await Promise.all([
        // Per GAME: pulls, players, staked, paid, and the return that came out of it.
        db.query(
            `SELECT COALESCE(meta->>'game', 'unknown') AS game,
                    COUNT(*)::int AS plays,
                    COUNT(DISTINCT buyer_id)::int AS players,
                    COALESCE(SUM((meta->>'bet')::numeric), 0)::bigint AS staked,
                    COALESCE(SUM((meta->>'wonChips')::numeric), 0)::bigint AS paid,
                    COUNT(*) FILTER (WHERE (meta->>'wonChips')::numeric > 0)::int AS wins
               FROM mkt_activity_event
              WHERE event = 'casino_play' AND created_at >= NOW() - $1::interval
                AND meta ? 'bet'
              GROUP BY 1 ORDER BY staked DESC`, [iv]).catch(() => []),

        // Per CABINET, which is the unit the five-reel machines are tuned as.
        db.query(
            `SELECT COALESCE(meta->>'machine', meta->>'game', 'unknown') AS machine,
                    COUNT(*)::int AS plays,
                    COUNT(DISTINCT buyer_id)::int AS players,
                    COALESCE(SUM((meta->>'bet')::numeric), 0)::bigint AS staked,
                    COALESCE(SUM((meta->>'wonChips')::numeric), 0)::bigint AS paid,
                    MAX((meta->>'wonChips')::numeric)::bigint AS best
               FROM mkt_activity_event
              WHERE event = 'casino_play' AND created_at >= NOW() - $1::interval
                AND meta ? 'bet'
              GROUP BY 1 ORDER BY staked DESC`, [iv]).catch(() => []),

        // Store-local days — a UTC boundary falls at 7pm here and would split every evening in two.
        db.query(
            `SELECT (created_at AT TIME ZONE '${TZ}')::date::text AS day,
                    COUNT(*)::int AS plays,
                    COUNT(DISTINCT buyer_id)::int AS players,
                    COALESCE(SUM((meta->>'bet')::numeric), 0)::bigint AS staked,
                    COALESCE(SUM((meta->>'wonChips')::numeric), 0)::bigint AS paid
               FROM mkt_activity_event
              WHERE event = 'casino_play' AND created_at >= NOW() - $1::interval AND meta ? 'bet'
              GROUP BY 1 ORDER BY 1`, [iv]).catch(() => []),

        // Which BONUSES actually fire. A feature nobody reaches is a feature that was never built.
        db.query(
            `SELECT f AS feature, COUNT(*)::int AS n
               FROM mkt_activity_event e, LATERAL jsonb_array_elements_text(COALESCE(e.meta->'features', '[]'::jsonb)) AS f
              WHERE e.event = 'casino_play' AND e.created_at >= NOW() - $1::interval
              GROUP BY 1 ORDER BY n DESC LIMIT 20`, [iv]).catch(() => []),

        // Who plays, and how they are doing. Net is what they took OFF the floor.
        db.query(
            `SELECT e.buyer_id AS id, COALESCE(NULLIF(b.display_name,''), b.alias) AS name,
                    COUNT(*)::int AS plays,
                    COALESCE(SUM((e.meta->>'bet')::numeric), 0)::bigint AS staked,
                    COALESCE(SUM((e.meta->>'wonChips')::numeric), 0)::bigint AS paid,
                    MAX((e.meta->>'wonChips')::numeric)::bigint AS best
               FROM mkt_activity_event e JOIN mkt_buyer b ON b.id = e.buyer_id
              WHERE e.event = 'casino_play' AND e.created_at >= NOW() - $1::interval AND e.meta ? 'bet'
              GROUP BY 1, 2 ORDER BY staked DESC LIMIT 20`, [iv]).catch(() => []),

        db.query(
            `SELECT COALESCE(meta->>'kind', 'prize') AS kind, COUNT(*)::int AS n,
                    COUNT(*) FILTER (WHERE (meta->>'jackpot')::text = 'true')::int AS jackpots
               FROM mkt_activity_event
              WHERE event = 'casino_prize' AND created_at >= NOW() - $1::interval
              GROUP BY 1 ORDER BY n DESC LIMIT 12`, [iv]).catch(() => []),

        // The Counter is the only chip SINK, so it is half of whether the chip economy balances.
        db.query(
            `SELECT COALESCE(meta->>'item', 'item') AS item, COUNT(*)::int AS n,
                    COALESCE(SUM((meta->>'price')::numeric), 0)::bigint AS chips
               FROM mkt_activity_event
              WHERE event = 'casino_buy' AND created_at >= NOW() - $1::interval
              GROUP BY 1 ORDER BY chips DESC LIMIT 15`, [iv]).catch(() => []),

        db.queryOne(
            `SELECT COUNT(*)::int AS visits, COUNT(DISTINCT buyer_id)::int AS members
               FROM mkt_activity_event
              WHERE event = 'casino_vip_enter' AND created_at >= NOW() - $1::interval`, [iv]).catch(() => null),

        db.queryOne(
            `SELECT COUNT(*)::int AS n,
                    COUNT(*) FILTER (WHERE (meta->>'won')::text = 'true')::int AS won,
                    COALESCE(SUM((meta->>'staked')::numeric), 0)::bigint AS staked
               FROM mkt_activity_event
              WHERE event = 'casino_gamble' AND created_at >= NOW() - $1::interval`, [iv]).catch(() => null),

        db.query(
            `SELECT e.created_at, COALESCE(NULLIF(b.display_name,''), b.alias) AS name,
                    COALESCE(e.meta->>'machine', e.meta->>'game') AS machine,
                    (e.meta->>'bet')::numeric AS bet, (e.meta->>'wonChips')::numeric AS won
               FROM mkt_activity_event e JOIN mkt_buyer b ON b.id = e.buyer_id
              WHERE e.event = 'casino_play' AND e.meta ? 'bet'
                AND (e.meta->>'wonChips')::numeric >= (e.meta->>'bet')::numeric * 10
                AND e.created_at >= NOW() - $1::interval
              ORDER BY e.created_at DESC LIMIT 20`, [iv]).catch(() => []),
    ]);

    // ── RETURN, WITH A FLOOR UNDER THE SAMPLE ────────────────────────────────────────────────────────────
    // A percentage off eleven pulls is not a return, it is a rumour — and printing one next to a real one
    // invites a tuning change based on noise. Anything under MIN_PLAYS carries its count and no percentage.
    const MIN_PLAYS = 50;
    const withReturn = (rows, key) => rows.map((r) => {
        const staked = num(r.staked);
        const paid = num(r.paid);
        return {
            [key]: r[key], plays: num(r.plays), players: num(r.players) || undefined,
            staked, paid, net: staked - paid, best: num(r.best) || undefined,
            wins: num(r.wins) || undefined,
            rtp: num(r.plays) >= MIN_PLAYS && staked > 0 ? (paid / staked) * 100 : null,
        };
    });

    const totalStaked = byGame.reduce((a, r) => a + num(r.staked), 0);
    const totalPaid = byGame.reduce((a, r) => a + num(r.paid), 0);
    const totalPlays = byGame.reduce((a, r) => a + num(r.plays), 0);

    return {
        days: d,
        minPlays: MIN_PLAYS,
        totals: {
            plays: totalPlays,
            staked: totalStaked,
            paid: totalPaid,
            net: totalStaked - totalPaid,
            rtp: totalPlays >= MIN_PLAYS && totalStaked > 0 ? (totalPaid / totalStaked) * 100 : null,
            players: new Set(players.map((p) => p.id)).size,
        },
        byGame: withReturn(byGame, "game"),
        byMachine: withReturn(byMachine, "machine"),
        daily: daily.map((r) => ({
            date: r.day, plays: num(r.plays), players: num(r.players),
            staked: num(r.staked), paid: num(r.paid), net: num(r.staked) - num(r.paid),
        })),
        features: feats.map((r) => ({ feature: r.feature, n: num(r.n) })),
        players: players.map((r) => ({
            id: r.id, name: r.name || "Member", plays: num(r.plays),
            staked: num(r.staked), paid: num(r.paid), net: num(r.paid) - num(r.staked), best: num(r.best),
        })),
        prizes: prizes.map((r) => ({ kind: r.kind, n: num(r.n), jackpots: num(r.jackpots) })),
        store: store.map((r) => ({ item: r.item, n: num(r.n), chips: num(r.chips) })),
        vip: { visits: num(vip?.visits), members: num(vip?.members) },
        gamble: { n: num(gamble?.n), won: num(gamble?.won), staked: num(gamble?.staked) },
        bigWins: recent.map((r) => ({
            at: r.created_at, name: r.name || "Member", machine: r.machine,
            bet: num(r.bet), won: num(r.won), multiple: num(r.bet) ? num(r.won) / num(r.bet) : 0,
        })),
    };
}
