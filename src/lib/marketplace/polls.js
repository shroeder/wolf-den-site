import "server-only";

import { db } from "@/lib/db";
import { trackActivity } from "@/lib/marketplace/activity.js";

// ── ASKING THE DEN A DESIGN QUESTION ─────────────────────────────────────────────────────────────────────────
// The member survey answers one fixed shape — favourite system, least favourite, one wish — and it is good at
// it. This is the other kind of question: multiple choice, different every time, asked when a decision is
// genuinely open rather than on a schedule.
//
// It exists because of one in the plaza. ValkyrieSylve on the reworked Arena: "No strategy behind it, took all
// my agency away", and Brecken22 agreeing. Two people is a signal and not a mandate, and the honest way to
// find out which it is, is to ask everybody rather than to guess from the two who spoke up. Luke: "Maybe we
// can make a poll survey model to see if people want it to be active, asynchronous, or both."
//
// THE QUESTIONS LIVE HERE, IN CODE. Only answers go in the database (migration 389), so a new poll is an edit
// to this file and nothing else — no migration, no admin form, no half-built CMS for a thing that gets used
// once a month.
//
// Keys are STABLE. Renaming a poll id, a question id or a choice id orphans every answer already recorded
// against the old one, exactly as it would in the survey.

export const POLLS = [
    {
        id: "combat_2026_08",
        title: "Active or passive?",
        // The intro names the argument rather than describing the poll, because the argument is the reason it
        // exists and members recognise their own words in it.
        intro: "There is a real argument going on in here about how hands-on the Den should be. "
            + "These answers decide what gets built next, so they are worth a minute.",
        open: true,
        questions: [
            // ── SoullessShiitake's thesis, which is the sharpest thing anybody has said about the game:
            // "Feels like any active strategy is slowly being removed from all minigames and replaced with
            // passives where you just press [a button]." Kaishiern argued the other side in the same hour —
            // "The strategy is what passives you put your points into and what gear adds to your power" — so
            // this is a genuine split and not a complaint with one obvious answer.
            {
                id: "direction",
                text: "The Den has been getting less hands-on. How do you feel about that?",
                choices: [
                    { id: "more_active", label: "I want more to DO", blurb: "Minigames with timing and skill, even if that means being present to get the most out of a day." },
                    { id: "passive_fine", label: "Passive suits me", blurb: "I check in around work and life. I would rather set things up than play them out." },
                    { id: "choose", label: "Both, and I accept the cost", blurb: "Build every activity twice. That is half as many NEW things, because the time goes into second versions of what exists." },
                    { id: "depends", label: "Depends on the activity", blurb: "Pick a few to make into real games and leave the rest as buttons." },
                ],
            },
            // ── The fishing reel. SoullessShiitake: "I miss having to press and hold to keep the fish in game
            // while fishing — that was hands down my favourite minigame." ValkyrieSylve, immediately: "I can't
            // lie, same." Two people is a signal; this is how we find out whether it is more.
            // ── REWRITTEN, BECAUSE THE FIRST VERSION WAS A FREE LUNCH ───────────────────────────────────
            // It offered "Both — hold the line for a bigger fish, or tap to take an ordinary one", which costs
            // nothing and pays more, so all three of the first respondents took it and the answer told us
            // nothing. Luke: "the fishing question kind of baits people because you have one option that
            // basically makes good fish deterministic."
            //
            // Every option carries its price now, including the optional one: playing the reel can go WRONG,
            // which is what makes it a game rather than a toll booth with a prize at the end. New question id,
            // so the three answers to the old wording stay recorded and are never mixed in with these.
            {
                id: "fishing_v2",
                text: "Fishing used to be press-and-hold to land the fish. Now it is a tap. What should it be?",
                choices: [
                    { id: "bring_back", label: "The reel, for everyone", blurb: "Skill decides the size — and you can fumble it and land a small one." },
                    { id: "keep_tap", label: "The tap, for everyone", blurb: "Size is luck. Fast, fair, and nothing to practise." },
                    { id: "optional_risk", label: "Optional, with a risk", blurb: "Play the reel for a shot at a bigger fish, but a bad reel lands you less than the tap would." },
                    { id: "optional_safe", label: "Optional, no risk", blurb: "Play it for a bigger fish, skip it for an average one. Nothing to lose either way." },
                ],
            },
            // ── ValkyrieSylve on the arena: "No strategy behind it, took all my agency away." Brecken22 the
            // same afternoon: "the new battle format no good."
            {
                id: "skills",
                text: "Should your class have SKILLS in an arena fight?",
                choices: [
                    { id: "async", label: "Yes, automatic", blurb: "Choose them before the fight and they fire on their own. Nobody has to be online." },
                    { id: "active", label: "Yes, hands-on", blurb: "Tap to use them during the fight. More control, but you have to be there." },
                    { id: "both", label: "Yes, either way", blurb: "Fights resolve on their own, but you can drop in and play one out." },
                    { id: "none", label: "No", blurb: "Leave it. Gear and the tree are enough." },
                ],
            },
            // "An even split" was the third option and took every vote, which is what a fence always does. The
            // question is only useful if it forces the trade it is actually asking about: when a well-geared
            // player meets a well-built one, WHO WINS. There is no even answer to that.
            {
                id: "decides_v2",
                text: "A player with better gear meets a player with a smarter build. Who should win?",
                choices: [
                    { id: "gear", label: "The gear", blurb: "Loot and the Forge are the long game. Hours put in should show." },
                    { id: "choices", label: "The build", blurb: "Anybody can grind. Reading the fight and spending points well should beat that." },
                    { id: "close", label: "Whoever plays it better on the day", blurb: "Neither should be enough on its own — leave room for the fight itself to decide." },
                ],
            },
            // ── ValkyrieSylve: "New stat system is too convoluted, sometimes, especially in gaming, simple is
            // better." Set against GrayKitsune, who cannot tell whether his crit is doing anything, and
            // Kaishiern, who found his stats page disagreeing with his own arithmetic. Those are three
            // different problems — too many stats, unexplained stats, wrong stats — and the fix for each is
            // the opposite of the fix for the others, so the choices separate them.
            {
                id: "stats",
                text: "There are a lot of combat stats now. Where does that sit with you?",
                choices: [
                    { id: "too_many", label: "Too many — cut them", blurb: "Simple is better. I want fewer numbers that matter more." },
                    { id: "explain", label: "Right number, badly explained", blurb: "Keep them, but tell me what each one actually does to a fight." },
                    { id: "fine", label: "About right", blurb: "I like having a lot to weigh up." },
                    { id: "more", label: "I want more", blurb: "Give me deeper builds, not shallower ones." },
                ],
            },
        ],
        note: "Anything else about how the Den plays? This is the part that gets read closest.",
    },
];

const NOTE_MAX = 400;

export const openPoll = () => POLLS.find((p) => p.open) || null;
export const pollById = (id) => POLLS.find((p) => p.id === String(id || "")) || null;

/**
 * Has this member answered every question in the open poll? Drives whether the modal ever renders.
 *
 * Returns TRUE on a database error, on purpose and for the same reason the survey does: a poll that pops up
 * because a query failed is worse than one that quietly does not.
 */
export async function hasAnswered(buyerId, poll = openPoll()) {
    if (!buyerId || !poll) return true;
    const rows = await db.query(
        `SELECT question_id FROM mkt_poll_response WHERE buyer_id = $1 AND poll_id = $2`,
        [buyerId, poll.id]
    ).catch(() => null);
    if (rows === null) return true;
    const done = new Set(rows.map((r) => r.question_id));
    return poll.questions.every((q) => done.has(q.id));
}

/** The poll as the client needs it — no server-only anything, so it can be sent down whole. */
export function pollForClient(poll = openPoll()) {
    if (!poll) return null;
    return {
        id: poll.id, title: poll.title, intro: poll.intro, note: poll.note || null,
        questions: poll.questions.map((q) => ({
            id: q.id, text: q.text,
            choices: q.choices.map((c) => ({ id: c.id, label: c.label, blurb: c.blurb || null })),
        })),
    };
}

/**
 * Record answers. Unknown question or choice ids are DROPPED rather than rejected — a stale client must never
 * cost somebody their whole response, which is the rule the survey already follows.
 */
export async function savePollAnswers(buyerId, pollId, answers = {}, note = null) {
    if (!buyerId) return { ok: false, error: "signed_out" };
    const poll = pollById(pollId);
    if (!poll) return { ok: false, error: "unknown_poll" };

    const text = typeof note === "string" ? note.trim().slice(0, NOTE_MAX) : null;
    let wrote = 0;
    for (const q of poll.questions) {
        const choice = answers?.[q.id];
        if (!choice || !q.choices.some((c) => c.id === choice)) continue;
        // The note rides on the FIRST answered question rather than getting a row of its own — it belongs to
        // the poll, not to a question, and a synthetic question id for it would show up in every tally.
        const withNote = wrote === 0 ? text : null;
        // eslint-disable-next-line no-await-in-loop
        await db.query(
            `INSERT INTO mkt_poll_response (buyer_id, poll_id, question_id, choice, note)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (buyer_id, poll_id, question_id)
             DO UPDATE SET choice = EXCLUDED.choice, note = COALESCE(EXCLUDED.note, mkt_poll_response.note), updated_at = NOW()`,
            [buyerId, poll.id, q.id, choice, withNote]
        ).catch(() => {});
        wrote += 1;
    }
    if (!wrote) return { ok: false, error: "empty" };
    await trackActivity(buyerId, "poll_answer", { pollId, answered: wrote }).catch(() => {});
    return { ok: true, answered: wrote };
}

/**
 * The read-out. Tallies per question AND every note in full, because a tally tells you the shape of the room
 * and cannot tell you why — the survey learned that already and this is the same lesson, not a new one.
 */
export async function pollResults(pollId) {
    const poll = pollById(pollId) || openPoll();
    if (!poll) return null;
    const [rows, notes, people] = await Promise.all([
        db.query(`SELECT question_id, choice, COUNT(*)::int AS n FROM mkt_poll_response
                   WHERE poll_id = $1 GROUP BY question_id, choice`, [poll.id]).catch(() => []),
        db.query(`SELECT COALESCE(b.display_name, b.alias, 'A wolf') AS name, p.note, p.updated_at
                    FROM mkt_poll_response p JOIN mkt_buyer b ON b.id = p.buyer_id
                   WHERE p.poll_id = $1 AND p.note IS NOT NULL AND p.note <> ''
                   ORDER BY p.updated_at DESC LIMIT 200`, [poll.id]).catch(() => []),
        db.queryOne(`SELECT COUNT(DISTINCT buyer_id)::int AS n FROM mkt_poll_response WHERE poll_id = $1`, [poll.id]).catch(() => null),
    ]);
    const byQ = {};
    for (const r of rows) (byQ[r.question_id] ||= {})[r.choice] = r.n;
    return {
        id: poll.id,
        title: poll.title,
        answered: people?.n || 0,
        questions: poll.questions.map((q) => {
            const counts = byQ[q.id] || {};
            const total = Object.values(counts).reduce((a, b) => a + b, 0);
            return {
                id: q.id, text: q.text, total,
                choices: q.choices.map((c) => ({
                    id: c.id, label: c.label, n: counts[c.id] || 0,
                    pct: total ? Math.round((counts[c.id] || 0) * 100 / total) : 0,
                })),
            };
        }),
        notes: notes.map((n) => ({ name: n.name, note: n.note })),
    };
}
