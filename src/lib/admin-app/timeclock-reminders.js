import "server-only";

import { CLOCK_IN_LEAD_MIN, CLOCK_OUT_LEAD_MIN, ESCALATE_AFTER_MIN, NAG_EVERY_MIN, clockStatus, shiftWindow } from "@/lib/admin-app/timeclock.js";
import { sendAdminPush } from "@/lib/push/send.js";
import { getSetting, setSetting } from "@/lib/settings.js";

// ── CLOCK REMINDERS ──────────────────────────────────────────────────────────────────────────────────────────
// Nudges the employee BEFORE each end of their shift, never after — a reminder that lands once you're already
// late is just a telling-off. Then it keeps at it while a shift is left open, because an unclosed shift silently
// wrecks the labour cost in the break-even tracker.
//
//   before opening   + not clocked in  → "your shift starts in 15 minutes"
//   before closing   + clocked in      → "wrap up and clock out"
//   past closing     + still in        → repeat every 30 min
//   an hour past     + still in        → also tell the owner
//
// Every push deep-links to route "timeclock", which opens straight onto the clock screen.
// State is a single settings row so the cron can run as often as it likes without repeating itself.

const SETTING_STATE = "timeclock_reminder_state";

async function loadState() {
    const raw = await getSetting(SETTING_STATE, null);
    if (!raw) return {};
    try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return {}; }
}
const saveState = (s) => setSetting(SETTING_STATE, JSON.stringify(s)).catch(() => {});

// Central date, so "once per shift day" means the shop's day and not UTC's.
const centralDay = (d = new Date()) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export async function runTimeclockReminders({ dryRun = false } = {}) {
    const today = centralDay();
    const win = shiftWindow();
    const status = await clockStatus().catch(() => null);
    const out = { day: today, dryRun, store: win, clockedIn: status?.clockedIn ?? null, sent: [], skipped: null };

    if (!status?.ok) { out.skipped = status?.error || "no_status"; return out; }

    const state = await loadState();
    const day = state[today] || {};
    const nowMs = Date.now();
    const push = async (key, title, body, channels = ["employee"]) => {
        out.sent.push(key);
        if (dryRun) return;
        await sendAdminPush({ title, body, route: "timeclock", data: { type: "timeclock", key }, channels }).catch(() => {});
    };

    // ── CLOCK IN: fire in the window BEFORE opening, once per day, only if they're not already in.
    if (!win.open && !status.clockedIn && win.untilOpen != null && win.untilOpen > 0 && win.untilOpen <= CLOCK_IN_LEAD_MIN) {
        if (!day.inNudge) {
            await push("clock_in", "🕒 Shift starting soon", `The Den opens in ${win.untilOpen} min. Tap to clock in when you get there.`);
            day.inNudge = nowMs;
        }
    }

    // Safety net: open, well past opening, and still not clocked in. The "before" nudge may have been missed
    // (phone off, arrived late) and a whole shift going unrecorded is worse than one extra ping.
    if (win.open && !status.clockedIn && !day.inLate && status.minutesToday === 0 && (win.untilClose == null || win.untilClose > 15)) {
        await push("clock_in_late", "🕒 Not clocked in", "The shop's open and you're not on the clock yet — tap to clock in.");
        day.inLate = nowMs;
    }

    // ── CLOCK OUT: before closing, once, only while actually clocked in.
    if (win.open && status.clockedIn && win.untilClose != null && win.untilClose > 0 && win.untilClose <= CLOCK_OUT_LEAD_MIN) {
        if (!day.outNudge) {
            await push("clock_out", "🕒 Time to wrap up", `Closing in ${win.untilClose} min — tap to clock out when you're done.`);
            day.outNudge = nowMs;
        }
    }

    // ── STILL OPEN AFTER CLOSE: keep nudging, then escalate to the owner.
    // `!win.preOpen` is load-bearing. "Closed" covers BOTH before opening and after closing, and this branch
    // used to fire on either — so clocking in five minutes before a 3 PM Thursday open produced "you're still
    // on the clock after closing", a nag every 30 minutes, and a report to the owner an hour later, all for
    // turning up early to set up. Arriving before open is the correct behaviour; it must never be scolded.
    if (!win.open && !win.preOpen && status.clockedIn) {
        const since = Number(day.lastNag || 0);
        if (!since || nowMs - since >= NAG_EVERY_MIN * 60000) {
            await push("clock_out_nag", "⏰ Still clocked in", "You're still on the clock after closing — tap to clock out so your hours are right.");
            day.lastNag = nowMs;
            day.nags = (day.nags || 0) + 1;
        }
        // How long past close? The first nag is our clock: escalate once it's been an hour.
        const firstNag = Number(day.firstNag || (day.firstNag = nowMs));
        if (!day.escalated && nowMs - firstNag >= ESCALATE_AFTER_MIN * 60000) {
            await push("clock_out_escalate", "⏰ Shift left open", "The employee is still clocked in well after closing. Their labour hours will be wrong until it's closed.", ["full"]);
            day.escalated = nowMs;
        }
    } else if (day.firstNag && !status.clockedIn) {
        // Closed out — stop tracking so a later shift the same day starts clean.
        delete day.firstNag; delete day.lastNag; delete day.escalated;
    }

    state[today] = day;
    // Keep only the last few days so the settings row can't grow forever.
    for (const k of Object.keys(state)) if (k < today && Object.keys(state).length > 3) delete state[k];
    if (!dryRun) await saveState(state);
    out.state = day;
    return out;
}
