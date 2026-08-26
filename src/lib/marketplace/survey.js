import "server-only";

import { db } from "@/lib/db";
import { trackActivity } from "@/lib/marketplace/activity.js";

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
// ── WHICH ROUND WE ARE ASKING ────────────────────────────────────────────────────────────────────────────────
// Bump this to run another survey. Everything keys off it: who still needs asking, where answers are written,
// and which set of tallies the admin screen shows. Round 1's 34 answers stay exactly where they are — the
// interesting question is not "what do people think" but "what changed", and that needs both rounds intact.
//
// The three QUESTIONS are deliberately unchanged between rounds. Same wording, same shape, so the numbers are
// comparable; the only thing that moves is the list of systems, because the Den has more of them now.
export const SURVEY_ROUND = 2;

// ── THE SYSTEMS ON OFFER ─────────────────────────────────────────────────────────────────────────────────────
// Round 2 adds what shipped since round 1 — the Arena above all, which was literally the most-asked-for thing
// in round 1's free text ("1v1 battle against a person or computer opponent"). Asking about it is how we find
// out whether building it actually landed.
//
// Keys are STABLE. A key that already exists must keep its meaning or the two rounds stop being comparable,
// which is the entire reason for keeping round 1.
export const SYSTEMS = [
    { key: "arena", label: "The Arena", blurb: "Duels, the skill tree, the Long Road" },
    { key: "boss", label: "Boss fights", blurb: "The weekly raid boss" },
    { key: "farm", label: "The Farm", blurb: "Crops, decorations, visiting" },
    { key: "mine", label: "The Mine", blurb: "Mining, smelting, the dungeons" },
    { key: "sailing", label: "Sailing", blurb: "Voyages, ship battles, digging" },
    { key: "fishing", label: "Fishing", blurb: "Casting for species + records" },
    { key: "kitchen", label: "The Kitchen", blurb: "Recipes and cooking" },
    { key: "forge", label: "The Forge", blurb: "Salvage, combine, enhance" },
    { key: "wheel", label: "The Prize Wheel", blurb: "The daily spin" },
    { key: "town", label: "The Town", blurb: "The plaza, skirmishes, the stockade" },
    { key: "pets", label: "Pets", blurb: "Collecting and levelling companions" },
    { key: "gear", label: "Gear & sets", blurb: "Loot, sets, trading, the auction" },
    { key: "quests", label: "Quests & badges", blurb: "Dailies, bounties, the badge shelf" },
    { key: "gems", label: "Gems & the Jeweller", blurb: "Cutting and socketing stones" },
    { key: "creations", label: "Creations", blurb: "Custom art for your farm" },
];
const KEYS = new Set(SYSTEMS.map((s) => s.key));
const WISH_MAX = 400;

/** Has this member already answered? Drives whether the modal ever renders. */
export async function hasAnswered(buyerId) {
    if (!buyerId) return true; // signed-out: never prompt
    // Per ROUND: answering round 1 must not exempt anyone from round 2, which is the whole point of asking again.
    const r = await db.queryOne(
        `SELECT 1 AS x FROM mkt_survey_response WHERE buyer_id = $1 AND round = $2`, [buyerId, SURVEY_ROUND]
    ).catch(() => ({ x: 1 }));
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
        `INSERT INTO mkt_survey_response (buyer_id, round, favorite, least, wish, created_at, updated_at)
         VALUES ($1, $5, $2, $3, $4, NOW(), NOW())
         ON CONFLICT (buyer_id, round) DO UPDATE SET favorite = $2, least = $3, wish = $4, updated_at = NOW()`,
        [buyerId, fav, lst, note || null, SURVEY_ROUND]
    ).catch(() => {});
    await trackActivity(buyerId, "survey_answer", { round: SURVEY_ROUND, favorite: fav, least: lst, wrote: Boolean(note) }).catch(() => {});
    return { ok: true };
}

/** Tallies for the admin read-out: how many picked each system as their favorite / least favorite. */
export async function surveyResults(round = SURVEY_ROUND) {
    // EVERY response, named, with the answer in full. Tallies tell you the shape of the room; they cannot tell
    // you that the two people who put the Mine last both voted hours after it launched, or that the Kitchen's
    // net of -2 is four people disliking it and two loving it rather than mild indifference. Both readings come
    // out of the same rows, so both are served — and the free-text is NOT truncated here: a wish clipped to a
    // preview is a wish you have to go to the database to actually read.
    const [fav, lst, all, total] = await Promise.all([
        db.query(`SELECT favorite AS k, COUNT(*)::int AS n FROM mkt_survey_response WHERE round = $1 AND favorite IS NOT NULL GROUP BY favorite`, [round]).catch(() => []),
        db.query(`SELECT least AS k, COUNT(*)::int AS n FROM mkt_survey_response WHERE round = $1 AND least IS NOT NULL GROUP BY least`, [round]).catch(() => []),
        db.query(`SELECT COALESCE(b.display_name, b.alias, split_part(b.email, '@', 1)) AS name,
                         s.favorite, s.least, s.wish, s.updated_at
                    FROM mkt_survey_response s JOIN mkt_buyer b ON b.id = s.buyer_id
                   WHERE s.round = $1
                   ORDER BY s.updated_at DESC LIMIT 500`, [round]).catch(() => []),
        db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_survey_response WHERE round = $1`, [round]).catch(() => null),
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
