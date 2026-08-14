import "server-only";

import { sendAdminPush } from "@/lib/push/send.js";
import { getSetting, setSetting } from "@/lib/settings.js";

// ── RECURRING STORE-EVENT REMINDERS ──────────────────────────────────────────────────────────────────────────
// Weekly wall-clock nudges to whoever is working: "it is time to start the thing on the calendar."
//
// Deliberately separate from timeclock-reminders.js, which has ONE RULE — only ever message about a real clock
// DISCREPANCY, never about a schedule. This is the opposite kind of message (a schedule, nothing is wrong), so
// it lives in its own module rather than eroding that rule.
//
// ⚠️ WHY THE TIME IS GATED IN CODE AND NOT IN THE CRON EXPRESSION.
// Vercel crons run in UTC. "0 21 * * 5" is 4pm Central in summer and 3pm Central in winter — the reminder would
// silently walk an hour twice a year, and the failure is invisible until somebody notices Magic started late in
// November. So this runs on the every-30-minutes employee job and decides for itself against the SHOP's clock.
// America/Chicago handles its own DST; we never do offset arithmetic.

const SETTING_STATE = "store_event_reminder_state";
const SETTING_ON = "store_event_reminders"; // "off" silences every one of these without a deploy

// A missed run must not fire the reminder hours late. If the job doesn't manage a pass inside this window after
// the start time — a deploy, an outage, a cron hiccup — the reminder is simply skipped for the day, because
// "start Magic now" arriving at 7pm is worse than nothing.
const GRACE_MIN = 45;

// Sun 0 … Sat 6, in Central. Times are the shop's wall clock.
export const STORE_EVENTS = [
    {
        id: "magic_friday",
        day: 5,
        hour: 16,
        minute: 0,
        title: "🪄 Time to start Magic",
        body: "The Friday Magic event kicks off at 4:00 — get it going.",
        channels: ["employee"],
    },
];

async function loadState() {
    const raw = await getSetting(SETTING_STATE, null);
    if (!raw) return {};
    try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return {}; }
}
const saveState = (s) => setSetting(SETTING_STATE, JSON.stringify(s)).catch(() => {});

// The shop's day, so "once today" means the shop's today and not UTC's.
const centralDay = (d) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

const DAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
// Weekday + wall-clock time as the shop sees them.
export function centralNow(d = new Date()) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Chicago", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(d).reduce((m, p) => ({ ...m, [p.type]: p.value }), {});
    // hour12:false yields "24" for midnight in some ICU builds — fold it back to 0 or every midnight run breaks.
    const hour = Number(parts.hour) % 24;
    const minute = Number(parts.minute);
    return { day: DAY_INDEX[parts.weekday], hour, minute, mins: hour * 60 + minute };
}

const hhmm = (h, m) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

/**
 * Fire any store-event reminder that is due right now. Safe to call as often as the cron likes: each event
 * sends once per Central day, guarded by a settings row rather than by the cron's timing.
 *
 * `now` is injectable so the behaviour can be tested at an arbitrary moment without waiting for Friday.
 */
export async function runEventReminders({ dryRun = false, now = new Date() } = {}) {
    const today = centralDay(now);
    const cn = centralNow(now);
    const out = { day: today, dryRun, central: hhmm(cn.hour, cn.minute), weekday: cn.day, sent: [], due: [], skipped: null };

    if (String(await getSetting(SETTING_ON, "on").catch(() => "on")) === "off") {
        out.skipped = "disabled";
        return out;
    }

    const state = await loadState();
    const sentToday = state[today] || {};

    for (const ev of STORE_EVENTS) {
        if (ev.day !== cn.day) continue;
        const at = ev.hour * 60 + ev.minute;
        if (cn.mins < at || cn.mins >= at + GRACE_MIN) continue; // not yet, or too late to be useful
        out.due.push(ev.id);
        if (sentToday[ev.id]) continue; // already went out today
        out.sent.push(ev.id);
        if (!dryRun) {
            await sendAdminPush({
                title: ev.title,
                body: ev.body,
                data: { type: "store_event", event: ev.id },
                channels: ev.channels || ["employee"],
            }).catch(() => {});
        }
        sentToday[ev.id] = Date.now();
    }

    state[today] = sentToday;
    // Keep the row small — a few days is plenty of history for a once-a-day guard.
    for (const k of Object.keys(state)) if (k < today && Object.keys(state).length > 3) delete state[k];
    if (!dryRun && out.sent.length) await saveState(state);
    return out;
}
