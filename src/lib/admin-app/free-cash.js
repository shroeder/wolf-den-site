import "server-only";

import { db } from "@/lib/db";
import { listOverhead, perDayCents } from "@/lib/admin-app/breakeven.js";

// ── WHAT CAN I ACTUALLY SPEND ────────────────────────────────────────────────────────────────────────────────
//
// The bank balance is not the answer to that question and never has been. A big chunk of what's sitting there
// is money the shop is HOLDING rather than money it OWNS: consignors are owed their cut of everything of theirs
// that sold, members have store credit they can spend at any moment, the state's share of every taxable sale is
// collected up front and remitted later, and rent lands whether or not the month went well.
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
    const rows = await db.query(
        `SELECT id, display_name, square_category_id FROM consignors WHERE active ORDER BY display_name`
    ).catch(() => []);
    if (!rows.length) return { total: 0, detail: [], overpaid: 0 };

    // Two active consignors pointing at ONE Square category means the same sales are counted twice — each
    // summary independently resolves that category and bills it at its own rate. Seen live: a 100%-rate
    // account sharing another consignor's category, inflating the liability by roughly that category's whole
    // revenue. It can't be resolved from here (which one is right is a business decision), so it's surfaced.
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

/** Store credit members are holding — spendable by them at any time, so not spendable by the shop. */
async function storeCreditOutstanding() {
    const r = await db.queryOne(
        `SELECT COALESCE(SUM(delta_cents), 0) / 100.0 AS bal FROM mkt_store_credit_event`
    ).catch(() => null);
    return money(r?.bal || 0);
}

/** Fixed costs still to land before the month is out — rent, insurance, anything else on the overhead list. */
async function overheadRemaining() {
    const items = await listOverhead().catch(() => []);
    const active = items.filter((i) => i.active !== false);
    const perDay = active.reduce((s, i) => s + perDayCents(i), 0) / 100;
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysLeft = daysInMonth - now.getDate() + 1;
    return {
        amount: money(perDay * daysLeft),
        daysLeft,
        perDay: money(perDay),
        // listOverhead returns raw rows — snake_case, cents.
        items: active.map((i) => ({ label: i.label, amount: money(Number(i.amount_cents || 0) / 100), cadence: i.cadence })),
    };
}

export async function cashPosition() {
    const [cashRow, bank, tax, consignors, credit, overhead] = await Promise.all([
        db.queryOne(`SELECT COALESCE(SUM(amount), 0) AS b FROM cash_ledger`).catch(() => null),
        entered("bank_balance"),
        entered("tax_set_aside"),
        consignorPayable(),
        storeCreditOutstanding(),
        overheadRemaining(),
    ]);
    const drawer = money(cashRow?.b || 0);

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
        { label: "Store credit outstanding", amount: credit, source: "computed", note: "Members can spend this any time" },
        {
            label: "Sales tax set aside", amount: tax.amount, source: "entered", notedAt: tax.notedAt,
            note: "The state's share of what's already been collected",
        },
        {
            label: `Fixed costs left this month`, amount: overhead.amount, source: "computed",
            note: `${overhead.daysLeft} days at ${"$" + overhead.perDay.toFixed(2)}/day`,
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
