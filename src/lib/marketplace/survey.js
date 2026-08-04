import "server-only";

import { db } from "@/lib/db";

// ── THE MEMBER SURVEY ────────────────────────────────────────────────────────────────────────────────────────
// Which systems people actually LIKE. Telemetry already says what gets used, which is a different question — a
// system can be used every day because it pays well and still be the one someone would drop first. The only way
// to know that is to ask.
//
// Deliberately three questions. A survey that takes thirty seconds gets answered; one with a page of questions
// gets dismissed, and a dismissed survey tells you nothing at all.
//
// One row per member, overwritten on re-answer: this is an opinion, not an event log.

// The keys are stable — they are what lands in the DB. Adding a system here is safe; renaming one orphans the
// answers already recorded against the old key, so don't.
export const SYSTEMS = [
    { key: "boss", label: "Boss fights", blurb: "The weekly raid boss" },
    { key: "farm", label: "The Farm", blurb: "Crops, decorations, visiting" },
    { key: "mine", label: "The Mine", blurb: "Delving, mining, smelting" },
    { key: "sailing", label: "Sailing", blurb: "Voyages, raids, digging" },
    { key: "fishing", label: "Fishing", blurb: "Casting for species + records" },
    { key: "kitchen", label: "The Kitchen", blurb: "Recipes and cooking" },
    { key: "forge", label: "The Forge", blurb: "Salvage, combine, enhance" },
    { key: "wheel", label: "The Prize Wheel", blurb: "The daily spin" },
    { key: "town", label: "The Town", blurb: "The plaza, raids, the tavern" },
    { key: "pets", label: "Pets", blurb: "Collecting and levelling companions" },
    { key: "gear", label: "Gear & sets", blurb: "Loot, sets, the auction house" },
    { key: "quests", label: "Quests & badges", blurb: "Dailies, bounties, the badge shelf" },
];
const KEYS = new Set(SYSTEMS.map((s) => s.key));
const WISH_MAX = 400;

/** Has this member already answered? Drives whether the modal ever renders. */
export async function hasAnswered(buyerId) {
    if (!buyerId) return true; // signed-out: never prompt
    const r = await db.queryOne(`SELECT 1 AS x FROM mkt_survey_response WHERE buyer_id = $1`, [buyerId]).catch(() => ({ x: 1 }));
    // On a DB error this returns "answered" on purpose — a survey that pops up because a query failed is worse
    // than one that quietly doesn't.
    return Boolean(r);
}

export async function saveResponse(buyerId, { favorite, least, wish } = {}) {
    if (!buyerId) return { ok: false, error: "signed_out" };
    // Unknown keys are dropped rather than rejected: a stale client shouldn't lose someone's whole answer.
    const fav = KEYS.has(favorite) ? favorite : null;
    const lst = KEYS.has(least) ? least : null;
    const note = typeof wish === "string" ? wish.trim().slice(0, WISH_MAX) : null;
    if (!fav && !lst && !note) return { ok: false, error: "empty" };
    await db.query(
        `INSERT INTO mkt_survey_response (buyer_id, favorite, least, wish, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT (buyer_id) DO UPDATE SET favorite = $2, least = $3, wish = $4, updated_at = NOW()`,
        [buyerId, fav, lst, note || null]
    ).catch(() => {});
    return { ok: true };
}

/** Tallies for the admin read-out: how many picked each system as their favorite / least favorite. */
export async function surveyResults() {
    // EVERY response, named, with the answer in full. Tallies tell you the shape of the room; they cannot tell
    // you that the two people who put the Mine last both voted hours after it launched, or that the Kitchen's
    // net of -2 is four people disliking it and two loving it rather than mild indifference. Both readings come
    // out of the same rows, so both are served — and the free-text is NOT truncated here: a wish clipped to a
    // preview is a wish you have to go to the database to actually read.
    const [fav, lst, all, total] = await Promise.all([
        db.query(`SELECT favorite AS k, COUNT(*)::int AS n FROM mkt_survey_response WHERE favorite IS NOT NULL GROUP BY favorite`).catch(() => []),
        db.query(`SELECT least AS k, COUNT(*)::int AS n FROM mkt_survey_response WHERE least IS NOT NULL GROUP BY least`).catch(() => []),
        db.query(`SELECT COALESCE(b.display_name, b.alias, split_part(b.email, '@', 1)) AS name,
                         s.favorite, s.least, s.wish, s.updated_at
                    FROM mkt_survey_response s JOIN mkt_buyer b ON b.id = s.buyer_id
                   ORDER BY s.updated_at DESC LIMIT 500`).catch(() => []),
        db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_survey_response`).catch(() => null),
    ]);
    const notes = all.filter((r) => r.wish && r.wish.trim());
    const byKey = (rows) => Object.fromEntries(rows.map((r) => [r.k, r.n]));
    const f = byKey(fav), l = byKey(lst);
    return {
        responses: total?.n || 0,
        systems: SYSTEMS.map((s) => ({ ...s, favorite: f[s.key] || 0, least: l[s.key] || 0, net: (f[s.key] || 0) - (l[s.key] || 0) }))
            .sort((a, b) => b.net - a.net || b.favorite - a.favorite),
        wishes: notes.map((r) => ({ name: r.name || "Member", wish: r.wish, favorite: r.favorite, least: r.least, at: r.updated_at })),
        // Every response, newest first — who said what, so a tally can always be traced back to people.
        responsesList: all.map((r) => ({ name: r.name || "Member", favorite: r.favorite, least: r.least, wish: r.wish || null, at: r.updated_at })),
    };
}
