// ── WHAT DAY IT IS IN MONTGOMERY ─────────────────────────────────────────────────────────────────────────────
// Every "today" in this game is the SHOP's today, not the server's. Vercel runs in UTC, so a day computed from
// the process clock flips at 7pm Central in summer and 6pm in winter — a daily deal, a daily quest or today's
// bingo pattern would all change while the shop was still open, and change again in the morning. Twice a year
// the whole thing walks an hour. America/Chicago handles its own DST; we never do offset arithmetic.
//
// Split out of daily-deals.js, which had the only correct copy of this. It is a rule about the shop rather
// than a rule about deals, and the second feature that needs it should not have to know where the first one
// happened to put it — see the tz bug this repo already carries a scar from, where a JS Date built off a
// Postgres DATE read as yesterday for every member from 7pm onward.
export const STORE_TZ = "America/Chicago";

/**
 * The shop's calendar day as `YYYY-MM-DD`, plus how long until it flips.
 *
 * `resetInSecs` is for client countdowns; `resetAt` is the same instant as an ISO string, for anything that
 * would rather compare timestamps than count down.
 */
export function storeDay(now = new Date()) {
    const dayKey = new Intl.DateTimeFormat("en-CA", {
        timeZone: STORE_TZ, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(now);
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: STORE_TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(now);
    const g = (t) => Number(parts.find((p) => p.type === t)?.value || 0);
    const h = g("hour") % 24;
    const resetInSecs = (23 - h) * 3600 + (59 - g("minute")) * 60 + (60 - g("second"));
    return { dayKey, resetInSecs, resetAt: new Date(now.getTime() + resetInSecs * 1000).toISOString() };
}

/**
 * Sunday 0 … Saturday 6, for a day key this module produced.
 *
 * Parsed at NOON UTC on purpose. `new Date("2026-08-26")` is midnight UTC, which is the previous evening in
 * every American timezone — so reading a weekday off it is off by one for half the world and correct for the
 * other half, which is the worst kind of bug to own. Noon is twelve hours clear of both boundaries.
 */
export const weekdayOf = (dayKey) => new Date(`${dayKey}T12:00:00Z`).getUTCDay();
