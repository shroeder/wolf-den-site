import "server-only";

import { db } from "@/lib/db";

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
                    { id: "more_active", label: "I want more to DO", blurb: "Minigames with timing and skill. Playing well should beat playing often." },
                    { id: "passive_fine", label: "Passive suits me", blurb: "I check in around work and life. I would rather set things up than play them out." },
                    { id: "choose", label: "Let me choose", blurb: "Offer both — play it out for a better result, or skip it and take the ordinary one." },
                    { id: "depends", label: "Depends on the activity", blurb: "Some things should be a game, some should be a button." },
                ],
            },
            // ── The fishing reel. SoullessShiitake: "I miss having to press and hold to keep the fish in game
            // while fishing — that was hands down my favourite minigame." ValkyrieSylve, immediately: "I can't
            // lie, same." Two people is a signal; this is how we find out whether it is more.
            {
                id: "fishing",
                text: "Fishing used to be press-and-hold to keep the fish on the line. Now it is a tap.",
                choices: [
                    { id: "bring_back", label: "Bring the reel back", blurb: "That was the best minigame in the Den." },
                    { id: "keep_tap", label: "Keep it a tap", blurb: "Twelve casts a day is enough to do without a fight each time." },
                    { id: "both", label: "Both", blurb: "Hold the line for a bigger fish, or tap to take an ordinary one." },
                    { id: "no_opinion", label: "No strong feeling", blurb: "I fish for what it pays, not how it plays." },
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
            {
                id: "decides",
                text: "What should decide who wins a fight?",
                choices: [
                    { id: "gear", label: "Mostly your gear", blurb: "The hours in loot and the Forge are the point." },
                    { id: "choices", label: "Mostly your choices", blurb: "Class, tree and how you play should beat what you are wearing." },
                    { id: "even", label: "An even split", blurb: "Good gear beats bad, but a smart build beats a lazy one." },
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
