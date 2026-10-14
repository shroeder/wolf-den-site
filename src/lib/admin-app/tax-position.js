import "server-only";

import { db } from "@/lib/db";
import { yearReport } from "@/lib/admin-app/year-report.js";
import { readReportSeries } from "@/lib/admin-app/report-bundle-store.js";

// ── THE BUSINESS'S POSITION ────────────────────────────────────────────────────────────────────────────────
// Luke: "I dont really want to see anything related to myself and my 170k salary... The whole premise is to
// show the business metrics."
//
// He is right and the first version of this was wrong. A personal income-tax projection needs a W-2, a
// filing status and a marginal bracket, none of which are facts about the shop — and putting them on a
// business screen makes the shop's own numbers harder to read, not easier. All of that is gone.
//
// What is left is the business, measured against the goal Luke set: keep the net position under zero by
// year end. The screen tracks the distance to that line and what each trading pace does to it.
//
// ⚠️ TWO THINGS THIS SCREEN DELIBERATELY DOES NOT CLAIM.
//   1. "Under zero" is not the same as "no tax". A return applies different rules for depreciation and
//      inventory than this does, so the two figures will not agree and this one is not a tax result.
//   2. A loss is not a win. Giving up a dollar of profit to avoid roughly a third of a dollar of tax
//      leaves the shop worse off, so `goal` reports the distance WITHOUT implying which side is better.
//      The screen states the cost of getting under the line next to the line itself.

// The goal Luke set: keep the year's net position at or below zero. Held here so the screen and any
// future caller read the same line rather than each hard-coding their own.
const GOAL_NET_POSITION = 0;

const ZONE = "America/Chicago";
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const dayKey = (ms) => dayKeyFmt.format(new Date(ms));

/**
 * Ending inventory valued at what was PAID for it, from the FIFO purchase batches.
 *
 * ⚠️ THIS IS THE NUMBER THREE OTHER FIGURES KEEP GETTING MISTAKEN FOR, and all three were confused for each
 * other in one afternoon:
 *   • retail value        — quantity x SELL price (~$32k). What the Invested screen shows. Right answer to
 *                           "what is my shelf worth", wrong one for a tax return.
 *   • purchases less COGS — stock bought minus stock sold. Looks reasonable and is WRONG: it assumes every
 *                           item on the shelf arrived as a cash purchase in the ledger, and TRADE-INS DON'T.
 *                           It reported $10,057 against a true figure 2.5x higher.
 *   • FIFO remaining      — what this returns. The unsold batches at their own purchase price.
 *
 * See [[unit-cost-is-exact-fifo-never-averaged]]: the cost is the exact batch price, never an average.
 */
export async function endingInventoryAtCost() {
    const [batches, sold] = await Promise.all([
        db.query(
            `SELECT variation_id, occurred_on, quantity, paid_each
               FROM cogs_ledger WHERE quantity > 0
              ORDER BY variation_id, occurred_on ASC, created_at ASC`
        ).catch(() => []),
        db.query(
            `SELECT variation_id, COALESCE(SUM(units), 0) AS sold FROM cogs_fifo_cost GROUP BY variation_id`
        ).catch(() => []),
    ]);

    const soldBy = new Map(sold.map((r) => [String(r.variation_id), Number(r.sold) || 0]));
    const byVariation = new Map();
    for (const b of batches) {
        const k = String(b.variation_id);
        if (!byVariation.has(k)) byVariation.set(k, []);
        byVariation.get(k).push({ units: Number(b.quantity), paid: Number(b.paid_each), on: String(b.occurred_on).slice(0, 10) });
    }

    let boughtUnits = 0, boughtCost = 0, soldUnits = 0, soldCost = 0, units = 0, cost = 0;
    const positions = [];
    for (const [variationId, bs] of byVariation) {
        let skip = soldBy.get(variationId) || 0;
        for (const b of bs) {
            boughtUnits += b.units;
            boughtCost += b.units * b.paid;
            // FIFO: the oldest batches are the ones that sold, so what remains is the newest.
            const eaten = Math.min(skip, b.units);
            skip -= eaten;
            soldUnits += eaten;
            soldCost += eaten * b.paid;
            const rest = b.units - eaten;
            if (rest > 0) {
                units += rest;
                cost += rest * b.paid;
                positions.push({ variationId, units: rest, paidEach: b.paid, value: rest * b.paid, boughtOn: b.on });
            }
        }
    }

    return {
        cost, units,
        variations: byVariation.size,
        bought: { units: boughtUnits, cost: boughtCost },
        soldFromBatches: { units: soldUnits, cost: soldCost },
        // Biggest unsold positions — the concrete answer to "what is my money tied up in".
        positions: positions.sort((a, b) => b.value - a.value).slice(0, 10),
    };
}

/** Trading days (days the shop actually rang a sale) per calendar day, measured rather than assumed. */
function tradingRate(dailyBuckets, sinceKey) {
    const recent = dailyBuckets.filter((b) => dayKey(b.startMillis) >= sinceKey);
    if (!recent.length) return { perTradingDay: 0, tradingDays: 0, profit: 0 };
    const profit = recent.reduce((a, b) => a + b.value, 0);
    return { perTradingDay: profit / recent.length, tradingDays: recent.length, profit };
}

export async function businessPosition({ year } = {}) {
    const [report, inventory, series] = await Promise.all([
        yearReport({ year }),
        endingInventoryAtCost(),
        readReportSeries().catch(() => null),
    ]);

    const theYear = report.year;
    const todayKey = dayKey(Date.now());
    const yearEnd = `${theYear}-12-31`;
    const daysLeft = Math.max(0, Math.round((Date.parse(`${yearEnd}T00:00:00Z`) - Date.parse(`${todayKey}T00:00:00Z`)) / 864e5));

    // How many of those remaining days the shop will actually trade, measured from how often it has traded
    // rather than assumed. A shop that opens six days a week should not be projected on seven.
    const daily = (series?.profitDaily || []).filter((b) => dayKey(b.startMillis).startsWith(String(theYear)));
    const lastKey = daily.length ? dayKey(daily[daily.length - 1].startMillis) : todayKey;
    const spanStart = report.range.tradingFrom || `${theYear}-01-01`;
    const spanDays = Math.max(1, Math.round((Date.parse(`${lastKey}T00:00:00Z`) - Date.parse(`${spanStart}T00:00:00Z`)) / 864e5) + 1);
    const openRate = daily.length / spanDays;
    const tradingDaysLeft = Math.round(daysLeft * openRate);

    const recent = tradingRate(daily, dayKey(Date.now() - 29 * 864e5));
    const prevMonthKey = `${theYear}-${String(Number(todayKey.slice(5, 7)) - 1).padStart(2, "0")}`;
    const prevMonth = report.months.find((m) => m.month === prevMonthKey);
    const prevDaily = daily.filter((b) => dayKey(b.startMillis).startsWith(prevMonthKey));
    const thisDaily = daily.filter((b) => dayKey(b.startMillis).startsWith(todayKey.slice(0, 7)));

    // The cost of staying open for the rest of the year, at the run rate the Today page already uses.
    const forwardCost = (report.costToStayOpen.runRatePerDayCents / 100) * daysLeft;
    const current = report.breakEven.netPosition;

    const scenarios = [
        {
            key: "lastMonth",
            label: prevMonth ? "Last full month's pace" : "Conservative",
            perTradingDay: prevDaily.length ? prevMonth.profit / prevDaily.length : recent.perTradingDay,
        },
        { key: "recent", label: "Last 30 days", perTradingDay: recent.perTradingDay },
        {
            key: "current",
            label: "This month's pace",
            perTradingDay: thisDaily.length ? thisDaily.reduce((a, b) => a + b.value, 0) / thisDaily.length : recent.perTradingDay,
        },
    ].map((sc) => {
        const addedProfit = sc.perTradingDay * tradingDaysLeft;
        const projected = current + addedProfit - forwardCost;
        return {
            ...sc,
            addedProfit,
            projectedPosition: projected,
            // Distance to the line, and which side of it this pace lands on.
            vsGoal: projected - GOAL_NET_POSITION,
            underGoal: projected <= GOAL_NET_POSITION,
        };
    }).sort((a, b) => a.projectedPosition - b.projectedPosition);

    const likely = scenarios[1] || scenarios[0];

    return {
        year: theYear,
        asOf: todayKey,

        // ── THE GOAL ──────────────────────────────────────────────────────────────────────────────────────
        // Luke's line is zero. The screen reports the distance to it and, deliberately, the COST of getting
        // there — because a loss is not a win, and a goal reported without its price invites the shop to
        // chase it. Giving up a dollar of profit avoids roughly a third of a dollar of tax; the other two
        // thirds are simply gone.
        goal: {
            target: GOAL_NET_POSITION,
            current,
            isUnder: current <= GOAL_NET_POSITION,
            distance: current - GOAL_NET_POSITION,
            projected: likely.projectedPosition,
            projectedIsUnder: likely.underGoal,
            // What it would cost to force the likely case under the line.
            profitToGiveUp: Math.max(0, likely.projectedPosition - GOAL_NET_POSITION),
            // ⚠️ The lever a shop owner reaches for first does NOT work, and the screen has to say so:
            // stock is an asset, so buying it moves cash without moving the position at all.
            stockDoesNotReducePosition: true,
        },

        yearToDate: {
            netSales: report.profit.netSales,
            // Named honestly: sales minus gross profit is cost of goods AND card fees.
            costAndFees: report.profit.netSales - report.profit.merchProfit,
            grossProfit: report.profit.merchProfit,
            marginPercent: report.profit.marginPercent,
            operatingCost: report.costToStayOpen.operatingCost,
            netPosition: current,
            unclassified: report.unidentified,
        },

        projection: { daysLeft, tradingDaysLeft, forwardCost, scenarios, likelyKey: likely.key },

        // Money tied up in stock. A business metric in its own right — it is the shop's largest asset and
        // the cash it is not holding — and the reason the position cannot be steered by buying more.
        inventory,

        // The taxes the BUSINESS itself pays or holds, as distinct from anything on a personal return.
        obligations: {
            salesTaxRemitted: (report.spend.buckets.find((b) => b.bucket === "Sales tax remitted") || {}).amount || 0,
            wages: (report.spend.buckets.find((b) => b.bucket === "Wages") || {}).amount || 0,
            payrollTax: (report.spend.buckets.find((b) => b.bucket === "Payroll tax") || {}).amount || 0,
            workersComp: (report.spend.buckets.find((b) => b.bucket === "Workers comp") || {}).amount || 0,
            capitalEquipment: (report.spend.buckets.find((b) => b.bucket === "Fixtures") || {}).amount || 0,
            ownerContributions: report.personalInvestment.contributions,
            ownerDraws: report.personalInvestment.drawsOut,
        },

        note: "This is the business's own position. It is NOT a tax result — a return applies different "
            + "rules for depreciation and inventory, so the two figures will not agree.",
    };
}

// Kept so the route name and any existing caller still resolve while the screen is renamed.
export const taxPosition = businessPosition;
