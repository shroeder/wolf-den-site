import "server-only";

import { db } from "@/lib/db";
import { CASH_BALANCE_SQL } from "@/lib/cash/cash-ledger.js";
import { listOverhead, perDayCents } from "@/lib/admin-app/breakeven.js";

// ── CASH POSITION — what can I actually spend ────────────────────────────────────────────────────────────────────────────────
//
// The bank balance is not the answer to that question and never has been. A big chunk of what's sitting there
// is money the shop is HOLDING rather than money it OWNS: consignors are owed their cut of everything of theirs
// that sold, the state's share of every taxable sale is collected up front and remitted later, and rent lands
// whether or not the month went well.
//
// Store credit is deliberately NOT one of them. It is a real claim, but members redeem it in MERCHANDISE at
// retail, not in cash, so counting it here made the shop look poorer in money than it actually is.
//
// So this walks down from what's on hand to what's genuinely free, one obligation at a time, and shows the
// arithmetic. The intermediate rows matter as much as the total — "free cash is low BECAUSE consignors are owed
// $900" is an actionable sentence in a way that a single number never is.
//
// Every line declares whether it was COMPUTED (derived from records here, exact) or ENTERED (typed in, only as
// fresh as the timestamp). Mixing the two silently is how a screen like this starts lying.

const money = (n) => Math.round(Number(n || 0) * 100) / 100;

async function entered(key) {
    const r = await db.queryOne(
        `SELECT amount, noted_at FROM cash_position_input WHERE key = $1`, [key]
    ).catch(() => null);
    return { amount: money(r?.amount || 0), notedAt: r?.noted_at || null };
}

export async function setCashInput(key, amount, by = "owner") {
    if (!["bank_balance", "tax_set_aside"].includes(key)) return { ok: false, error: "bad_key" };
    await db.query(
        `INSERT INTO cash_position_input (key, amount, noted_at, noted_by)
         VALUES ($1, $2, NOW(), $3)
         ON CONFLICT (key) DO UPDATE SET amount = EXCLUDED.amount, noted_at = NOW(), noted_by = EXCLUDED.noted_by`,
        [key, money(amount), by]
    ).catch(() => {});
    return { ok: true };
}

/**
 * What consignors are owed right now.
 *
 * Deliberately NOT read off `consignment_sale` — that table holds $86 of revenue against $1,125 of payouts
 * already made, because sales are resolved live against Square categories and only a fraction ever landed in
 * the table. Reading it would understate the liability by more than an order of magnitude.
 *
 * `getConsignorSummary` is the same path the consignor portal and the nightly reports use, so this number
 * always agrees with what the consignors themselves are being shown.
 *
 * Only POSITIVE balances count. An overpaid consignor is a receivable, not spendable cash, and netting the two
 * would let one overpayment quietly fund another consignor's payout.
 */
async function consignorPayable() {
    // A 100% payout rate means the shop keeps nothing, which is not a commercial arrangement — it's the owner's
    // own test account, deliberately pointed at a real consignor's Square category so the payout maths can be
    // exercised against live sales. Left in, it bills that category's whole revenue a second time (it was
    // inflating this figure by $670 of Pedro's sales). Excluded here; the real consignor still counts.
    const rows = await db.query(
        `SELECT id, display_name, square_category_id FROM consignors WHERE active AND payout_rate < 1.0 ORDER BY display_name`
    ).catch(() => []);
    if (!rows.length) return { total: 0, detail: [], overpaid: 0 };

    // Two REAL consignors on one category would still double-count, and which is right is a business decision
    // rather than something to resolve here — so it's surfaced on the line instead of silently adjusted.
    const byCategory = new Map();
    for (const c of rows) {
        if (!c.square_category_id) continue;
        byCategory.set(c.square_category_id, [...(byCategory.get(c.square_category_id) || []), c.display_name]);
    }
    const ambiguous = [...byCategory.entries()]
        .filter(([, names]) => names.length > 1)
        .map(([categoryId, names]) => ({ categoryId, names }));

    const { getConsignorSummary } = await import("@/lib/consignment/portal-data.js");
    const detail = [];
    let total = 0;
    let overpaid = 0;
    const settled = await Promise.allSettled(
        rows.map((c) => getConsignorSummary(c.id, { lookbackDays: 365 }))
    );
    settled.forEach((res, i) => {
        // A consignor whose Square lookup failed is reported rather than silently counted as zero — a missing
        // liability is exactly the error that makes this screen dangerous.
        if (res.status !== "fulfilled") { detail.push({ name: rows[i].display_name, owed: null, error: true }); return; }
        const bal = money(res.value?.netBalance || 0);
        if (bal > 0) { total += bal; detail.push({ name: rows[i].display_name, owed: bal }); }
        else if (bal < 0) overpaid += -bal;
    });
    return { total: money(total), detail, overpaid: money(overpaid), failed: detail.some((d) => d.error), ambiguous };
}

/* Store credit was deliberately dropped from this report. It IS a real claim on the shop, but it is claimed in
   MERCHANDISE at retail rather than in cash, so subtracting it from the cash position overstated what the shop
   owes in money. Owner's call: this screen answers "what money is actually free", and store credit is not a
   money obligation. Kept here, unused, because the maths is right if it is ever wanted back. */
/* eslint-disable-next-line no-unused-vars */
async function storeCreditOutstanding() {
    const r = await db.queryOne(
        `SELECT COALESCE(SUM(delta_cents), 0) / 100.0 AS bal FROM mkt_store_credit_event`
    ).catch(() => null);
    return money(r?.bal || 0);
}

/** Fixed costs still to land before the month is out — rent, insurance, anything else on the overhead list. */
// Has this monthly bill already been paid for the current month?
//
// Rent is paid UP FRONT, so on the 2nd of the month a straight days-left proration claimed the shop still owed
// a full month of rent it had already handed over — the single biggest line on the report, wrong by its whole
// value for 30 days at a time.
//
// Matched on the ledger CATEGORY first, which is structured, with the label as a text fallback. Learned the
// hard way from the sales-tax miss: bank descriptions here are blank more often than not, so a memo match
// alone finds nothing.
//
// The window starts FIVE DAYS BEFORE the month does, because rent has historically been paid in the tail of the
// previous month for the coming one — the ledger's own "May Lease Payment" is dated April 26. Paying on the 1st
// (the current habit) and paying on the 28th for next month both land inside it.
async function monthlyBillsPaid(items) {
    if (!items.length) return new Map();
    const labels = items.map((i) => String(i.label || "").trim()).filter(Boolean);
    if (!labels.length) return new Map();
    const rows = await db.query(
        `SELECT category, description, amount, date_ms
           FROM ledger_entry
          WHERE amount < 0
            AND to_timestamp(date_ms / 1000) AT TIME ZONE 'America/Chicago'
                >= date_trunc('month', NOW() AT TIME ZONE 'America/Chicago') - INTERVAL '5 days'`,
        []
    ).catch(() => []);
    const paid = new Map();
    for (const item of items) {
        const label = String(item.label || "").trim();
        if (!label) continue;
        const low = label.toLowerCase();
        const hit = rows.find((r) =>
            String(r.category || "").trim().toLowerCase() === low ||
            String(r.description || "").toLowerCase().includes(low));
        if (hit) paid.set(item.id, { amount: money(Math.abs(Number(hit.amount) || 0)), on: Number(hit.date_ms) || null });
    }
    return paid;
}

async function overheadRemaining() {
    const items = await listOverhead().catch(() => []);
    const active = items.filter((i) => i.active !== false);
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysLeft = daysInMonth - now.getDate() + 1;

    // A MONTHLY bill is all-or-nothing: it is either still owed in full or already paid. Prorating it by days
    // left describes a cost that accrues evenly, which rent and insurance do not — they arrive as one payment
    // on one day. Genuinely per-day costs (daily/weekly/yearly cadences) still prorate.
    const monthly = active.filter((i) => (i.cadence || "monthly") === "monthly");
    const paid = await monthlyBillsPaid(monthly);

    const monthlyOwed = monthly
        .filter((i) => !paid.has(i.id))
        .reduce((s, i) => s + Number(i.amount_cents || 0), 0) / 100;
    const otherPerDay = active
        .filter((i) => (i.cadence || "monthly") !== "monthly")
        .reduce((s, i) => s + perDayCents(i), 0) / 100;

    return {
        amount: money(monthlyOwed + otherPerDay * daysLeft),
        daysLeft,
        perDay: money(active.reduce((s, i) => s + perDayCents(i), 0) / 100),
        // listOverhead returns raw rows — snake_case, cents. `paidOn` lets the screen show WHY a line is zero,
        // so "rent isn't in the total" reads as settled rather than as a bug.
        items: active.map((i) => ({
            label: i.label,
            amount: money(Number(i.amount_cents || 0) / 100),
            cadence: i.cadence,
            paid: paid.has(i.id),
            paidAmount: paid.get(i.id)?.amount ?? null,
            paidOn: paid.get(i.id)?.on ?? null,
        })),
    };
}

export async function cashPosition() {
    const [cashRow, bank, tax, consignors, overhead] = await Promise.all([
        db.queryOne(`${CASH_BALANCE_SQL}`).catch(() => null),
        entered("bank_balance"),
        entered("tax_set_aside"),
        consignorPayable(),
        overheadRemaining(),
    ]);
    // `balance`, not `b` — the shared query aliases it that way. Reading the old key here would have shown
    // the drawer as $0 on the "where the money is" screen without erroring.
    const drawer = money(cashRow?.balance || 0);

    const have = [
        { label: "In the drawer", amount: drawer, source: "computed", note: "Cash ledger balance" },
        { label: "In the bank", amount: bank.amount, source: "entered", notedAt: bank.notedAt },
    ];
    const owe = [
        {
            label: "Owed to consignors", amount: consignors.total, source: "computed",
            note: consignors.ambiguous?.length
                ? `OVERSTATED — ${consignors.ambiguous.map((a) => a.names.join(" & ")).join("; ")} share one Square category, so those sales are counted twice`
                : consignors.failed ? "One or more consignors couldn't be checked — treat as a floor"
                    : `${consignors.detail.filter((d) => !d.error).length} with a balance`,
            detail: consignors.detail,
            warn: Boolean(consignors.ambiguous?.length),
        },
        {
            label: "Sales tax set aside", amount: tax.amount, source: "entered", notedAt: tax.notedAt,
            note: "The state's share of what's already been collected",
        },
        {
            label: `Fixed costs left this month`, amount: overhead.amount, source: "computed",
            note: (() => {
                const settled = overhead.items.filter((i) => i.paid);
                const owed = overhead.items.filter((i) => !i.paid);
                if (!owed.length) return "Everything's paid for this month";
                return settled.length
                    ? `${owed.map((i) => i.label).join(", ")} still due · ${settled.map((i) => i.label).join(", ")} already paid`
                    : `${owed.map((i) => i.label).join(", ")} still due this month`;
            })(),
            detail: overhead.items,
        },
    ];

    const totalHave = money(have.reduce((s, r) => s + r.amount, 0));
    const totalOwe = money(owe.reduce((s, r) => s + r.amount, 0));
    return {
        have, owe,
        totalHave, totalOwe,
        free: money(totalHave - totalOwe),
        overpaidConsignors: consignors.overpaid,
        // Nothing here is trustworthy if the entered figures are months old, so the screen surfaces the age.
        staleness: {
            bank: bank.notedAt, tax: tax.notedAt,
        },
    };
}
