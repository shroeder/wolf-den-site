// Canonical Wolf Den store hours (Central Time, America/Chicago). Single source of truth so the Town — and
// anything else — can reflect whether the shop is physically OPEN right now. Hours per the current schedule:
// Thu & Fri 3–9 PM · Sat 10 AM–9 PM · Sun 10 AM–5 PM (closed Mon–Wed).
const TZ = "America/Chicago";

// [openMinute, closeMinute] minutes-since-midnight, keyed by weekday (0=Sun … 6=Sat). Missing = closed.
const HOURS = {
    0: [600, 1020],   // Sun 10:00 AM – 5:00 PM
    4: [900, 1260],   // Thu 3:00 PM – 9:00 PM
    5: [900, 1260],   // Fri 3:00 PM – 9:00 PM
    6: [600, 1260],   // Sat 10:00 AM – 9:00 PM
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
