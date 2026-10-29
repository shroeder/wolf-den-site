// ── A REMINDER WINDOW MUST BE WIDER THAN THE INTERVAL YOU SAMPLE IT AT ──────────────────────────────────────
// Both the clock-in nudge and the pull-queue reminder were dead from the day they shipped, and nothing said
// so: the switch read "on", the wording was right, no error was ever logged. The window was 15 minutes wide,
// the cron runs at :00 and :30, and every Wolf Den opening is on the hour — so `untilOpen` at a tick was
// always a multiple of 30 and the test `0 < untilOpen <= 15` could never be true.
//
// That is invisible to every other kind of check. It compiles, it deploys, the dry run even prints a
// beautifully worded message when you force it. The only thing that catches it is walking the actual clock
// past the actual cron cadence, which is what this does.
//
//   node scripts/test-clock-in-window.mjs
import { register } from "node:module";

register("./lib/app-loader.mjs", import.meta.url);

const { shiftWindow, inClockInWindow, REMINDER_JOB_PERIOD_MIN } = await import("@/lib/admin-app/timeclock.js");

// The cron in vercel.json: "0,30 * * * *".
const TICK_MINUTES = [0, 30];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// A week of Central time starting on a Sunday. 2026-11-01 is a Sunday.
const WEEK_START = "2026-11-01";

// Which days the shop actually opens, from HOURS in store-hours.js: Sun, Thu, Fri, Sat.
const OPEN_DAYS = new Set(["Sun", "Thu", "Fri", "Sat"]);

let failures = 0;
const summary = [];

for (let d = 0; d < 7; d++) {
    const hits = [];
    let everPreOpen = false;

    for (let h = 0; h < 24; h++) {
        for (const m of TICK_MINUTES) {
            // Central is UTC-5 (CST) on these November dates.
            const at = new Date(Date.parse(`${WEEK_START}T00:00:00-05:00`) + ((d * 24 + h) * 60 + m) * 60000);
            const win = shiftWindow(at);
            if (win.untilOpen != null && win.untilOpen > 0) everPreOpen = true;
            if (inClockInWindow(win)) {
                hits.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} (untilOpen=${win.untilOpen})`);
            }
        }
    }

    const label = DAYS[(new Date(Date.parse(`${WEEK_START}T12:00:00-05:00`) + d * 86400000)).getUTCDay()];
    summary.push({ label, hits, everPreOpen });
}

for (const row of summary) {
    const open = OPEN_DAYS.has(row.label);
    const ok = open ? row.hits.length === 1 : row.hits.length === 0;
    if (!ok) failures++;
    const what = row.hits.length ? row.hits.join(", ") : "—";
    console.log(`${ok ? "ok  " : "FAIL"} ${row.label} ${open ? "(open)  " : "(closed)"} fires: ${what}`);
}

console.log(`\nwindow is ${REMINDER_JOB_PERIOD_MIN} min of cron + the clock-in lead`);
console.log(failures ? `${failures} FAILURES` : "every open day gets exactly one reminder tick");
process.exit(failures ? 1 : 0);
