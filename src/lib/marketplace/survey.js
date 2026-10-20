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
export const SURVEY_ROUND = 3;

// -- IT CLOSES, AND IT CLOSES FOR EVERYONE AT THE SAME MOMENT -------------------------------------------------
// Luke: "it expires after 2 days meaning anyone later won't see it."
//
// Rounds 1 and 2 ran until somebody remembered to bump the number, so answers trickled in over weeks and the
// last ones were about a different game from the first ones. A survey with a closing time is one you can
// actually read: everybody answered the same Den, in the same week, and the tally is final rather than
// provisional for ever.
//
// AN ABSOLUTE INSTANT, not "two days after you first saw it". A per-member window would leave this quietly
// open for a month because somebody logged in on day twenty-nine, and would make the result impossible to
// date. Once it passes the modal never renders again, for anybody.
export const SURVEY_OPENS = Date.parse("2026-10-20T00:00:00Z");
export const SURVEY_CLOSES = Date.parse("2026-10-22T00:00:00Z");
export const surveyOpen = (now = Date.now()) => now >= SURVEY_OPENS && now < SURVEY_CLOSES;

// -- WHO IS ASKED ---------------------------------------------------------------------------------------------
// Luke: "Id only like it to show to those who have at least 1000 account actions in the last 30 days."
//
// This round decides where the next few months of building go, and the answers that should carry are from the
// people who would live with it. Twenty-two members clear this bar; the next one below is at 833, so the line
// sits in a real gap rather than cutting through the middle of the room.
//
// COUNTED, NOT ESTIMATED, AND ONLY ONCE -- the count scans one member's events over thirty days, which is not
// free, so it runs only after the cheap tests have passed. See shouldAsk.
export const SURVEY_MIN_ACTIONS = 1000;

// ── THE SYSTEMS ON OFFER ─────────────────────────────────────────────────────────────────────────────────────
// Round 2 adds what shipped since round 1 — the Arena above all, which was literally the most-asked-for thing
// in round 1's free text ("1v1 battle against a person or computer opponent"). Asking about it is how we find
// out whether building it actually landed.
//
// Keys are STABLE. A key that already exists must keep its meaning or the two rounds stop being comparable,
// which is the entire reason for keeping round 1.
// ROUND 3 ADDS THE THREE THE LIST HAD BEEN MISSING, and it had been missing them for months. Measured over
// the thirty days before this round opened:
//
//   The Casino     11,999 plays by 28 members -- the most-played thing in the Den, and not on the list at all
//   The Dungeons    2,317 runs by 35 members -- MORE members than the casino, and it was a clause inside the
//                   Mine's description rather than a system anybody could pick
//   The Card Game     821 runs by 31 members lifetime; it launched on 11 September, after round 2 was written
//
// So two rounds of answers came from people who could not name the thing they spend the most time on. That is
// worth remembering when reading rounds 1 and 2, and it is why this list is now derived from the NAV -- the
// actual inventory of doors in the game -- rather than from memory.
//
// `art` is a real painted sprite rather than a glyph, and none of it had to be drawn: fifteen come from the
// nav's own icon set and three from the Pathfinder's chapter art, same hand and same lighting.
//
// Keys are STABLE. A key that already exists must keep its meaning or the rounds stop being comparable. The
// one exception is `mine`, which loses "the dungeons" now that the dungeons stand on their own -- so its
// round-2-to-3 numbers are not quite like-for-like. That is a deliberate trade: the alternative is leaving
// thirty-five people's favourite activity hidden inside another system's description for ever.
//
// Ordered by how much each is actually played, so the top of the list is where the attention already is.
export const SYSTEMS = [
    { key: "arena", label: "The Arena", blurb: "Duels, the skill tree, the Long Road", art: "/images/guide/ch-arena.webp" },
    { key: "boss", label: "The World Boss", blurb: "The weekly boss everybody hits", art: "/images/nav/boss.png" },
    { key: "casino", label: "The Casino", blurb: "Slots, blackjack, keno, bingo", art: "/images/nav/casino.png" },
    { key: "dungeons", label: "The Dungeons", blurb: "Delve runs, a boss at the bottom", art: "/images/nav/delves.png" },
    { key: "mine", label: "The Mine", blurb: "Mining, smelting, the depths", art: "/images/nav/mining.png" },
    { key: "sailing", label: "Sailing", blurb: "Voyages, ship battles, digging", art: "/images/nav/sailing.png" },
    { key: "fishing", label: "Fishing", blurb: "Casting for species and records", art: "/images/nav/fishing.png" },
    { key: "farm", label: "The Farm", blurb: "Crops, decorations, visiting", art: "/images/nav/farm.png" },
    { key: "kitchen", label: "The Kitchen", blurb: "Recipes and cooking", art: "/images/guide/ch-kitchen.webp" },
    { key: "cards", label: "The Card Game", blurb: "The deck-building run", art: "/images/nav/cards.png" },
    { key: "town", label: "The Town", blurb: "The plaza, raids, the stockade", art: "/images/nav/town.png" },
    { key: "pets", label: "Pets", blurb: "Collecting and levelling companions", art: "/images/nav/pets.png" },
    { key: "gear", label: "Gear & sets", blurb: "Loot, sets, trading, the auction", art: "/images/nav/gear.png" },
    { key: "forge", label: "The Forge", blurb: "Salvage, combine, enhance", art: "/images/nav/forge.png" },
    { key: "wheel", label: "The Prize Wheel", blurb: "The daily spin", art: "/images/nav/spin.png" },
    { key: "quests", label: "Quests & badges", blurb: "Dailies, bounties, the shelf", art: "/images/nav/quests.png" },
    { key: "gems", label: "Gems & the Jeweller", blurb: "Cutting and socketing stones", art: "/images/guide/ch-jeweller.webp" },
    { key: "creations", label: "Creations", blurb: "Custom art for your farm", art: "/images/nav/creations.png" },
];

// -- THE THIRD QUESTION ---------------------------------------------------------------------------------------
// The one the round exists for. Everything in the Den today is something you set going and come back to, and
// the question is whether people would sit down and PLAY something -- hands on it, moment to moment.
//
// IT NAMES NOTHING. No forest, no hero you move, no mention of real time. The point is to learn whether the
// appetite is there BEFORE anybody is shown a thing and asked to be polite about it, and a question that
// describes its own answer is not a question.
//
// "Both, in that order" is the option that earns its place. It is the likeliest winner and the most useful
// reading, because it separates "yes, as well" from "yes, instead" -- which are different instructions.
export const PACE = [
    { key: "idle", label: "Keep it as it is", blurb: "I like checking in. Things ticking away while I am at work is the whole appeal." },
    { key: "active", label: "I would play something hands-on", blurb: "Give me something to actually play, moment to moment, when I have twenty minutes." },
    { key: "both", label: "Both, in that order", blurb: "Hands-on is welcome as long as nothing I already have stops ticking over." },
    { key: "nopref", label: "No strong feeling", blurb: "Honestly do not mind either way." },
];
const PACE_KEYS = new Set(PACE.map((x) => x.key));
const KEYS = new Set(SYSTEMS.map((s) => s.key));
const WISH_MAX = 400;

// -- THE THREE TESTS, CHEAPEST FIRST --------------------------------------------------------------------------
// Whether to ask at all. Deliberately ordered so the expensive one almost never runs:
//
//   1. IS THE ROUND OPEN -- pure arithmetic on two constants, free, and false for everybody after the 22nd
//   2. HAVE THEY ANSWERED -- one indexed read, the test that was already here
//   3. ARE THEY ACTIVE ENOUGH -- a thirty-day scan of one member's events, which is the only costly part
//
// Putting the count last matters more than it looks. This is read from a component in the nav, so it runs on
// navigations by every signed-in member; once the window shuts, step 1 answers no and nothing else happens
// for the rest of the Den's life. See CLAUDE.md on what a layout-mounted component may do.
export async function shouldAsk(buyerId) {
    if (!buyerId) return false;
    if (!surveyOpen()) return false;
    if (await hasAnswered(buyerId)) return false;
    const r = await db.queryOne(
        `SELECT COUNT(*)::int AS n FROM mkt_activity_event
          WHERE buyer_id = $1 AND created_at > NOW() - INTERVAL '30 days'`, [buyerId]
    ).catch(() => null);
    // A failed count reads as "not active enough" on purpose: a survey that appears because a query broke is
    // worse than one that quietly does not.
    return (r?.n || 0) >= SURVEY_MIN_ACTIONS;
}

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

export async function saveResponse(buyerId, { favorite, least, more, pace, wish } = {}) {
    if (!buyerId) return { ok: false, error: "signed_out" };
    // A CLOSED ROUND TAKES NO ANSWERS. The modal is gone by then, but a tab left open since yesterday still
    // has a live Send button on it, and an answer arriving after the tally has been read is a number that
    // changes behind somebody's back.
    if (!surveyOpen()) return { ok: false, error: "closed" };
    // Unknown keys are dropped rather than rejected: a stale client shouldn't lose someone's whole answer.
    const fav = KEYS.has(favorite) ? favorite : null;
    const lst = KEYS.has(least) ? least : null;
    const mor = KEYS.has(more) ? more : null;
    const pce = PACE_KEYS.has(pace) ? pace : null;
    const note = typeof wish === "string" ? wish.trim().slice(0, WISH_MAX) : null;
    if (!fav && !lst && !mor && !pce && !note) return { ok: false, error: "empty" };
    await db.query(
        `INSERT INTO mkt_survey_response (buyer_id, round, favorite, least, more, pace, wish, created_at, updated_at)
         VALUES ($1, $7, $2, $3, $4, $5, $6, NOW(), NOW())
         ON CONFLICT (buyer_id, round) DO UPDATE SET favorite = $2, least = $3, more = $4, pace = $5,
                                                     wish = $6, updated_at = NOW()`,
        [buyerId, fav, lst, mor, pce, note || null, SURVEY_ROUND]
    ).catch(() => {});
    await trackActivity(buyerId, "survey_answer", { round: SURVEY_ROUND, favorite: fav, more: mor, pace: pce, wrote: Boolean(note) }).catch(() => {});
    return { ok: true };
}

/** Tallies for the admin read-out: how many picked each system as their favorite / least favorite. */
export async function surveyResults(round = SURVEY_ROUND) {
    // EVERY response, named, with the answer in full. Tallies tell you the shape of the room; they cannot tell
    // you that the two people who put the Mine last both voted hours after it launched, or that the Kitchen's
    // net of -2 is four people disliking it and two loving it rather than mild indifference. Both readings come
    // out of the same rows, so both are served — and the free-text is NOT truncated here: a wish clipped to a
    // preview is a wish you have to go to the database to actually read.
    const [fav, lst, mor, pce, all, total] = await Promise.all([
        db.query(`SELECT favorite AS k, COUNT(*)::int AS n FROM mkt_survey_response WHERE round = $1 AND favorite IS NOT NULL GROUP BY favorite`, [round]).catch(() => []),
        db.query(`SELECT least AS k, COUNT(*)::int AS n FROM mkt_survey_response WHERE round = $1 AND least IS NOT NULL GROUP BY least`, [round]).catch(() => []),
        db.query(`SELECT more AS k, COUNT(*)::int AS n FROM mkt_survey_response WHERE round = $1 AND more IS NOT NULL GROUP BY more`, [round]).catch(() => []),
        db.query(`SELECT pace AS k, COUNT(*)::int AS n FROM mkt_survey_response WHERE round = $1 AND pace IS NOT NULL GROUP BY pace`, [round]).catch(() => []),
        db.query(`SELECT COALESCE(b.display_name, b.alias, split_part(b.email, '@', 1)) AS name,
                         s.favorite, s.least, s.more, s.pace, s.wish, s.updated_at
                    FROM mkt_survey_response s JOIN mkt_buyer b ON b.id = s.buyer_id
                   WHERE s.round = $1
                   ORDER BY s.updated_at DESC LIMIT 500`, [round]).catch(() => []),
        db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_survey_response WHERE round = $1`, [round]).catch(() => null),
    ]);
    const notes = all.filter((r) => r.wish && r.wish.trim());
    const byKey = (rows) => Object.fromEntries(rows.map((r) => [r.k, r.n]));
    const f = byKey(fav), l = byKey(lst), m = byKey(mor), pc = byKey(pce);
    return {
        responses: total?.n || 0,
        // `net` is favourite minus least, which rounds 1 and 2 ranked by. Round 3 asks no least-favourite, so
        // net collapses to the favourite count for it and the sort still reads correctly either way.
        systems: SYSTEMS.map((x) => ({ ...x, favorite: f[x.key] || 0, least: l[x.key] || 0, more: m[x.key] || 0, net: (f[x.key] || 0) - (l[x.key] || 0) }))
            .sort((a, b) => b.net - a.net || b.more - a.more || b.favorite - a.favorite),
        // The question the round was run for, kept in the authored order rather than sorted by count — the
        // shape of the split is the finding, and a bar chart that reorders itself hides which way it leans.
        pace: PACE.map((x) => ({ ...x, n: pc[x.key] || 0 })),
        wishes: notes.map((r) => ({ name: r.name || "Member", wish: r.wish, favorite: r.favorite, least: r.least, at: r.updated_at })),
        // Every response, newest first — who said what, so a tally can always be traced back to people.
        responsesList: all.map((r) => ({ name: r.name || "Member", favorite: r.favorite, least: r.least, more: r.more || null, pace: r.pace || null, wish: r.wish || null, at: r.updated_at })),
    };
}
