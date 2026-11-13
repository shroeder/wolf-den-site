// ── THE SHOP'S CALENDAR DAY, MEASURED RATHER THAN ASSUMED ────────────────────────────────────────────────────
// Every money screen in the app buckets by the shop's local day, and the shop is in Montgomery, MN — Central,
// which is UTC-5 for part of the year and UTC-6 for the rest. That one fact has now cost two separate bugs,
// and this module exists so it can only ever be got right in one place.
//
// ── ⚠️ WHAT IT COST THE SECOND TIME, 2026-11-12 ─────────────────────────────────────────────────────────────
// Eric: "Yeah, it's bugged I think. I double checked." The Today screen read "$0 wages so far" while he was
// six hours into a shift, and the net number on the owner's phone was about $87 too generous.
//
// The cause was one hardcoded offset. `breakevenSummary` built its day range as
//
//     new Date(`${from}T00:00:00-05:00`)
//
// which IS midnight in Chicago — between March and November. On 2026-11-01 the clocks went back, so from
// that day it resolved to 23:00 the PREVIOUS evening, and every day row in the range came out keyed to
// yesterday. The hours were fetched correctly and bucketed correctly under 2026-11-12; the cost loop then
// looked them up under 2026-11-11 and found nothing. Labour silently became zero for eleven days, in a
// number whose whole job is to be the truth about the day.
//
// Nothing errored. The overhead beside it was right, because overhead is summed per row and never looked up
// by date — which is exactly why it read as a plausible screen rather than a broken one.
//
// ⚠️ SO: NEVER WRITE AN OFFSET. Ask the zone what it was doing at that moment. `startOfDayMillis` measures
// it from the zone itself and is correct on both sides of every transition, including the two days a year
// when an offset literal is wrong by definition.
//
// Lifted verbatim out of reports-v2.js, which had already worked this out and which now imports it back, so
// there is one implementation and not three. [[reuse-the-rule-never-restate-it]]
export const ZONE = "America/Chicago";

const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const partsFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE, weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "numeric", hour12: false,
});

/** The Chicago calendar date of an instant, as YYYY-MM-DD. */
export const dayKey = (ms) => dayKeyFmt.format(new Date(ms));

/** The Chicago hour (0-23) of an instant. Same rule, same reason: ask the zone, never add an offset. */
export const hourOf = (ms) => Number(partsFmt.formatToParts(new Date(ms)).find((p) => p.type === "hour").value) % 24;

/** Midnight Chicago on a YYYY-MM-DD, in epoch millis. */
export function startOfDayMillis(key) {
    // Chicago is UTC-5 or UTC-6 depending on the date, so the offset is measured rather than assumed.
    const noonUtc = Date.parse(`${key}T12:00:00Z`);
    const hourAtNoon = Number(partsFmt.formatToParts(new Date(noonUtc)).find((p) => p.type === "hour").value);
    const offsetHours = 12 - hourAtNoon;
    return Date.parse(`${key}T00:00:00Z`) + offsetHours * 3600000;
}

/**
 * The instant of a Chicago WALL-CLOCK time — "2026-11-01 at 14:30 in the shop", as epoch millis.
 *
 * ⚠️ NOT startOfDayMillis + hours. On the two transition days a Central day is 23 or 25 hours long, so
 * counting elapsed hours from midnight lands an hour away from the clock on the wall for part of one of
 * them. Anything simulating a schedule — a cron walk, a reminder window — has to use the wall clock,
 * because the schedule is written in wall-clock time.
 *
 * Guess, measure the offset the zone was actually using at that guess, correct, and measure once more in
 * case the correction stepped across the transition itself.
 */
export function zonedMillis(key, hour = 0, minute = 0) {
    const guess = Date.parse(`${key}T00:00:00Z`) + (hour * 60 + minute) * 60000;
    let ms = guess - offsetMinutesAt(guess) * 60000;
    const again = offsetMinutesAt(ms);
    if (again !== offsetMinutesAt(guess)) ms = guess - again * 60000;
    return ms;
}

/** The zone's offset from UTC at an instant, in minutes (negative west of Greenwich). */
function offsetMinutesAt(ms) {
    const p = Object.fromEntries(offsetFmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
    return (asUtc - ms) / 60000;
}
const offsetFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});

/** The last millisecond of a Chicago day — the exclusive end of a range, minus one. */
export const endOfDayMillis = (key) => startOfDayMillis(addDays(key, 1)) - 1;

/** The parts of a YYYY-MM-DD, with the weekday it falls on. */
export function dateParts(key) {
    const [y, m, d] = key.split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return { y, m, d, dow };
}

/**
 * N days after a YYYY-MM-DD, as a YYYY-MM-DD.
 *
 * ⚠️ VIA NOON UTC, which is the whole trick: stepping an INSTANT by 86,400,000ms walks off a calendar day
 * twice a year, because one day in Central is 23 hours long and another is 25. Noon is far enough from both
 * boundaries that the date never slips.
 */
export const addDays = (key, n) => {
    const { y, m, d } = dateParts(key);
    return dayKeyFmt.format(new Date(Date.UTC(y, m - 1, d + n, 12)));
};

/**
 * Every Chicago date from `from` to `to` inclusive, as YYYY-MM-DD.
 *
 * ⚠️ ITERATE KEYS, NOT INSTANTS. A loop that steps a Date by 864e5 and formats each step is the shape that
 * produced the bug above — it is doing calendar arithmetic in a unit that is not a calendar day. If what you
 * want is a list of dates, ask for dates.
 */
export function dayRange(from, to) {
    const out = [];
    if (!from || !to) return out;
    let k = from;
    // A bound rather than a while(true): a malformed pair must not spin for ever on a server.
    for (let i = 0; i < 4000 && k <= to; i += 1) { out.push(k); k = addDays(k, 1); }
    return out;
}
