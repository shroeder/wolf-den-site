import "server-only";

// ── THE DB HALF OF THE BRIG ──────────────────────────────────────────────────────────────────────────────────
// captains.js holds the rules and is pure; this holds the rows. The split is the same one ship-battle.js and
// sailing.js already use, and for the same reason: the interrogation has to be runnable in a solver
// (scripts/brig-solve.mjs) without a database anywhere near it.
//
// ⚠️ THE DISPOSITION NEVER LEAVES THIS FILE. It is the answer to the puzzle. `brigView` is the ONLY thing that
// builds a client payload and it withholds `disposition` until he is broken — see the note on it.

import { db } from "@/lib/db";
import {
    BRIG_BERTHS, CHART_PIECES, DISPOSITION_IDS, DISPOSITIONS, TACTICS,
    OFFER_MINUTES, boardingCost, captainFor, chartBand, chartGrade, interrogate, newCaptive, ransomFor, tellFor,
} from "@/lib/marketplace/captains.js";
import { trackActivity } from "@/lib/marketplace/activity.js";

/** Everyone still aboard. Raw rows — internal only, disposition included. */
async function heldRows(buyerId) {
    return db.query(
        `SELECT * FROM mkt_ship_captive
          WHERE buyer_id = $1 AND ended_at IS NULL AND status <> 'offered' ORDER BY taken_at`,
        [buyerId]
    ).catch(() => []);
}

/**
 * Men standing on your deck who have not been paid for yet.
 *
 * ⚠️ THE OFFER IS A ROW AND NOT A MOMENT ON THE VICTORY SCREEN. If taking him only existed while the client
 * still held the result, then closing the tab, a dropped connection or a stray back-button would lose a
 * five-star captain — and it would be unreportable, because nothing would have gone wrong anywhere a log
 * could see it. He waits on deck instead, for OFFER_MINUTES, and the brig can show him.
 */
async function offerRows(buyerId) {
    return db.query(
        `SELECT * FROM mkt_ship_captive
          WHERE buyer_id = $1 AND ended_at IS NULL AND status = 'offered'
            AND taken_at > NOW() - ($2 || ' minutes')::interval
          ORDER BY taken_at DESC`,
        [buyerId, String(OFFER_MINUTES)]
    ).catch(() => []);
}

const rowToCaptive = (r) => ({
    id: Number(r.id), rank: r.rank, stars: r.stars, art: r.art, name: r.name, ship: r.ship,
    disposition: r.disposition, tell: r.tell, will: r.will, nerve: r.nerve,
    tried: typeof r.tried === "string" ? JSON.parse(r.tried || "[]") : (r.tried || []),
    status: r.status,
});

/**
 * What the screen is allowed to know.
 *
 * ⚠️ `disposition` IS THE ANSWER AND IS WITHHELD UNTIL HE BREAKS. Sending it and hiding it in the client is
 * the same as printing it: anybody can open the network tab, and a puzzle whose solution is in the payload is
 * not a puzzle. What DOES travel is the whole history — every tactic tried and what it did — because that is
 * the board the player is reasoning over, and it is what they already saw happen.
 */
function publicCaptive(c) {
    const broken = c.status === "broken";
    return {
        id: c.id, rank: c.rank, stars: c.stars, art: c.art, name: c.name, ship: c.ship,
        tell: c.tell, will: c.will, nerve: c.nerve, tried: c.tried, status: c.status,
        ransom: ransomFor(c.stars),
        // Only once there is nothing left to work out.
        disposition: broken ? c.disposition : null,
        broke: broken ? DISPOSITIONS[c.disposition]?.broke || null : null,
    };
}

export async function brigView(buyerId) {
    const [rows, offers, confessions, charts] = await Promise.all([
        heldRows(buyerId),
        offerRows(buyerId),
        db.query(`SELECT id, stars, name, ship, art FROM mkt_ship_confession
                   WHERE buyer_id = $1 AND spent_on IS NULL ORDER BY made_at`, [buyerId]).catch(() => []),
        db.query(`SELECT id, grade, band, made_at FROM mkt_ship_chart
                   WHERE buyer_id = $1 AND sailed_at IS NULL ORDER BY made_at`, [buyerId]).catch(() => []),
    ]);
    const held = rows.map(rowToCaptive);
    return {
        berths: BRIG_BERTHS,
        captives: held.map(publicCaptive),
        offers: offers.map((r) => {
            const c = rowToCaptive(r);
            return { id: c.id, rank: c.rank, stars: c.stars, art: c.art, name: c.name, ship: c.ship, cost: boardingCost(c.stars) };
        }),
        room: BRIG_BERTHS - held.length,
        confessions: confessions.map((r) => ({ id: Number(r.id), stars: r.stars, name: r.name, ship: r.ship, art: r.art })),
        charts: charts.map((r) => ({ id: Number(r.id), grade: r.grade, band: r.band })),
        piecesNeeded: CHART_PIECES,
        // Confront is unplayable on the only man you are holding, and the screen has to be able to say so
        // BEFORE the tap rather than answering an error afterwards. Any body aboard counts, spent or not —
        // see the note in interrogateCaptive.
        canConfront: held.length > 1,
    };
}

/** Is there room to take another one? Asked before the offer is shown, never after it is accepted. */
export async function brigHasRoom(buyerId) {
    const [r] = await db.query(
        // ⚠️ `status <> 'offered'` — A MAN ON THE DECK IS NOT IN A BERTH. This counted every unended row,
        // which includes offers nobody accepted: they cost nothing, they expire in silence after thirty
        // minutes and they are never swept, so four ignored offers filled the brig permanently and every win
        // after that made no offer at all. No error, no log, nothing to find — the win simply paid its purse
        // and said nothing, which is exactly the shape of "I defeated the ship and didn't get the
        // interrogation". captiveRows twenty lines up already draws this distinction; this did not.
        `SELECT COUNT(*)::int AS n FROM mkt_ship_captive
          WHERE buyer_id = $1 AND ended_at IS NULL AND status <> 'offered'`, [buyerId]
    ).catch(() => [{ n: 0 }]);
    return (r?.n ?? 0) < BRIG_BERTHS;
}

/**
 * Write the offer. Called from the battle's payout on a win — it charges nothing, blocks nothing, and the
 * reward has already been paid by the time it runs.
 *
 * The disposition is rolled HERE and once — not derived from the ship, because a captain you have taken before
 * must not be a captain whose answer you already know.
 */
export async function offerCaptain(buyerId, rank) {
    const who = captainFor(rank);
    const disposition = DISPOSITION_IDS[Math.floor(Math.random() * DISPOSITION_IDS.length)];
    const c = newCaptive({
        rank: who.rank, art: who.art, name: who.name, stars: who.stars,
        disposition, tell: tellFor(disposition, who.stars, Math.floor(Math.random() * 997)),
    });
    const [row] = await db.query(
        `INSERT INTO mkt_ship_captive (buyer_id, rank, stars, art, name, ship, disposition, tell, will, nerve, tried, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'[]'::jsonb,'offered') RETURNING id`,
        [buyerId, who.rank, who.stars, who.art, who.name, who.ship, disposition, c.tell, c.will, c.nerve]
    ).catch(() => []);
    if (!row) return null;
    return { id: Number(row.id), rank: who.rank, stars: who.stars, art: who.art, name: who.name, ship: who.ship, cost: boardingCost(who.stars) };
}

/** Pay for him and put him in a berth. The only thing in this feature that takes money off the player. */
export async function acceptOffer(buyerId, offerId) {
    const [offer] = (await offerRows(buyerId)).filter((r) => Number(r.id) === Number(offerId));
    if (!offer) return { ok: false, error: "no_offer" };
    if (!(await brigHasRoom(buyerId))) return { ok: false, error: "brig_full" };
    const cost = boardingCost(offer.stars);
    // ⚠️ THE DEBIT CARRIES ITS OWN CONDITION. No transaction exists on this driver, so "can he afford it" and
    // "take it" have to be the same statement or a double-tap buys two captains with one purse.
    const [purse] = await db.query(
        `UPDATE mkt_sailing SET doubloons = doubloons - $2
          WHERE buyer_id = $1 AND COALESCE(doubloons,0) >= $2 RETURNING doubloons`,
        [buyerId, cost]
    ).catch(() => []);
    if (!purse) return { ok: false, error: "not_enough_doubloons", cost };
    const [row] = await db.query(
        `UPDATE mkt_ship_captive SET status = 'held', taken_at = NOW()
          WHERE id = $1 AND buyer_id = $2 AND status = 'offered' AND ended_at IS NULL RETURNING *`,
        [offer.id, buyerId]
    ).catch(() => []);
    if (!row) {
        // Give the money back rather than swallow it — the offer expiring between two statements is rare and
        // is still our problem, not the player's.
        await db.query(`UPDATE mkt_sailing SET doubloons = doubloons + $2 WHERE buyer_id = $1`, [buyerId, cost]).catch(() => {});
        return { ok: false, error: "gone" };
    }
    await trackActivity(buyerId, "captain_taken", { rank: row.rank, stars: row.stars, doubloons: cost }).catch(() => {});
    return { ok: true, captive: publicCaptive(rowToCaptive(row)), doubloons: purse.doubloons, cost };
}

/** One move. Everything that decides the outcome happens in captains.js; this only persists the result. */
export async function interrogateCaptive(buyerId, captiveId, tactic) {
    const rows = await heldRows(buyerId);
    const row = rows.find((r) => Number(r.id) === Number(captiveId));
    if (!row) return { ok: false, error: "no_captive" };
    // -- A SPENT MAN IS STILL A BODY IN A CELL -----------------------------------------------------
    // Confront needs somebody to walk in, not somebody who is still talking. Counting only `held` here
    // would make a captain whose nerve you exhausted pure dead weight in a berth, when he is in fact the
    // cheapest possible Confront partner: he has nothing left to give you himself and can still be the
    // face in the doorway. It also softens a failed interrogation into something rather than nothing,
    // which matters because failure is already paid for by a ransom that is worth less than a confession.
    const others = rows.filter((r) => Number(r.id) !== Number(captiveId)).length;
    const res = interrogate(rowToCaptive(row), tactic, others);
    if (res.error) return { ok: false, error: res.error };

    const c = res.captive;
    // ⚠️ NO TRANSACTION — this driver speaks HTTP (see the note in postgres-landmines). The captive row is
    // the only thing that must move atomically and it moves in one statement; the confession below is a
    // separate insert whose absence would cost a confession, not corrupt a captive. Ordered so the worse
    // failure cannot happen: he is only marked broken after the row that records why.
    let confession = null;
    if (res.broke) {
        const [conf] = await db.query(
            `INSERT INTO mkt_ship_confession (buyer_id, stars, name, ship, art)
             VALUES ($1,$2,$3,$4,$5) RETURNING id, stars, name, ship, art`,
            [buyerId, c.stars, c.name, c.ship, c.art]
        ).catch(() => []);
        confession = conf ? { id: Number(conf.id), stars: conf.stars, name: conf.name, ship: conf.ship, art: conf.art } : null;
    }
    await db.query(
        `UPDATE mkt_ship_captive
            SET will = $2, nerve = $3, tried = $4::jsonb, status = $5,
                ended_at = CASE WHEN $5 = 'broken' THEN NOW() ELSE ended_at END
          WHERE id = $1`,
        [row.id, c.will, c.nerve, JSON.stringify(c.tried), c.status]
    ).catch(() => {});
    if (res.broke) await trackActivity(buyerId, "captain_broken", { rank: c.rank, stars: c.stars }).catch(() => {});

    return {
        ok: true, outcome: res.outcome, said: res.said, broke: res.broke, spent: res.spent,
        captive: publicCaptive(c), confession,
    };
}

/** He buys himself back. The only thing left to do with a man whose nerve outlasted yours. */
export async function ransomCaptive(buyerId, captiveId) {
    const rows = await heldRows(buyerId);
    const row = rows.find((r) => Number(r.id) === Number(captiveId));
    if (!row) return { ok: false, error: "no_captive" };
    if (row.status === "broken") return { ok: false, error: "already_broken" };
    const paid = ransomFor(row.stars);
    // ⚠️ ONE ROW, ONCE. The conditional in the WHERE is what stops a double-tap paying twice — there is no
    // transaction to lean on here, so the guard has to be in the statement that does the work.
    const [done] = await db.query(
        `UPDATE mkt_ship_captive SET status = 'ransomed', ended_at = NOW()
          WHERE id = $1 AND ended_at IS NULL RETURNING id`, [row.id]
    ).catch(() => []);
    if (!done) return { ok: false, error: "already_gone" };
    // ⚠️ IMPORTED HERE AND NOT AT THE TOP. sailing.js imports THIS file for the capture hook at the end of a
    // battle, so a top-level import back into it is a cycle — and the same deferred-import shape is what
    // sailing.js already uses to reach the Forge and the farm from inside a payout.
    const { grantDoubloons } = await import("@/lib/marketplace/sailing.js");
    await grantDoubloons(buyerId, paid).catch(() => {});
    await trackActivity(buyerId, "captain_ransomed", { stars: row.stars, doubloons: paid }).catch(() => {});
    return { ok: true, doubloons: paid };
}

/** Put him off at the next port for nothing. There is no reward and there is not meant to be. */
export async function releaseCaptive(buyerId, captiveId) {
    const [done] = await db.query(
        `UPDATE mkt_ship_captive SET status = 'released', ended_at = NOW()
          WHERE id = $1 AND buyer_id = $2 AND ended_at IS NULL RETURNING id`, [captiveId, buyerId]
    ).catch(() => []);
    return done ? { ok: true } : { ok: false, error: "no_captive" };
}

/**
 * Three confessions into a chart. The oldest three, so the player never has to choose which men to spend —
 * and the grade is their stars added up, which is Luke's "the star rating of the captain helps determine the
 * quality of the island".
 */
export async function makeChart(buyerId) {
    const rows = await db.query(
        `SELECT id, stars FROM mkt_ship_confession WHERE buyer_id = $1 AND spent_on IS NULL
          ORDER BY made_at LIMIT $2`, [buyerId, CHART_PIECES]
    ).catch(() => []);
    if (rows.length < CHART_PIECES) return { ok: false, error: "not_enough", have: rows.length, need: CHART_PIECES };
    const grade = chartGrade(rows.map((r) => r.stars));
    const band = chartBand(grade);
    const [chart] = await db.query(
        `INSERT INTO mkt_ship_chart (buyer_id, grade, band) VALUES ($1,$2,$3) RETURNING id, grade, band`,
        [buyerId, grade, band.id]
    ).catch(() => []);
    if (!chart) return { ok: false, error: "failed" };
    // Spent only after the chart exists, so a failure here costs a chart nobody paid for rather than three
    // confessions that bought nothing.
    await db.query(
        `UPDATE mkt_ship_confession SET spent_on = $1 WHERE id = ANY($2::bigint[])`,
        [chart.id, rows.map((r) => Number(r.id))]
    ).catch(() => {});
    await trackActivity(buyerId, "chart_made", { grade, band: band.id }).catch(() => {});
    return { ok: true, chart: { id: Number(chart.id), grade, band: band.id, name: band.name, blurb: band.blurb } };
}

export { TACTICS };
