import "server-only";

import { listOverhead, perDayCents } from "@/lib/admin-app/breakeven.js";
import { listEntries } from "@/lib/ledger/ledger.js";
import { readReportSeries } from "@/lib/admin-app/report-bundle-store.js";
import { reconcileSpend } from "@/lib/admin-app/ledger-classify.js";

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

// Classification lives in ledger-classify.js, not here. It is shared with anything else that has to
// read this ledger, and keeping one copy is the only way two screens cannot reach two answers.

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

    // ── COST TO STAY OPEN — ACTUAL, FROM THE LEDGER ───────────────────────────────────────────────────────
    // Was today's overhead rate multiplied by trading days, which is a forecast wearing a report's
    // clothes: it charged May for an advertising line bought in October and it could not see April at
    // all. It now charges what the ledger says actually left, classified by `ledger-classify.js` so the
    // bank feed files itself and nobody is asked to categorise 132 rows by hand.
    //
    // `operatingCost` deliberately EXCLUDES stock purchases, consignor payouts, card fees, remitted
    // sales tax and cash moved to the drawer — each is either already inside merchandise profit or was
    // never the shop's cost. That exclusion is the difference between a real number and a double count.
    const recon = reconcileSpend(inYear);

    // The run rate is kept, demoted to what it actually is: a forward-looking daily target, the same
    // figure the Today page reads. It is no longer what break-even is measured against.
    const activeOverhead = overheadItems.filter((i) => i.active);
    const dailyOverheadCents = Math.round(activeOverhead.reduce((s2, i) => s2 + perDayCents(i), 0));

    const netPosition = merchProfit - recon.operatingCost;

    // ── THE MONTHLY WALK ──────────────────────────────────────────────────────────────────────────────────
    // The cumulative column is the point of the whole screen: the month the shop stopped losing money.
    // Costs are bucketed from the SAME classified rows as the headline, so the two can never disagree.
    const costByMonth = new Map();
    for (const r of recon.rows) {
        if (!r.cost) continue;
        const k = monthKeyOf(dayKey(r.date));
        costByMonth.set(k, (costByMonth.get(k) || 0) + r.amount);
    }
    // April has spend and no sales, so it needs a row of its own — the old walk started at the first
    // sale and silently dropped every pre-opening dollar.
    const monthKeys = [...new Set([...salesByMonth.keys(), ...profitByMonth.keys(), ...costByMonth.keys()])].sort();
    let cumulative = 0;
    let crossedMonth = null;
    const months = monthKeys.map((k) => {
        const profit = profitByMonth.get(k) || 0;
        const cost = costByMonth.get(k) || 0;
        const net = profit - cost;
        cumulative += net;
        if (crossedMonth == null && cumulative >= 0) crossedMonth = k;
        return { month: k, netSales: salesByMonth.get(k) || 0, profit, cost, net, cumulative };
    });

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
            operatingCost: recon.operatingCost,
            basis: "actual-ledger-spend",
            // What was deliberately not charged, and why — so the number can be audited rather than
            // believed. Each carries the rule's own reason string.
            excluded: recon.buckets.filter((b) => !b.cost)
                .map((b) => ({ bucket: b.bucket, amount: b.amount, rows: b.rows, why: b.why })),
            // The forward-looking daily target (the Today page's figure). NOT what break-even uses.
            runRatePerDayCents: dailyOverheadCents,
            runRateLines: activeOverhead.map((i) => ({
                label: i.label,
                amountCents: i.amount_cents,
                cadence: i.cadence,
                perDayCents: Math.round(perDayCents(i)),
            })),
        },
        breakEven: {
            netPosition,
            isAbove: netPosition >= 0,
            crossedMonth,
            runRatePerDay: dailyOverheadCents / 100,
        },
        // ⚠️ THE REPORT'S OWN ERROR BAR. Plaid sends no merchant for a transfer or a written cheque, so
        // these rows cannot be classified by code and are NOT charged. Stating the total is the
        // difference between an honest figure and a falsely precise one.
        unidentified: recon.unidentified,
        mirrored: recon.mirrored,
        spend: {
            buckets: recon.buckets,
            total: recon.buckets.reduce((a, b) => a + b.amount, 0),
            countedRows: recon.countedRows,
        },
        months,
        personalInvestment: { contributions, drawsOut, net: contributions - drawsOut },
        deposits,
        entryCount: inYear.length,
    };
}
