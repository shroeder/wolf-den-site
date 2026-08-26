import "server-only";

import { db } from "@/lib/db";
import { placeInStockade, releaseFromStockade, getOccupant } from "@/lib/marketplace/stockade.js";
import { checkText } from "@/lib/marketplace/text-filter.js";
import { trackActivity } from "@/lib/marketplace/activity.js";

// ── THE STOCKADE ELECTION ────────────────────────────────────────────────────────────────────────────────────
// Jinxx's idea, more or less verbatim: "a fun little bit to nominate someone for being in display in the town
// stockade", with joke crimes running "from 'Stood there menacingly' to 'Took my left shoe'". The stockade
// existed for caught cheaters; this turns it into a running piece of town theatre.
//
// THE CYCLE, and it runs itself — there is no cron:
//   1. A poll is ALWAYS open, and it stands for one day.
//   2. Anyone may nominate a member (with a crime) and everyone gets ONE vote.
//   3. When the day is up the most-voted member goes into the stockade — which frees whoever was already in
//      it — and the next poll opens in the same breath.
//
// THE POLL USED TO STOP WHILE SOMEBODY WAS SERVING, and the sentence ran three days: so for three days out of
// every four the booth was shut, and the first thing that happened after launch was a player hunting the plaza
// for it. The sentence is now exactly as long as the poll that follows it, which makes the two halves one
// rhythm — a day in the stocks while the town decides who replaces you — and the booth is never closed.
//
// Every one of those transitions happens inside `getElection`, which is called by the town page. A cron would
// be a second thing to keep alive for a feature whose whole clock is "somebody looked at the town" — and a
// stockade nobody is looking at does not need to advance.

export const POLL_HOURS = 24;
export const SENTENCE_HOURS = 24;   // exactly one poll long — see the cycle above
export const NOMINATE_COST = 250;   // gold, so putting a name up costs something and the board stays funny
export const MAX_NOMINEES = 12;

// The joke charge sheet. Nominating picks one of these unless you write your own — Jinxx asked for exactly
// this and gave the first two. Deliberately petty: the bit only works if no crime could ever be taken
// seriously, so nothing here accuses anybody of anything a real person would mind being accused of.
export const CRIMES = [
    "Stood there menacingly",
    "Took my left shoe",
    "Stealing flowers from other people's fields",
    "Fed the boss after midnight",
    "Talked at length about their pet",
    "Sold a mystery bag back to the mystery bag",
    "Rolled a natural one and blamed the dice",
    "Kept the last slice of the pizza",
    "Named their ship something unpronounceable",
    "Was suspiciously good at the wheel",
    "Woke the tavern cat",
    "Hoarded doubloons like a dragon",
    "Wore full plate to the farm",
    "Kept saying 'one more raid'",
    "Argued with the town crier",
    "Brought a fishing rod to a boss fight",
];
export const randomCrime = (rng = Math.random) => CRIMES[Math.floor(rng() * CRIMES.length)];

/** Open a fresh poll. Only ever called from `getElection` once the previous cycle has fully finished. */
async function openElection() {
    const row = await db.queryOne(
        `INSERT INTO mkt_stockade_election (closes_at) VALUES (NOW() + ($1 || ' hours')::interval) RETURNING *`,
        [String(POLL_HOURS)]
    ).catch(() => null);
    return row;
}

/**
 * Count the votes and pass sentence.
 *
 * Ties break on who was nominated FIRST — arbitrary, but deterministic and explainable ("they were up first"),
 * which beats a random pick nobody can account for. A poll that closes with no votes at all settles with no
 * winner and the next one opens immediately; an empty stockade is a fine outcome for a quiet week.
 */
async function settleElection(election) {
    const top = await db.queryOne(
        `SELECT n.buyer_id, n.crime, COUNT(v.voter_id)::int AS votes
           FROM mkt_stockade_nominee n
           LEFT JOIN mkt_stockade_vote v ON v.election_id = n.election_id AND v.nominee_id = n.buyer_id
          WHERE n.election_id = $1
          GROUP BY n.buyer_id, n.crime, n.created_at
         HAVING COUNT(v.voter_id) > 0
          ORDER BY votes DESC, n.created_at ASC
          LIMIT 1`, [election.id]
    ).catch(() => null);

    if (!top) {
        await db.query(`UPDATE mkt_stockade_election SET settled_at = NOW() WHERE id = $1`, [election.id]).catch(() => {});
        return null;
    }
    await db.query(
        `UPDATE mkt_stockade_election
            SET settled_at = NOW(), winner_id = $2, winner_crime = $3,
                serves_until = NOW() + ($4 || ' hours')::interval
          WHERE id = $1`,
        [election.id, top.buyer_id, top.crime, String(SENTENCE_HOURS)]
    ).catch(() => {});
    // Putting the new winner in RELEASES whoever was already there — placeInStockade clears any other occupant
    // as its first act — so the handover needs no separate release and the stocks are never empty for a moment.
    await placeInStockade(top.buyer_id, { reason: top.crime }).catch(() => {});
    return top;
}

/**
 * The live state of the whole cycle, and the thing that advances it.
 *
 * `phase` is always "voting" — there is always a poll — and the occupant, if there is one, rides ALONGSIDE it
 * rather than instead of it. It used to be one or the other, which is what shut the booth for days at a time.
 */
export async function getElection(viewerId = null) {
    // 1. A sentence that has run out: let them out. (A sentence that ends because somebody NEW was voted in is
    //    handled by the placement itself — see settleElection.)
    const expired = await db.queryOne(
        `SELECT winner_id FROM mkt_stockade_election
          WHERE settled_at IS NOT NULL AND winner_id IS NOT NULL AND serves_until <= NOW()
          ORDER BY id DESC LIMIT 1`
    ).catch(() => null);
    if (expired?.winner_id) {
        const occ = await getOccupant().catch(() => null);
        if (occ?.buyerId === expired.winner_id) await releaseFromStockade(expired.winner_id).catch(() => {});
    }

    // 2. Is a poll open? Close it if the day is up — settling may put someone away, in which case re-read.
    let election = await db.queryOne(
        `SELECT * FROM mkt_stockade_election WHERE settled_at IS NULL ORDER BY id DESC LIMIT 1`
    ).catch(() => null);
    if (election && new Date(election.closes_at) <= new Date()) {
        await settleElection(election);
        election = null;   // and straight into the next one, below
    }
    if (!election) election = await openElection();

    // Who is in the stocks right now, if anyone. This travels WITH the open poll: the plaza shows the pillory
    // and the booth side by side, and the ballot can name who the town is voting to replace.
    const serving = await db.queryOne(
        `SELECT winner_crime, serves_until FROM mkt_stockade_election
          WHERE settled_at IS NOT NULL AND winner_id IS NOT NULL AND serves_until > NOW()
          ORDER BY id DESC LIMIT 1`
    ).catch(() => null);
    const occupant = await getOccupant().catch(() => null);
    const standing = {
        occupant, crime: serving?.winner_crime || occupant?.reason || null,
        servesUntil: serving?.serves_until || null,
    };

    if (!election) return { phase: "voting", election: null, nominees: [], crimes: CRIMES, ...standing };

    const nominees = await db.query(
        `SELECT n.buyer_id, n.crime, b.display_name, b.alias, b.avatar_sprite_url, b.avatar_url,
                COUNT(v.voter_id)::int AS votes
           FROM mkt_stockade_nominee n
           JOIN mkt_buyer b ON b.id = n.buyer_id
           LEFT JOIN mkt_stockade_vote v ON v.election_id = n.election_id AND v.nominee_id = n.buyer_id
          WHERE n.election_id = $1
          GROUP BY n.buyer_id, n.crime, n.created_at, b.display_name, b.alias, b.avatar_sprite_url, b.avatar_url
          ORDER BY votes DESC, n.created_at ASC`, [election.id]
    ).catch(() => []);

    const myVote = viewerId
        ? (await db.queryOne(`SELECT nominee_id FROM mkt_stockade_vote WHERE election_id = $1 AND voter_id = $2`,
            [election.id, viewerId]).catch(() => null))?.nominee_id || null
        : null;
    const myNomination = viewerId
        ? (await db.queryOne(`SELECT buyer_id FROM mkt_stockade_nominee WHERE election_id = $1 AND nominated_by = $2`,
            [election.id, viewerId]).catch(() => null))?.buyer_id || null
        : null;

    return {
        phase: "voting",
        election: { id: Number(election.id), closesAt: election.closes_at },
        nominees: nominees.map((n) => ({
            id: n.buyer_id, name: n.display_name || (n.alias ? `@${n.alias}` : "A wolf"), alias: n.alias,
            crime: n.crime, votes: Number(n.votes) || 0,
            art: n.avatar_sprite_url || n.avatar_url || null,
        })),
        myVote, myNomination, crimes: CRIMES, nominateCost: NOMINATE_COST,
        sentenceHours: SENTENCE_HOURS,
        sentenceLabel: SENTENCE_HOURS === 24 ? "a day" : `${SENTENCE_HOURS} hours`,
        ...standing,
    };
}

/** Put a name up. Costs gold, one per member per election, and never yourself unless you volunteer. */
export async function nominate(viewerId, target, crime = null) {
    if (!viewerId || !target) return { ok: false, error: "bad_target" };
    // The booth asks for an @handle because that is what members know each other by; ids never appear in the
    // UI. Accept either, so the field is forgiving about the leading @ and about case.
    const targetId = /^[0-9a-f-]{36}$/i.test(String(target))
        ? String(target)
        : (await db.queryOne(`SELECT id FROM mkt_buyer WHERE lower(alias) = lower($1)`, [String(target).replace(/^@/, "")]).catch(() => null))?.id;
    if (!targetId) return { ok: false, error: "no_such_member" };
    const state = await getElection(viewerId);
    if (state.phase !== "voting" || !state.election) return { ok: false, error: "no_election" };
    if (state.myNomination) return { ok: false, error: "already_nominated" };
    if (state.nominees.length >= MAX_NOMINEES) return { ok: false, error: "board_full" };
    if (state.nominees.some((n) => n.id === targetId)) return { ok: false, error: "already_up" };
    // CHECK THE CHARGE BEFORE CHARGING FOR IT. This text goes up on the town square, under somebody else's
    // name, for a day — written by a third party who is not the person it describes. Rejected on save, and
    // before the gold comes out, so a blocked nomination costs nothing to retry.
    const crimeCheck = checkText(crime);
    if (!crimeCheck.clean) return { ok: false, error: "bad_crime", message: crimeCheck.reason };
    // Charged with the balance guard inside the UPDATE — neon() has no transactions, so a double-tap on a slow
    // connection would otherwise put two names up for one payment.
    const paid = await db.queryOne(
        `UPDATE mkt_buyer SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold`,
        [viewerId, NOMINATE_COST]
    ).catch(() => null);
    if (!paid) return { ok: false, error: "insufficient_gold", cost: NOMINATE_COST };
    const text = String(crime || "").trim().slice(0, 90) || randomCrime();
    await db.query(
        `INSERT INTO mkt_stockade_nominee (election_id, buyer_id, crime, nominated_by) VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`, [state.election.id, targetId, text, viewerId]
    ).catch(() => {});
    await trackActivity(viewerId, "stockade_nominate", { election: state.election.id, targetId }).catch(() => {});
    return { ok: true, ...(await getElection(viewerId)) };
}

/** One vote each, changeable — the upsert is the whole rule. */
export async function castVote(viewerId, nomineeId) {
    if (!viewerId || !nomineeId) return { ok: false, error: "bad_vote" };
    const state = await getElection(viewerId);
    if (state.phase !== "voting" || !state.election) return { ok: false, error: "no_election" };
    if (!state.nominees.some((n) => n.id === nomineeId)) return { ok: false, error: "not_nominated" };
    await db.query(
        `INSERT INTO mkt_stockade_vote (election_id, voter_id, nominee_id) VALUES ($1, $2, $3)
         ON CONFLICT (election_id, voter_id) DO UPDATE SET nominee_id = EXCLUDED.nominee_id, created_at = NOW()`,
        [state.election.id, viewerId, nomineeId]
    ).catch(() => {});
    await trackActivity(viewerId, "stockade_vote", { election: state.election.id, nomineeId }).catch(() => {});
    return { ok: true, ...(await getElection(viewerId)) };
}

/**
 * Put somebody straight in without a vote, for a full sentence. The owner tool, and how the very first
 * occupant gets there — Jinxx volunteered publicly and named her own crime, which is a better opening than
 * any election could have produced.
 */
export async function sentenceDirectly(buyerId, crime, hours = SENTENCE_HOURS) {
    if (!buyerId) return { ok: false, error: "no_target" };
    await db.query(`UPDATE mkt_stockade_election SET settled_at = NOW() WHERE settled_at IS NULL`).catch(() => {});
    await db.query(
        `INSERT INTO mkt_stockade_election (closes_at, settled_at, winner_id, winner_crime, serves_until)
         VALUES (NOW(), NOW(), $1, $2, NOW() + ($3 || ' hours')::interval)`,
        [buyerId, String(crime || randomCrime()).slice(0, 90), String(hours)]
    ).catch(() => {});
    return placeInStockade(buyerId, { reason: crime });
}
