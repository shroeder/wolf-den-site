import "server-only";

import { db } from "@/lib/db";
import { yearReport } from "@/lib/admin-app/year-report.js";
import { readReportSeries } from "@/lib/admin-app/report-bundle-store.js";

// ── WHAT THE SHOP WILL OWE ─────────────────────────────────────────────────────────────────────────────────
// Luke: "my current goal is to create a screen that helps me understand my tax burden for the end of the year."
//
// The screen answers one question — how much to set aside — and shows the aggregates it got there from, so
// the figure can be argued with instead of believed.
//
// ⚠️ THE RATE IS NOT 25%, IT IS 36.5%, AND THE REASON IS THE DAY JOB. Business profit stacks on a $170k W-2,
// so it is taxed at the top marginal bracket from its first dollar; and because the day job has NOT used up
// the Social Security wage base, the profit still pays the FULL 15.3% self-employment tax rather than the
// 2.9% Medicare-only rate it would pay if the W-2 had already crossed the cap. Both effects push the same
// way, which is why a naive "set aside a quarter" would be badly short.
//
// Not tax advice, and the module says so to its caller: `disclaimer` travels with the numbers.

// ── The taxpayer's own situation ────────────────────────────────────────────────────────────────────────────
// Luke's figures, overridable per request so the screen can model a change without a deploy. Kept as named
// constants rather than a config table because they change about once a year, and a migration for two numbers
// is a worse trade than an obvious constant.
const DEFAULTS = {
    w2Income: 170000,        // the day job
    federalMarginal: 0.22,   // married filing jointly at that income; single would be 0.24
    stateRate: 0.068,        // Minnesota top marginal
    filing: "mfj",
};

// 2026 figures.
const SS_WAGE_BASE = 184500;     // Social Security wage cap — the W-2 eats into this first
const SE_BASE_FACTOR = 0.9235;   // net earnings from self-employment = profit x this
const SS_RATE = 0.124;
const MEDICARE_RATE = 0.029;
const QBI_RATE = 0.20;           // §199A, available in full well below the phase-out at this income

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

/**
 * Tax on a given amount of business profit. A LOSS returns a negative total: at $170k of other income a
 * business loss is not a nothing, it offsets the W-2 and is worth real money back.
 */
export function taxOn(profit, cfg = DEFAULTS) {
    if (profit <= 0) {
        const benefit = Math.abs(profit) * (cfg.federalMarginal + cfg.stateRate);
        return {
            profit, selfEmployment: 0, federal: -Math.abs(profit) * cfg.federalMarginal,
            state: -Math.abs(profit) * cfg.stateRate, total: -benefit, isRefund: true,
            effectiveRate: profit === 0 ? 0 : (benefit / Math.abs(profit)) * 100,
        };
    }
    const seBase = profit * SE_BASE_FACTOR;
    // The day job consumes the Social Security cap first; only what is left of it pays the 12.4%.
    const ssRoom = Math.max(0, SS_WAGE_BASE - cfg.w2Income);
    const selfEmployment = Math.min(seBase, ssRoom) * SS_RATE + seBase * MEDICARE_RATE;
    const qbi = profit * QBI_RATE;
    const federal = (profit - qbi - selfEmployment / 2) * cfg.federalMarginal;
    // Minnesota does not follow the federal QBI deduction, so it is not subtracted here.
    const state = (profit - selfEmployment / 2) * cfg.stateRate;
    const total = selfEmployment + federal + state;
    return {
        profit, selfEmployment, federal, state, total, isRefund: false,
        effectiveRate: (total / profit) * 100,
    };
}

/** Trading days (days the shop actually rang a sale) per calendar day, measured rather than assumed. */
function tradingRate(dailyBuckets, sinceKey) {
    const recent = dailyBuckets.filter((b) => dayKey(b.startMillis) >= sinceKey);
    if (!recent.length) return { perTradingDay: 0, tradingDays: 0, profit: 0 };
    const profit = recent.reduce((a, b) => a + b.value, 0);
    return { perTradingDay: profit / recent.length, tradingDays: recent.length, profit };
}

export async function taxPosition({ year, w2Income, federalMarginal, stateRate } = {}) {
    const cfg = {
        ...DEFAULTS,
        ...(Number.isFinite(w2Income) ? { w2Income } : {}),
        ...(Number.isFinite(federalMarginal) ? { federalMarginal } : {}),
        ...(Number.isFinite(stateRate) ? { stateRate } : {}),
    };

    const [report, inventory, series] = await Promise.all([
        yearReport({ year }),
        endingInventoryAtCost(),
        readReportSeries().catch(() => null),
    ]);

    const theYear = report.year;
    const todayKey = dayKey(Date.now());
    const yearEnd = `${theYear}-12-31`;
    const daysLeft = Math.max(0, Math.round((Date.parse(`${yearEnd}T00:00:00Z`) - Date.parse(`${todayKey}T00:00:00Z`)) / 864e5));

    // How many of those remaining days the shop will actually trade, from how often it has traded lately.
    const daily = (series?.profitDaily || []).filter((b) => dayKey(b.startMillis).startsWith(String(theYear)));
    const lastKey = daily.length ? dayKey(daily[daily.length - 1].startMillis) : todayKey;
    const open = daily.length / Math.max(1, Math.round((Date.parse(`${lastKey}T00:00:00Z`) - Date.parse(`${report.range.tradingFrom || `${theYear}-01-01`}T00:00:00Z`)) / 864e5) + 1);
    const tradingDaysLeft = Math.round(daysLeft * open);

    const ninetyAgo = dayKey(Date.now() - 29 * 864e5);
    const recent = tradingRate(daily, ninetyAgo);
    const month = (k) => report.months.find((m) => m.month === k);
    const prevMonthKey = `${theYear}-${String(Number(todayKey.slice(5, 7)) - 1).padStart(2, "0")}`;
    const prev = month(prevMonthKey);
    const prevDaily = daily.filter((b) => dayKey(b.startMillis).startsWith(prevMonthKey));
    const thisDaily = daily.filter((b) => dayKey(b.startMillis).startsWith(todayKey.slice(0, 7)));

    const forwardCost = (report.costToStayOpen.runRatePerDayCents / 100) * daysLeft;
    const scenarios = [
        {
            key: "conservative",
            label: prev ? "Last full month's pace" : "Conservative",
            perTradingDay: prevDaily.length ? prev.profit / prevDaily.length : recent.perTradingDay,
        },
        { key: "recent", label: "Last 30 days", perTradingDay: recent.perTradingDay },
        {
            key: "current",
            label: "This month's pace",
            perTradingDay: thisDaily.length ? thisDaily.reduce((a, b) => a + b.value, 0) / thisDaily.length : recent.perTradingDay,
        },
    ].map((s) => {
        const addedProfit = s.perTradingDay * tradingDaysLeft;
        const projected = report.breakEven.netPosition + addedProfit - forwardCost;
        return { ...s, addedProfit, projectedProfit: projected, tax: taxOn(projected, cfg) };
    }).sort((a, b) => a.projectedProfit - b.projectedProfit);

    const mid = scenarios[1] || scenarios[0];

    // ── THE ONE DECISION WORTH MAKING BEFORE 31 DECEMBER ───────────────────────────────────────────────────
    // Stock on the shelf has been paid for and has produced no deduction: it is an asset, not an expense,
    // and it only deducts in the year it sells. The small-business exemption can pull that forward.
    //
    // It is DEFERRAL, not free money — deducted now, the same stock sells next year with no cost to offset
    // it — and it is not a checkbox either: only the conform-to-your-books route gives deduction at
    // purchase. Both caveats travel with the numbers so a screen cannot show the upside alone.
    const capitalised = taxOn(mid.projectedProfit, cfg);
    const deducted = taxOn(mid.projectedProfit - inventory.cost, cfg);
    const inventoryLever = {
        inventoryAtCost: inventory.cost,
        capitalised: { profit: mid.projectedProfit, tax: capitalised },
        deductedWhenBought: { profit: mid.projectedProfit - inventory.cost, tax: deducted },
        swing: capitalised.total - deducted.total,
        isDeferralNotSaving: true,
        firstYearAdvantage: true,
    };

    return {
        year: theYear,
        asOf: todayKey,
        config: { ...cfg, ssWageBase: SS_WAGE_BASE, ssRoomLeft: Math.max(0, SS_WAGE_BASE - cfg.w2Income) },

        // Where the year stands now, straight off the Year report so the two screens cannot disagree.
        yearToDate: {
            netSales: report.profit.netSales,
            // Named honestly: sales minus gross profit is cost of goods AND card fees (net of
            // consigned commission and refunds). Calling it plain "cost of goods" would be a small lie
            // that a reader would reconcile against Square and find.
            costAndFees: report.profit.netSales - report.profit.merchProfit,
            grossProfit: report.profit.merchProfit,
            marginPercent: report.profit.marginPercent,
            operatingCost: report.costToStayOpen.operatingCost,
            netPosition: report.breakEven.netPosition,
            unclassified: report.unidentified,
        },

        projection: {
            daysLeft, tradingDaysLeft,
            forwardCost,
            scenarios,
            midKey: mid.key,
        },

        // The headline: what to put aside.
        setAside: {
            amount: Math.max(0, mid.tax.total),
            onProfit: mid.projectedProfit,
            marginalRatePercent: mid.tax.isRefund ? 0 : mid.tax.effectiveRate,
            low: Math.max(0, scenarios[0].tax.total),
            high: Math.max(0, scenarios[scenarios.length - 1].tax.total),
        },

        inventory,
        inventoryLever,

        // Obligations that are NOT income tax and must never be added to it. Sales tax is the customers'
        // money passing through; owner contributions are capital, not income; a draw is not a taxable event.
        notIncomeTax: {
            salesTaxRemitted: (report.spend.buckets.find((b) => b.bucket === "Sales tax remitted") || {}).amount || 0,
            wages: (report.spend.buckets.find((b) => b.bucket === "Wages") || {}).amount || 0,
            payrollTax: (report.spend.buckets.find((b) => b.bucket === "Payroll tax") || {}).amount || 0,
            workersComp: (report.spend.buckets.find((b) => b.bucket === "Workers comp") || {}).amount || 0,
            capitalEquipment: (report.spend.buckets.find((b) => b.bucket === "Fixtures") || {}).amount || 0,
            ownerContributions: report.personalInvestment.contributions,
            ownerDraws: report.personalInvestment.drawsOut,
        },

        disclaimer: "Not tax advice. The inventory method in particular needs a CPA — and 2026 being the "
            + "first year of business is the one year it can be chosen rather than changed.",
    };
}
