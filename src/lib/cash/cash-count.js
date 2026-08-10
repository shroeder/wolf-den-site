import "server-only";

import { db } from "@/lib/db";
import { cashBalance, reconcileCashBalance } from "@/lib/cash/cash-ledger.js";

// ── COUNTING THE DRAWER ──────────────────────────────────────────────────────────────────────────────────────
// A count at the start and end of every shift. Two things come out of it: the ledger gets corrected to reality,
// and — more usefully — we learn WHEN it stopped matching. A single monthly count says the drawer is $117
// light with no idea when; a count either side of each shift narrows it to a few hours and a person.
//
// Every count is logged even when it matches exactly. "Counted, and it was right" is the fact that makes the
// next mismatch meaningful.

export async function recordCashCount(actual, { context = "manual", by = null, note = null, device = null } = {}) {
    const amt = Number(actual);
    if (!Number.isFinite(amt) || amt < 0) return { ok: false, error: "bad_amount" };

    const expected = await cashBalance();
    const delta = Math.round((amt - expected) * 100) / 100;

    await db.query(
        `INSERT INTO cash_count (actual_amount, expected_amount, delta, context, counted_by, note, counted_by_device)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [amt, expected, delta, context, by, note, device]
    ).catch(() => {});

    // Only touch the ledger when it's actually wrong — a matching count shouldn't leave a $0 row behind.
    if (delta !== 0) {
        await reconcileCashBalance(amt, {
            note: `${context === "clock_in" ? "clock-in" : context === "clock_out" ? "clock-out" : "manual"} count${by ? ` by ${by}` : ""}`,
            createdBy: by,
        }).catch(() => {});
    }
    return { ok: true, expected, actual: amt, delta, matched: delta === 0 };
}

/** Recent counts, newest first — the shift-by-shift picture of when the drawer drifted. */
export async function listCashCounts(limit = 30) {
    const rows = await db.query(
        `SELECT counted_at, counted_on, actual_amount, expected_amount, delta, context, counted_by, note
           FROM cash_count ORDER BY counted_at DESC LIMIT $1`, [Math.min(100, Math.max(1, limit))]
    ).catch(() => []);
    return rows.map((r) => ({
        countedAt: r.counted_at,
        countedOn: String(r.counted_on).slice(0, 10),
        actual: Number(r.actual_amount),
        expected: Number(r.expected_amount),
        delta: Number(r.delta),
        context: r.context,
        by: r.counted_by || null,
        note: r.note || null,
    }));
}
