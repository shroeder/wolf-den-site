// ── CANONICAL WOLF DEN STORE HOURS ───────────────────────────────────────────────────────────────────────────
// Central Time (America/Chicago). THE single source of truth for when the shop is physically open, and now
// also for every place the hours are PRINTED — see the note on the exports at the bottom.
//
// ⚠️ THIS NUMBER WAS COPIED, AND THE COPIES DISAGREED. Before this file owned the printed hours there were
// four independent statements of them: this map, a second STORE_HOURS in fishing.js (which gates the angling
// perks on the shop being open), the site footer and the About page. They gave THREE different answers for
// Sunday — 3 PM, 5 PM and 5 PM — so the footer and the fishing perks were running a different shop from the
// one the Town and the timeclock believed in. Everything derives from HOURS now; nothing restates it.
//
// Updated 2026-08-30: Wednesday added, Saturday opens an hour later, Sunday closes at 7.
// Corrected 2026-09-02: WEDNESDAY REMOVED AGAIN. It should never have gone in — the shop is shut Monday,
// Tuesday AND Wednesday. Luke, looking at the Town on a Wednesday afternoon: "the store isnt open today why
// does it say this". The clock and the code were both right; the table was wrong, and a wrong table is
// indistinguishable from a broken feature to everybody reading it.
const TZ = "America/Chicago";

// [openMinute, closeMinute] minutes-since-midnight, keyed by weekday (0=Sun … 6=Sat). Missing = closed.
const HOURS = {
    0: [660, 1140],   // Sun 11:00 AM – 7:00 PM
    // Mon, Tue, Wed — shut. Absent rather than zeroed: `HOURS[wd] || null` is the closed test everywhere.
    4: [900, 1260],   // Thu 3:00 PM – 9:00 PM
    5: [900, 1260],   // Fri 3:00 PM – 9:00 PM
    6: [660, 1260],   // Sat 11:00 AM – 9:00 PM
};
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const WD_NAME = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Current Central weekday + minutes-of-day, DST-safe (derived from the IANA zone, not a fixed offset).
function centralNow(now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
    const get = (t) => parts.find((p) => p.type === t)?.value;
    const wd = WD[get("weekday")] ?? 0;
    const hour = (parseInt(get("hour"), 10) || 0) % 24; // Intl can emit "24" at midnight
    const min = parseInt(get("minute"), 10) || 0;
    return { wd, minutes: hour * 60 + min };
}

function fmtTime(min) {
    let h = Math.floor(min / 60);
    const m = min % 60;
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return m ? `${h}:${String(m).padStart(2, "0")} ${ap}` : `${h} ${ap}`;
}

/**
 * Today's [open, close] in minutes-since-midnight, or null on a day the shop doesn't open.
 * Exported because "the shop is closed" is two very different situations — before opening and after closing —
 * and callers that treat them the same get things badly wrong (see the timeclock reminders).
 */
export function todayHours(now = new Date()) {
    const { wd } = centralNow(now);
    return HOURS[wd] || null;
}

/** True only in the run-up to TODAY's opening — not on a closed day, and never after close. */
export function beforeOpeningToday(now = new Date()) {
    const { wd, minutes } = centralNow(now);
    const h = HOURS[wd];
    return Boolean(h) && minutes < h[0];
}

// { open, closesLabel, nextOpenLabel, minutesSinceOpen, minutesUntilOpen }.
export function storeStatus(now = new Date()) {
    const { wd, minutes } = centralNow(now);
    const today = HOURS[wd];
    if (today && minutes >= today[0] && minutes < today[1]) {
        return { open: true, closesLabel: fmtTime(today[1]), nextOpenLabel: null, minutesSinceOpen: minutes - today[0], minutesUntilOpen: 0 };
    }
    // Find the next opening — later today, else scan forward up to a week.
    for (let d = 0; d < 8; d += 1) {
        const day = (wd + d) % 7;
        const h = HOURS[day];
        if (!h) continue;
        if (d === 0 && minutes >= h[0]) continue; // today's open already passed
        const dayLabel = d === 0 ? "today" : d === 1 ? "tomorrow" : WD_NAME[day];
        const untilMin = d * 1440 + h[0] - minutes;
        return { open: false, closesLabel: null, nextOpenLabel: `${dayLabel} ${fmtTime(h[0])}`, minutesSinceOpen: 0, minutesUntilOpen: untilMin };
    }
    return { open: false, closesLabel: null, nextOpenLabel: null, minutesSinceOpen: 0, minutesUntilOpen: 0 };
}

// ── THE HOURS, AS THEY ARE PRINTED ───────────────────────────────────────────────────────────────────────────
// Everything that SAYS the hours reads these rather than typing them: the footer, the About page and the
// LocalBusiness schema Google reads. That last one matters most — a schema that disagrees with the footer is
// how a shop ends up with the wrong hours on its Google listing, and nobody notices for months.
const DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Open days in week order starting Monday, because that is how a person reads a sign. */
const OPEN_DAYS = [1, 2, 3, 4, 5, 6, 0].filter((d) => HOURS[d]);

/** schema.org OpeningHoursSpecification — hand straight to the LocalBusiness JSON-LD. */
export const openingHoursSpecification = () => OPEN_DAYS.map((d) => ({
    "@type": "OpeningHoursSpecification",
    dayOfWeek: DAY_FULL[d],
    opens: hhmm(HOURS[d][0]),
    closes: hhmm(HOURS[d][1]),
}));

/**
 * One line per span of consecutive days that share the same hours — "Wed–Fri 3–9 PM", not five lines.
 * `short` picks Wed over Wednesday, which is what fits in a footer.
 */
export function hoursLines({ short = true } = {}) {
    const names = short ? DAY_SHORT : DAY_FULL;
    const out = [];
    for (const d of OPEN_DAYS) {
        const [o, c] = HOURS[d];
        const last = out[out.length - 1];
        // Consecutive in the Mon-first ordering AND identical hours, so Fri and Sat only merge if they match.
        const prev = OPEN_DAYS[OPEN_DAYS.indexOf(d) - 1];
        if (last && last.open === o && last.close === c && prev === last.lastDay) {
            last.lastDay = d;
        } else {
            out.push({ firstDay: d, lastDay: d, open: o, close: c });
        }
    }
    return out.map((r) => {
        const days = r.firstDay === r.lastDay ? names[r.firstDay] : `${names[r.firstDay]}–${names[r.lastDay]}`;
        // "3–9 PM" rather than "3 PM–9 PM" when both ends share a meridiem — that is how a sign is written,
        // and the repetition is the difference between a line that reads and a line that is parsed.
        const sameHalf = (r.open < 720) === (r.close < 720);
        const time = sameHalf
            ? `${fmtTime(r.open).replace(/ [AP]M$/, "")}–${fmtTime(r.close)}`
            : `${fmtTime(r.open)}–${fmtTime(r.close)}`;
        return { days, time, label: `${days} ${time}` };
    });
}

/** "Wed–Fri 3–9 PM · Sat 11 AM–9 PM · Sun 11 AM–7 PM" */
export const hoursSummary = (opts) => hoursLines(opts).map((l) => l.label).join(" · ");

/** "Closed Mon–Tue", or "" if the shop opens every day. */
export function closedSummary({ short = true } = {}) {
    const names = short ? DAY_SHORT : DAY_FULL;
    const shut = [1, 2, 3, 4, 5, 6, 0].filter((d) => !HOURS[d]);
    if (!shut.length) return "";
    if (shut.length === 1) return `Closed ${names[shut[0]]}`;
    return `Closed ${names[shut[0]]}–${names[shut[shut.length - 1]]}`;
}

/** Is the shop open right now? The one question fishing.js used to answer with its own copy of the table. */
export const shopIsOpenNow = (now = new Date()) => storeStatus(now).open;
