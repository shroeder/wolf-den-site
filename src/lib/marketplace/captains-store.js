import "server-only";

// ── THE DB HALF: ONE ROW, ONE CHART, ONE CALL ────────────────────────────────────────────────────────────────
// captains.js holds the rules and is pure; this holds the rows. What it used to hold was a brig — a view, a
// capacity check, an offer, an interrogation, a ransom, a release. All of it existed so that asking a captain
// could FAIL, and the failure sat in the middle of the sailing loop.
//
// Luke: "Remove the whole interrogated mini game. It should just be a... you capture the captain, and he gives
// you the treasure map."
//
// So there is one entry point. Beat an NPC ship, take her captain, hold the chart. The captive row survives as
// the chart's PROVENANCE — who gave it up, off which ship, at what star — and is written already ended,
// because nothing is ever done to him afterwards.

import { db } from "@/lib/db";
import { captainFor, chartBand, chartGrade, handoverFor } from "@/lib/marketplace/captains.js";
import { trackActivity } from "@/lib/marketplace/activity.js";

/**
 * Take her captain and take what he knows. Called from the battle's payout on a WIN.
 *
 * ⚠️ IT CHARGES NOTHING AND BLOCKS NOTHING. The reward has already been paid by the time this runs, and the
 * order below is deliberate: the CHART is written first, then the man who gave it. The worse of the two
 * failures cannot happen that way — a chart with no captain beside it is a chart you can still sail to, while
 * a captain row with no chart is a story about treasure you do not have.
 *
 * Returns null rather than throwing on any failure: a battle must never break because a chart did not write.
 */
export async function captureCaptain(buyerId, rank) {
    const who = captainFor(Math.max(1, Number(rank) || 1));
    const grade = chartGrade(who.stars);
    const band = chartBand(grade);

    const [made] = await db.query(
        `INSERT INTO mkt_ship_chart (buyer_id, grade, band) VALUES ($1,$2,$3) RETURNING id`,
        [buyerId, grade, band.id]
    ).catch(() => []);
    if (!made) return null;

    await db.query(
        `INSERT INTO mkt_ship_captive (buyer_id, rank, stars, art, name, ship, status, ended_at)
         VALUES ($1,$2,$3,$4,$5,$6,'broken',NOW())`,
        [buyerId, who.rank, who.stars, who.art, who.name, who.ship]
    ).catch(() => {});

    await trackActivity(buyerId, "captain_taken", { rank: who.rank, stars: who.stars, grade }).catch(() => {});

    return {
        name: who.name, ship: who.ship, art: who.art, stars: who.stars,
        said: handoverFor(who.stars),
        chart: { id: Number(made.id), grade, band: band.id, bandName: band.name, blurb: band.blurb },
    };
}
