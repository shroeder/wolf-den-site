import "server-only";

import { db } from "@/lib/db.js";
import { inClockInWindow, shiftWindow } from "@/lib/admin-app/timeclock.js";
import { sendAdminPush } from "@/lib/push/send.js";
import { getSetting, setSetting } from "@/lib/settings.js";

// ── THE PULL QUEUE, SAID OUT LOUD ONCE A DAY ─────────────────────────────────────────────────────────────────
// Luke: "can we make it so that it reminds both me and Eric on the different apps that we need to do that
// around clock-in time?"
//
// The queue has existed since virtual packs shipped and has never announced itself. Thirty tasks were open the
// day this was written, the oldest two days old, and the only way to find out was to remember to open a screen.
// Meanwhile a $3 store-credit top-up pushes a phone — sendAdminPush is wired into eighteen places and this,
// the one that is holding a member's paid-for card on a shelf, was not one of them.
//
// ⚠️ WHY THIS IS A THIRD MODULE AND NOT A BRANCH IN timeclock-reminders.js. That file has ONE RULE written at
// the top in capitals: only ever message about a real clock DISCREPANCY, never about a schedule. A queue
// reminder is not a discrepancy — nothing is wrong, there is simply work waiting — so putting it there would
// erode the rule that keeps that file honest. event-reminders.js made the same call for the same reason and
// says so. Three modules, one job, settled independently.
//
// ⚠️ AND IT RIDES THE EXISTING 30-MINUTE JOB RATHER THAN TAKING A CRON. Vercel crons are UTC, so "around
// clock-in" written as a cron expression walks an hour at each DST change and nobody notices until a reminder
// arrives at the wrong end of a morning. The job runs often and this module decides for itself against the
// SHOP's clock, which is the rule the other two already follow.

const SETTING_STATE = "pull_queue_reminder_state";
const SETTING_ON = "pull_queue_reminders";   // "off" silences it without a deploy, same as the store events

// Central date, so "once per day" means the shop's day rather than UTC's — the same helper the other two use,
// for the same reason: a UTC day boundary falls in the middle of a Central evening.
const centralDay = (d = new Date()) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** What is waiting, split the way the work is actually done. */
async function queueSummary() {
    const rows = await db.query(
        `SELECT kind,
                COUNT(*)::int AS n,
                MAX(EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400)::int AS oldest_days
           FROM mkt_pack_pull_task
          WHERE status = 'open'
          GROUP BY kind`,
    ).catch(() => []);
    const by = Object.fromEntries((rows || []).map((r) => [r.kind, { n: Number(r.n) || 0, days: Number(r.oldest_days) || 0 }]));
    const total = (rows || []).reduce((s, r) => s + (Number(r.n) || 0), 0);
    const oldest = (rows || []).reduce((m, r) => Math.max(m, Number(r.oldest_days) || 0), 0);
    return { by, total, oldest };
}

/**
 * Tell whoever is opening up that there is shelf work waiting.
 *
 * Fires in the same window as the clock-in nudge, once per Central day, and ONLY when something is actually
 * open — a daily "0 tasks" push is how a channel teaches people to swipe it away.
 */
// `force` ignores the clock-in window and the once-a-day guard so the wording can be read back at any hour.
// ⚠️ IT DOES NOT IGNORE dryRun. A force that could also SEND would be one typo away from pushing both phones
// at three in the morning, and the only reason to force is to look at the copy.
export async function runPullQueueReminder({ dryRun = false, force = false } = {}) {
    const today = centralDay();
    const out = { day: today, dryRun, sent: null, skipped: null, queue: null };

    if (String(await getSetting(SETTING_ON, "on")).toLowerCase() === "off") {
        out.skipped = "switched_off";
        return out;
    }

    // ⚠️ THE SAME WINDOW AS THE CLOCK-IN NUDGE, read from the same helper rather than a time written here.
    // "Around clock-in time" is a moving target — the shop's hours differ by day — and a second definition of
    // it would drift from the first the moment the hours changed.
    const win = shiftWindow();
    // ⚠️ inClockInWindow, NOT a test written here. The inline version of this was narrower than the cron
    // interval and so never once matched — see the note on REMINDER_JOB_PERIOD_MIN in timeclock.js.
    if (!force && !inClockInWindow(win)) {
        out.skipped = "not_clock_in_window";
        return out;
    }

    const raw = await getSetting(SETTING_STATE, null);
    let state = {};
    try { state = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : {}; } catch { state = {}; }
    if (!force && state.day === today) { out.skipped = "already_sent_today"; return out; }

    const q = await queueSummary();
    out.queue = q;
    if (!q.total) { out.skipped = "nothing_waiting"; return out; }

    // The two kinds are different jobs and the message says which, because "12 tasks" tells nobody whether to
    // bring the tub out or put cards back in the case.
    const pull = q.by.pull?.n || 0;
    const find = q.by.find?.n || 0;
    const reshelve = q.by.reshelve?.n || 0;
    const bits = [];
    // ⚠️ OWED CARDS FIRST AND NAMED AS OWED. A `pull` is a card a member has already paid for that is still
    // physically on the shelf — which is both the thing most worth doing and the thing that can be sold twice
    // if it is not. "3 to pull" reads like filing; "3 cards owed" reads like what it is.
    if (pull + find > 0) bits.push(`${pull + find} card${pull + find === 1 ? "" : "s"} owed to members`);
    if (reshelve > 0) bits.push(`${reshelve} to put back`);
    const body = `${bits.join(" · ")}${q.oldest >= 1 ? ` — oldest ${q.oldest} day${q.oldest === 1 ? "" : "s"}` : ""}. Tap to work the queue.`;

    out.sent = { title: "Vault queue", body, total: q.total };
    if (dryRun || force) return out;

    await sendAdminPush({
        title: "📦 Vault queue",
        body,
        // ⚠️ BOTH APPS. Luke asked for exactly this — "remind both me and Eric on the different apps" — and
        // the default here is ["full"], which is the owner alone. See [[push-defaults-to-owner-only]]: the
        // employee channel has to be named or the person who actually walks to the tub never hears about it.
        channels: ["full", "employee"],
        route: "packQueue",
        sound: { kind: "reminder" },
        data: { type: "pull_queue", total: String(q.total), oldestDays: String(q.oldest) },
    }).catch(() => {});

    await setSetting(SETTING_STATE, JSON.stringify({ day: today, at: new Date().toISOString(), total: q.total }))
        .catch(() => {});
    return out;
}
