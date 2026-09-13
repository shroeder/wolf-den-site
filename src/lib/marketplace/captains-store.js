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
    BRIG_BERTHS, DISPOSITION_IDS, DISPOSITIONS, TACTICS,
    captainFor, chartBand, chartGrade, interrogate, newCaptive, tellFor,
} from "@/lib/marketplace/captains.js";
import { trackActivity } from "@/lib/marketplace/activity.js";

/**
 * The man below decks. Raw row — internal only, disposition included.
 *
 * ⚠️ NO CLOCK, AND THAT IS THE POINT. He stood on the deck for thirty minutes and then went over the side,
 * which made him a thing you could LOSE — and a thing you can lose is a thing you have to remember to go and
 * collect. Luke: "There's no risk to be on two because you can only ever be on one. It's blocking ... You
 * can't move on from sailing until you interrogate them. If you click sailing or if you leave and you come
 * back to sailing, you're still stuck on the interrogation until you finish."
 *
 * So he waits as long as it takes, and the sea is shut until he has talked. See captainBlocking in
 * sailing.js, which is the half that shuts it.
 */
async function heldRows(buyerId) {
    return db.query(
        `SELECT * FROM mkt_ship_captive
          WHERE buyer_id = $1 AND ended_at IS NULL AND status = 'held'
          ORDER BY taken_at DESC`,
        [buyerId]
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
        // Only once there is nothing left to work out.
        disposition: broken ? c.disposition : null,
        broke: broken ? DISPOSITIONS[c.disposition]?.broke || null : null,
    };
}

export async function brigView(buyerId) {
    const [rows, charts] = await Promise.all([
        heldRows(buyerId),
        db.query(`SELECT id, grade, band, made_at FROM mkt_ship_chart
                   WHERE buyer_id = $1 AND sailed_at IS NULL ORDER BY made_at`, [buyerId]).catch(() => []),
    ]);
    // ⚠️ ONE MAN, AND CONFESSIONS ARE GONE. This returned a berth list, an offer list, a confession pile and a
    // "pieces needed" counter — the furniture of a collection. He is a step to the treasure now: there is the
    // captain standing in front of you, or there is not, and there are the charts he has already given up.
    return {
        captain: rows.map(rowToCaptive).map(publicCaptive)[0] || null,
        charts: charts.map((r) => ({ id: Number(r.id), grade: r.grade, band: r.band })),
    };
}

/** Is there room to take another one? Asked before the offer is shown, never after it is accepted. */
export async function brigHasRoom(buyerId) {
    // ⚠️ ONE MAN, AND THE SAME WINDOW heldRows USES. This counted every unended row, which included offers
    // nobody accepted — they cost nothing, expire in silence and are never swept, so a handful of ignored
    // ones locked the brig and every win afterwards made no offer at all, with nothing in any log. There are
    // no offers now and no berths; the only question is whether somebody is already standing there.
    return (await heldRows(buyerId)).length < BRIG_BERTHS;
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
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'[]'::jsonb,'held') RETURNING id`,
        [buyerId, who.rank, who.stars, who.art, who.name, who.ship, disposition, c.tell, c.will, c.nerve]
    ).catch(() => []);
    if (!row) return null;
    // No `cost` any more: he is free and he is already on the deck. There is nothing to accept.
    return { id: Number(row.id), rank: who.rank, stars: who.stars, art: who.art, name: who.name, ship: who.ship };
}

// ⚠️ acceptOffer IS GONE. He used to stand on the deck until you paid his boarding cost, which is the shape a
// thing you KEEP has — you decide, and the decision has a price. He is a step to the treasure now, so he
// arrives already held and costs nothing; the only thing you do with a captain is ask him.

export async function interrogateCaptive(buyerId, captiveId, tactic) {
    const rows = await heldRows(buyerId);
    const row = rows.find((r) => Number(r.id) === Number(captiveId));
    if (!row) return { ok: false, error: "no_captive" };
    // Confront reaches for his own CREW now rather than another prisoner — see the note on it in
    // captains.js — so there is no second body to count and the argument is always satisfied.
    const res = interrogate(rowToCaptive(row), tactic, 1);
    if (res.error) return { ok: false, error: res.error };

    const c = res.captive;
    // ⚠️ NO TRANSACTION — this driver speaks HTTP (see the note in postgres-landmines). The captive row is
    // the only thing that must move atomically and it moves in one statement; the confession below is a
    // separate insert whose absence would cost a confession, not corrupt a captive. Ordered so the worse
    // failure cannot happen: he is only marked broken after the row that records why.
    // ⚠️ THE CHART IS MINTED HERE, ON THE BREAK. It used to write a CONFESSION and wait for two more. One
    // man is one answer now, so the thing he gives up is the chart itself, graded on his own stars — see
    // chartGrade. Written BEFORE he is marked broken, so the worse of the two failures cannot happen: a man
    // who breaks and hands over nothing is unreportable, a chart with no matching captive row is visible.
    let chart = null;
    if (res.broke) {
        const grade = chartGrade(c.stars);
        const band = chartBand(grade);
        const [made] = await db.query(
            `INSERT INTO mkt_ship_chart (buyer_id, grade, band) VALUES ($1,$2,$3) RETURNING id, grade, band`,
            [buyerId, grade, band.id]
        ).catch(() => []);
        chart = made ? { id: Number(made.id), grade, band: band.id, name: band.name, blurb: band.blurb } : null;
    }
    // ⚠️ AND HE IS OFF THE DECK EITHER WAY. `spent` used to leave him sitting in a berth as a Confront
    // partner and a ransom you could still collect. There is nothing left to do with him, so an
    // interrogation that ends, ends him — which is the whole of "transient, a stepping stone, not collected".
    const over = res.broke || c.status === "spent";
    await db.query(
        `UPDATE mkt_ship_captive
            SET will = $2, nerve = $3, tried = $4::jsonb, status = $5,
                ended_at = CASE WHEN $6 THEN NOW() ELSE ended_at END
          WHERE id = $1`,
        [row.id, c.will, c.nerve, JSON.stringify(c.tried), c.status, over]
    ).catch(() => {});
    if (res.broke) await trackActivity(buyerId, "captain_broken", { rank: c.rank, stars: c.stars, grade: chart?.grade || null }).catch(() => {});

    return {
        ok: true, outcome: res.outcome, said: res.said, broke: res.broke, spent: res.spent,
        captive: publicCaptive(c), chart,
    };
}

// ⚠️ RANSOM, RELEASE AND makeChart ARE GONE, AND SO IS THE CHOICE THEY EXISTED FOR. They were the three ways
// a man left a berth — he bought himself out, you let him go, or you spent his confession with two others.
// Nothing keeps him now: breaking him ends him with a chart in your hand, running out of nerve ends him with
// nothing, and either way he is off the deck by the time the panel redraws. A captain you can still do
// something with tomorrow is a captain you are collecting.

export { TACTICS };
