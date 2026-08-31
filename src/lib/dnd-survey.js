// ── THE SIX QUESTIONS, DEFINED ONCE ──────────────────────────────────────────────────────────────────────────
// The form renders from this list, the API validates against this list, and the results page labels rows from
// this list. Kept free of `server-only` and of any db import on purpose: the client component imports it, and
// the moment the options are typed out a second time in JSX the stored slugs and the shown labels start to
// drift.
//
// `multi` marks the two questions where more than one answer is the useful answer — somebody free Tuesday and
// Thursday is worth more to a scheduler than somebody forced to pick one.

export const DND_QUESTIONS = [
    {
        id: "experience",
        prompt: "Have you ever played before?",
        multi: false,
        options: [
            { value: "never", label: "Never played", hint: "Total beginner — that's fine" },
            { value: "some", label: "A little", hint: "A few sessions here and there" },
            { value: "lots", label: "Lots", hint: "I know my way around a character sheet" },
        ],
    },
    {
        id: "format",
        prompt: "Full campaign or a one shot?",
        multi: false,
        options: [
            { value: "campaign", label: "Full campaign", hint: "An ongoing story over many sessions" },
            { value: "oneshot", label: "One shot", hint: "A single self-contained adventure" },
            { value: "either", label: "Either works", hint: "Happy with whatever the group wants" },
        ],
    },
    {
        id: "days",
        prompt: "What day works best for you?",
        note: "Pick every day that could work.",
        multi: true,
        options: [
            { value: "mon", label: "Monday" },
            { value: "tue", label: "Tuesday" },
            { value: "wed", label: "Wednesday" },
            { value: "thu", label: "Thursday" },
            { value: "fri", label: "Friday" },
            { value: "sat", label: "Saturday" },
            { value: "sun", label: "Sunday" },
        ],
    },
    {
        id: "times",
        prompt: "What time works best for you?",
        note: "Pick every window that could work.",
        multi: true,
        options: [
            { value: "morning", label: "Morning", hint: "Before noon" },
            { value: "afternoon", label: "Afternoon", hint: "Noon to 5pm" },
            { value: "evening", label: "Evening", hint: "5pm to 9pm" },
            { value: "late", label: "Late night", hint: "9pm and after" },
        ],
    },
    {
        id: "frequency",
        prompt: "How often would you want to play?",
        multi: false,
        options: [
            { value: "weekly", label: "Every week" },
            { value: "biweekly", label: "Every other week" },
            { value: "monthly", label: "Once a month" },
        ],
    },
    {
        id: "sessionLength",
        prompt: "How long would you want each session to last?",
        multi: false,
        options: [
            { value: "2h", label: "About 2 hours" },
            { value: "3h", label: "About 3 hours" },
            { value: "4h", label: "About 4 hours" },
            { value: "5plus", label: "5 hours or more" },
        ],
    },
];

export const MAX_TEXT_LEN = 400;

const byId = new Map(DND_QUESTIONS.map((q) => [q.id, q]));

/** The label a slug was stored for — used by the results page so it never restates the option text. */
export function labelFor(questionId, value) {
    const option = byId.get(questionId)?.options.find((o) => o.value === value);
    return option ? option.label : String(value || "");
}

export function questionById(questionId) {
    return byId.get(questionId) || null;
}

/**
 * Validate a submitted answer set. Returns { ok: true, answers } with only known slugs kept, or
 * { ok: false, error } naming the first question that is unanswered. Shared by the client (to decide
 * whether the submit button can fire) and the API (which cannot trust the client anyway).
 */
export function validateAnswers(input) {
    const answers = {};

    for (const question of DND_QUESTIONS) {
        const allowed = new Set(question.options.map((o) => o.value));
        const raw = input?.[question.id];

        if (question.multi) {
            const picked = Array.isArray(raw) ? raw.filter((v) => allowed.has(v)) : [];
            if (picked.length === 0) {
                return { ok: false, error: `Please answer: ${question.prompt}` };
            }
            // Keep declaration order rather than click order, so every stored row reads the same way.
            answers[question.id] = question.options.filter((o) => picked.includes(o.value)).map((o) => o.value);
        } else {
            if (!allowed.has(raw)) {
                return { ok: false, error: `Please answer: ${question.prompt}` };
            }
            answers[question.id] = raw;
        }
    }

    return { ok: true, answers };
}
