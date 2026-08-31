import "server-only";

import { db } from "@/lib/db";
import { DND_QUESTIONS, MAX_TEXT_LEN, validateAnswers } from "@/lib/dnd-survey";

// Reads and writes for the public D&D interest survey. The question set itself lives in dnd-survey.js so the
// form and this file cannot disagree about what a valid answer is.

const clean = (value) => {
    const text = String(value == null ? "" : value).trim();
    return text ? text.slice(0, MAX_TEXT_LEN) : null;
};

/**
 * Record one response.
 *
 * A REFUSED ANSWER AND A BROKEN DATABASE ARE NOT THE SAME FAILURE, and the route can only tell them apart if
 * this says which one it is. Tagging the validation throw with `code` is what stops a db outage being shown to
 * a visitor as a 400 with the raw driver message in it — which is exactly what happened the first time this
 * was tried against an environment with no DATABASE_URL set.
 */
export async function createDndResponse(payload) {
    const result = validateAnswers(payload);

    if (!result.ok) {
        const invalid = new Error(result.error);
        invalid.code = "invalid_answers";
        throw invalid;
    }

    const { answers } = result;

    const row = await db.queryOne(
        `INSERT INTO dnd_survey (name, contact, experience, format, days, times, frequency, session_length, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
            clean(payload?.name),
            clean(payload?.contact),
            answers.experience,
            answers.format,
            answers.days,
            answers.times,
            answers.frequency,
            answers.sessionLength,
            clean(payload?.notes),
        ]
    );

    return { id: row.id };
}

/**
 * Everything the owner needs to decide what to run: a tally per option for all six questions, plus the raw
 * responses newest first so a name and a note can be read alongside the counts.
 *
 * ONE QUERY. The tallies are counted here rather than by six GROUP BY round trips — the whole table is a few
 * hundred rows at most and every extra round trip on the HTTP driver is a TLS handshake billed as Active CPU.
 */
export async function getDndSurveyReport({ limit = 500 } = {}) {
    const rows = await db.query(
        `SELECT id, name, contact, experience, format, days, times, frequency, session_length, notes, created_at
           FROM dnd_survey
          ORDER BY created_at DESC
          LIMIT $1`,
        [Math.min(Math.max(Number(limit) || 500, 1), 1000)]
    );

    const columnFor = { sessionLength: "session_length" };
    const counts = {};

    for (const question of DND_QUESTIONS) {
        const column = columnFor[question.id] || question.id;
        const tally = Object.fromEntries(question.options.map((o) => [o.value, 0]));

        for (const row of rows) {
            const value = row[column];
            for (const picked of Array.isArray(value) ? value : [value]) {
                if (picked in tally) {
                    tally[picked] += 1;
                }
            }
        }

        counts[question.id] = tally;
    }

    return {
        total: rows.length,
        counts,
        responses: rows.map((row) => ({
            id: Number(row.id),
            name: row.name,
            contact: row.contact,
            experience: row.experience,
            format: row.format,
            days: row.days || [],
            times: row.times || [],
            frequency: row.frequency,
            sessionLength: row.session_length,
            notes: row.notes,
            createdAt: row.created_at,
        })),
    };
}
