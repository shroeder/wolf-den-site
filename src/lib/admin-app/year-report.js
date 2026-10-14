import "server-only";

import { listOverhead, perDayCents } from "@/lib/admin-app/breakeven.js";
import { listEntries } from "@/lib/ledger/ledger.js";
import { readReportSeries } from "@/lib/admin-app/report-bundle-store.js";

// ── THE YEAR, ON ONE SCREEN ───────────────────────────────────────────────────────────────────────────────
// Three questions that each already have an answer somewhere, and no screen that puts them side by side:
// what did the shop earn, what did it cost to stay open, and how much of it is still Luke's own money.
//
// Every number here comes from a source that already owns it. Nothing is recomputed:
//   • profit            — the nightly report bundle (Square sale lines, realized COGS, fees, consignor cuts)
//   • cost to stay open — the overhead lines Luke authors on Break-Even, plus real payroll debits
//   • money in and out  — the ledger
//
// ⚠️ THE ONE THING THAT CANNOT BE DOUBLE-COUNTED. Merchandise profit is ALREADY net of cost of goods, card
// fees and consignor payouts. So the cost side here is operating cost only — overhead and wages. Subtracting
// ledger inventory spend or consignor payouts on top would charge the shop twice for the same money and turn
// a profitable year into a fictional loss. Those live in "spend" below, which is a CASH-OUT view and is
// deliberately not wired into the break-even maths.
const ZONE = "America/Chicago";

const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
/** The Chicago calendar date of an instant, as YYYY-MM-DD. The zone is NAMED, never inherited — on Vercel
 *  the default is UTC, and a January 1st boundary left to it files New Year's Eve under the wrong year. */
const dayKey = (ms) => dayKeyFmt.format(new Date(ms));
const monthKeyOf = (key) => key.slice(0, 7);

function daysBetween(aKey, bKey) {
    return Math.round((Date.parse(`${bKey}T00:00:00Z`) - Date.parse(`${aKey}T00:00:00Z`)) / 864e5);
}

// ── CLASSIFIERS ───────────────────────────────────────────────────────────────────────────────────────────
// 146 of the ledger's expense rows arrived from the bank with no category and sit in "Other" — Southern Hobby
// invoices, blank-description checks, Venmo payouts. Two of those groups ARE identifiable from the text the
// bank sent, and both matter enough to pull out by hand:
const text = (e) => `${e.description || ""} ${e.notes || ""}`.toLowerCase();
/** Square payroll debits. The real wage bill, and the only wages figure that is a measurement rather than an
 *  estimate off the time clock. */
const isPayroll = (e) => e.type === "Expense" && text(e).includes("payroll");
/** Money paid through to a consignor — already netted out of merchandise profit, so it must never be a cost
 *  on the break-even side. */
const isConsignorPayout = (e) => e.type === "Expense" && text(e).includes("consign");

// Everything left after those two, bucketed by the category the ledger carries. "Uncategorized" is a real
// row on the report, not a rounding bucket: naming it is the only way the pile ever gets smaller.
const SPEND_CATEGORIES = new Set([
    "Rent", "Software", "Marketing", "Supplies", "Fixtures", "Taxes",
    "Shipping", "Travel", "Utilities", "Startup - Legal", "Startup - Domain",
]);
function spendBucket(e) {
    if (e.type === "Inventory") return "Inventory & stock";
    if (isConsignorPayout(e)) return "Consignor payouts";
    if (isPayroll(e)) return "Wages";
    if (SPEND_CATEGORIES.has(e.category)) return e.category;
    if (text(e).includes("insurance")) return "Insurance";
    return "Uncategorized";
}

/**
 * The year on one screen. `year` defaults to the current Chicago year.
 *
 * Amounts are DOLLARS, matching the ledger's own representation (the app's EntryEntity.amount is a Double).
 * Overhead is the only thing held in cents, because that is how it is stored and rounding it per-day and
 * then multiplying is what the Today page does — same arithmetic, same answer.
 */
export async function yearReport({ year } = {}) {
    const todayKey = dayKey(Date.now());
    const theYear = Number(year) || Number(todayKey.slice(0, 4));
    const yearStart = `${theYear}-01-01`;
    const yearEnd = `${theYear}-12-31`;
    // A past year reports its whole span; the current year stops today rather than pretending to December.
    const windowEnd = todayKey < yearEnd ? todayKey : yearEnd;

    const [entries, overheadItems, series] = await Promise.all([
        listEntries({ limit: 100000 }),
        listOverhead(),
        readReportSeries().catch(() => null),
    ]);

    const inYear = entries.filter((e) => {
        const k = dayKey(e.date);
        return k >= yearStart && k <= yearEnd;
    });

    // ── PROFIT ────────────────────────────────────────────────────────────────────────────────────────────
    // Straight off the nightly bundle. `builtAt` travels with it so the screen can say how fresh it is
    // instead of implying a live read — the job runs once a night, after fifo-reconcile.
    const monthsInYear = (buckets) => (buckets || []).filter((b) => dayKey(b.startMillis).startsWith(String(theYear)));
    const salesBuckets = monthsInYear(series?.monthly);
    const profitBuckets = monthsInYear(series?.profitMonthly);
    const profitByMonth = new Map(profitBuckets.map((b) => [monthKeyOf(dayKey(b.startMillis)), b.value]));
    const salesByMonth = new Map(salesBuckets.map((b) => [monthKeyOf(dayKey(b.startMillis)), b.value]));

    const netSales = salesBuckets.reduce((a, b) => a + b.value, 0);
    const merchProfit = profitBuckets.reduce((a, b) => a + b.value, 0);

    // Trading starts at the first sale of the year, not January 1st. Charging the shop rent for the months
    // before it opened would be a loss it never had.
    const dailyBuckets = (series?.profitDaily || []).filter((b) => dayKey(b.startMillis).startsWith(String(theYear)));
    const firstSaleKey = dailyBuckets.length ? dayKey(dailyBuckets[0].startMillis) : null;
    const tradingFrom = firstSaleKey && firstSaleKey > yearStart ? firstSaleKey : yearStart;
    const tradingDays = firstSaleKey ? daysBetween(tradingFrom, windowEnd) + 1 : 0;

    // ── COST TO STAY OPEN ─────────────────────────────────────────────────────────────────────────────────
    // ⚠️ THIS IS TODAY'S RATE APPLIED BACKWARDS, and the screen has to say so. `wolfden_overhead` holds what
    // the shop's fixed costs ARE, with no history of what they were — so a line added last week (the $283
    // advertising, the $200 Claude) is charged to May as well. It answers "at today's cost structure, is the
    // shop ahead?", which is the question worth asking, but it is NOT what the bank saw in May.
    const activeOverhead = overheadItems.filter((i) => i.active);
    const dailyOverheadCents = Math.round(activeOverhead.reduce((s, i) => s + perDayCents(i), 0));
    const overheadTotal = (dailyOverheadCents / 100) * tradingDays;

    const wagesTotal = -inYear.filter(isPayroll).reduce((a, e) => a + e.amount, 0);
    const netPosition = merchProfit - overheadTotal - wagesTotal;

    // ── THE MONTHLY WALK ──────────────────────────────────────────────────────────────────────────────────
    // The cumulative column is the point of the whole screen: the month the shop stopped losing money.
    const wagesByMonth = new Map();
    for (const e of inYear.filter(isPayroll)) {
        const k = monthKeyOf(dayKey(e.date));
        wagesByMonth.set(k, (wagesByMonth.get(k) || 0) - e.amount);
    }
    const monthKeys = [...new Set([...salesByMonth.keys(), ...profitByMonth.keys(), ...wagesByMonth.keys()])].sort();
    let cumulative = 0;
    let crossedMonth = null;
    const months = monthKeys.map((k) => {
        // Only the days of this month that the shop was actually open get charged overhead.
        const monthStart = `${k}-01`;
        const [y, m] = k.split("-").map(Number);
        const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
        const lastOfMonth = dayKey(Date.parse(`${nextMonth}T00:00:00Z`) - 864e5 + 43200000);
        const lo = monthStart > tradingFrom ? monthStart : tradingFrom;
        const hi = lastOfMonth < windowEnd ? lastOfMonth : windowEnd;
        const openDays = hi >= lo ? daysBetween(lo, hi) + 1 : 0;

        const profit = profitByMonth.get(k) || 0;
        const overhead = (dailyOverheadCents / 100) * openDays;
        const wages = wagesByMonth.get(k) || 0;
        const net = profit - overhead - wages;
        cumulative += net;
        if (crossedMonth == null && cumulative >= 0) crossedMonth = k;
        return {
            month: k,
            netSales: salesByMonth.get(k) || 0,
            profit,
            openDays,
            overhead,
            wages,
            net,
            cumulative,
        };
    });

    // ── CASH OUT ──────────────────────────────────────────────────────────────────────────────────────────
    // What actually left, by bucket. A different basis from break-even on purpose: this one includes the
    // $53k of stock on the shelves, which is money gone but not a cost until it sells.
    const spendMap = new Map();
    for (const e of inYear) {
        if (e.type !== "Expense" && e.type !== "Inventory") continue;
        const b = spendBucket(e);
        const cur = spendMap.get(b) || { bucket: b, rows: 0, amount: 0 };
        cur.rows += 1;
        cur.amount += -e.amount;
        spendMap.set(b, cur);
    }
    const spend = [...spendMap.values()].sort((a, b) => b.amount - a.amount);
    const spendTotal = spend.reduce((a, s) => a + s.amount, 0);
    const uncategorized = spend.find((s) => s.bucket === "Uncategorized") || { rows: 0, amount: 0 };

    // ── LUKE'S OWN MONEY ──────────────────────────────────────────────────────────────────────────────────
    const sumType = (...types) => inYear.filter((e) => types.includes(e.type)).reduce((a, e) => a + e.amount, 0);
    const contributions = sumType("OwnerContribution");
    const drawsOut = -sumType("OwnerDraw", "Reimbursement");
    const deposits = sumType("Income");

    return {
        year: theYear,
        range: { from: yearStart, to: windowEnd, tradingFrom: firstSaleKey ? tradingFrom : null, tradingDays },
        profit: {
            netSales,
            merchProfit,
            marginPercent: netSales !== 0 ? (merchProfit / netSales) * 100 : 0,
            source: series ? "report-bundle" : "unavailable",
            builtAt: series?.builtAt || null,
        },
        costToStayOpen: {
            dailyOverheadCents,
            overheadTotal,
            overheadBasis: "current-rate-applied-to-trading-days",
            overheadLines: activeOverhead.map((i) => ({
                label: i.label,
                amountCents: i.amount_cents,
                cadence: i.cadence,
                perDayCents: Math.round(perDayCents(i)),
            })),
            wagesTotal,
            wagesSource: "ledger-square-payroll",
            total: overheadTotal + wagesTotal,
        },
        breakEven: {
            netPosition,
            isAbove: netPosition >= 0,
            crossedMonth,
            perDayNeeded: dailyOverheadCents / 100,
        },
        months,
        spend: { buckets: spend, total: spendTotal, uncategorizedRows: uncategorized.rows, uncategorizedAmount: uncategorized.amount },
        personalInvestment: { contributions, drawsOut, net: contributions - drawsOut },
        deposits,
        entryCount: inYear.length,
    };
}
