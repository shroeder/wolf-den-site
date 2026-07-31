import "server-only";

import { db } from "@/lib/db";
import { sendAdminPush } from "@/lib/push/send.js";

// ── OWNER REMINDERS ──────────────────────────────────────────────────────────────────────────────────────────
// Recurring nudges for the things that cost real money when they're missed: sales tax, rent, payroll. None of
// them belong to a feature that could have prompted for them, so they live here.
//
// Everything is STORE-LOCAL (America/Chicago). A shop owner's "the 7th at 2pm" means the 7th at 2pm where the
// shop is, not UTC, and getting that wrong would fire rent on the 24th for half the year.
const TZ = "America/Chicago";
const LOCAL_DATE = `(NOW() AT TIME ZONE '${TZ}')::date`;
const LOCAL_HOUR = `EXTRACT(HOUR FROM (NOW() AT TIME ZONE '${TZ}'))::int`;
const LOCAL_DOM = `EXTRACT(DAY FROM (NOW() AT TIME ZONE '${TZ}'))::int`;
const LOCAL_DOW = `EXTRACT(DOW FROM (NOW() AT TIME ZONE '${TZ}'))::int`;
// Days in the CURRENT local month — so a reminder set for the 31st still fires on the 28th of February rather
// than silently never firing for four months of the year.
const LOCAL_MONTH_DAYS = `EXTRACT(DAY FROM (date_trunc('month', (NOW() AT TIME ZONE '${TZ}')) + interval '1 month - 1 day'))::int`;

export async function listReminders() {
    const rows = await db.query(
        `SELECT id, title, body, kind, day_of_month, day_of_week, at_hour, active, last_fired_on
           FROM admin_reminder ORDER BY active DESC, kind, COALESCE(day_of_month, day_of_week), at_hour`
    ).catch(() => []);
    return rows.map((r) => ({
        id: Number(r.id),
        title: r.title,
        body: r.body || "",
        kind: r.kind,
        dayOfMonth: r.day_of_month == null ? null : Number(r.day_of_month),
        dayOfWeek: r.day_of_week == null ? null : Number(r.day_of_week),
        atHour: Number(r.at_hour),
        active: r.active === true,
        lastFiredOn: r.last_fired_on ? String(r.last_fired_on).slice(0, 10) : null,
        when: describeSchedule(r),
    }));
}

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ordinal = (n) => {
    const v = Number(n);
    const s = ["th", "st", "nd", "rd"][((v % 100) - 20) % 10] || ["th", "st", "nd", "rd"][v % 100] || "th";
    return `${v}${s}`;
};
const hour12 = (h) => `${((Number(h) + 11) % 12) + 1}${Number(h) < 12 ? "am" : "pm"}`;
function describeSchedule(r) {
    const at = hour12(r.at_hour);
    if (r.kind === "weekly") return `Every ${DOW[Number(r.day_of_week) || 0]} at ${at}`;
    return `The ${ordinal(r.day_of_month)} of each month at ${at}`;
}

export async function upsertReminder(input = {}) {
    const kind = input.kind === "weekly" ? "weekly" : "monthly";
    const title = String(input.title || "").trim().slice(0, 120);
    if (!title) return { ok: false, error: "title_required" };
    const atHour = Math.max(0, Math.min(23, Math.round(Number(input.atHour ?? 14))));
    const dom = kind === "monthly" ? Math.max(1, Math.min(31, Math.round(Number(input.dayOfMonth ?? 1)))) : null;
    const dow = kind === "weekly" ? Math.max(0, Math.min(6, Math.round(Number(input.dayOfWeek ?? 1)))) : null;
    const body = String(input.body || "").trim().slice(0, 400) || null;
    const active = input.active !== false;

    if (input.id) {
        await db.query(
            `UPDATE admin_reminder SET title=$2, body=$3, kind=$4, day_of_month=$5, day_of_week=$6, at_hour=$7,
                                       active=$8, updated_at=NOW()
              WHERE id=$1`,
            [input.id, title, body, kind, dom, dow, atHour, active]
        ).catch(() => {});
        return { ok: true, id: Number(input.id) };
    }
    const row = await db.queryOne(
        `INSERT INTO admin_reminder (title, body, kind, day_of_month, day_of_week, at_hour, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [title, body, kind, dom, dow, atHour, active]
    ).catch(() => null);
    return { ok: Boolean(row), id: row ? Number(row.id) : null };
}

export async function deleteReminder(id) {
    if (!id) return { ok: false };
    await db.query(`DELETE FROM admin_reminder WHERE id = $1`, [id]).catch(() => {});
    return { ok: true };
}

/**
 * Fire anything due. Called by the cron every half hour.
 *
 * `last_fired_on` is claimed in the SAME conditional UPDATE that selects the row, so two overlapping cron runs
 * can't both push the same reminder — the second one matches nothing. Same shape as the daily-cap guards
 * elsewhere, and for the same reason: the cost of a double-send here is the owner distrusting the whole system.
 */
export async function runReminders({ dryRun = false } = {}) {
    const due = await db.query(
        `SELECT id, title, body FROM admin_reminder
          WHERE active
            AND ${LOCAL_HOUR} >= at_hour
            AND (last_fired_on IS NULL OR last_fired_on < ${LOCAL_DATE})
            AND (
                 (kind = 'weekly'  AND day_of_week = ${LOCAL_DOW})
              OR (kind = 'monthly' AND LEAST(day_of_month, ${LOCAL_MONTH_DAYS}) = ${LOCAL_DOM})
            )`
    ).catch(() => []);
    if (!due.length) return { fired: 0 };

    let fired = 0;
    for (const r of due) {
        if (dryRun) { fired += 1; continue; }
        const claimed = await db.queryOne(
            `UPDATE admin_reminder SET last_fired_on = ${LOCAL_DATE}, updated_at = NOW()
              WHERE id = $1 AND (last_fired_on IS NULL OR last_fired_on < ${LOCAL_DATE})
              RETURNING id`, [r.id]
        ).catch(() => null);
        if (!claimed) continue; // another run got there first
        await sendAdminPush({
            title: `⏰ ${r.title}`,
            body: r.body || "Tap to open reminders.",
            route: "reminders",
            data: { type: "reminder", id: String(r.id) },
        }).catch(() => {});
        fired += 1;
    }
    return { fired };
}
