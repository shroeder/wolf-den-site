import { db } from "@/lib/db";

// ── Break-even tracker ────────────────────────────────────────────────────────────────────────────────────
// The business report shows "merchandise profit" (net product revenue − realized COGS) and deliberately leaves
// OUT rent, insurance, wages, etc. This module supplies exactly that missing cost side: recurring overhead
// (normalized to a per-day rate) plus the tracked employee's real labor cost (Square-clocked hours × wage ×
// (1 + employer burden)). The app overlays these costs on the same profit the reports show, so "did we clear
// break-even?" becomes answerable over any date range.

const SQUARE_API_BASE = "https://connect.squareup.com";
const SQUARE_VERSION = process.env.SQUARE_API_VERSION || "2024-10-17";
const DAYS_PER_MONTH = 365.25 / 12; // 30.4375 — amortize monthly costs evenly across the year

// Per-DAY cents for a recurring line item, whatever its cadence.
export function perDayCents(item) {
    const amt = Number(item?.amount_cents) || 0;
    switch (item?.cadence) {
        case "daily": return amt;
        case "weekly": return amt / 7;
        case "yearly": return amt / 365.25;
        case "monthly":
        default: return amt / DAYS_PER_MONTH;
    }
}

// ── Overhead line items ───────────────────────────────────────────────────────────────────────────────────
export async function listOverhead() {
    return db.query(`SELECT id, label, amount_cents, cadence, active, sort_order FROM wolfden_overhead ORDER BY active DESC, sort_order, id`, []).catch(() => []);
}
const CADENCES = new Set(["daily", "weekly", "monthly", "yearly"]);
export async function upsertOverhead({ id, label, amountCents, cadence, active, sortOrder }) {
    const cad = CADENCES.has(cadence) ? cadence : "monthly";
    const amt = Math.max(0, Math.round(Number(amountCents) || 0));
    if (id) {
        return db.queryOne(
            `UPDATE wolfden_overhead SET label = COALESCE($2, label), amount_cents = $3, cadence = $4,
               active = COALESCE($5, active), sort_order = COALESCE($6, sort_order), updated_at = NOW()
             WHERE id = $1 RETURNING id`, [id, label ?? null, amt, cad, typeof active === "boolean" ? active : null, Number.isFinite(sortOrder) ? sortOrder : null]
        ).catch(() => null);
    }
    if (!label || !String(label).trim()) return null;
    return db.queryOne(`INSERT INTO wolfden_overhead (label, amount_cents, cadence, sort_order) VALUES ($1, $2, $3, $4) RETURNING id`,
        [String(label).trim().slice(0, 80), amt, cad, Number.isFinite(sortOrder) ? sortOrder : 0]).catch(() => null);
}
export async function deleteOverhead(id) {
    if (!id) return false;
    await db.query(`DELETE FROM wolfden_overhead WHERE id = $1`, [id]).catch(() => {});
    return true;
}

// ── Config (burden %, fallback wage, which team member = the tracked employee) ────────────────────────────
export async function getConfig() {
    const c = await db.queryOne(`SELECT labor_burden_pct, default_wage_cents, employee_team_member_id, employee_name FROM wolfden_breakeven_config WHERE id = 1`, []).catch(() => null);
    return {
        burdenPct: Number(c?.labor_burden_pct ?? 15),
        defaultWageCents: Number(c?.default_wage_cents ?? 1200),
        employeeTeamMemberId: c?.employee_team_member_id || null,
        employeeName: c?.employee_name || null,
    };
}
export async function setConfig({ burdenPct, defaultWageCents, employeeTeamMemberId, employeeName }) {
    await db.query(
        `UPDATE wolfden_breakeven_config SET
           labor_burden_pct = COALESCE($1, labor_burden_pct),
           default_wage_cents = COALESCE($2, default_wage_cents),
           employee_team_member_id = COALESCE($3, employee_team_member_id),
           employee_name = COALESCE($4, employee_name),
           updated_at = NOW()
         WHERE id = 1`,
        [Number.isFinite(burdenPct) ? burdenPct : null, Number.isFinite(defaultWageCents) ? Math.round(defaultWageCents) : null,
         employeeTeamMemberId ?? null, employeeName ?? null]
    ).catch(() => {});
    return getConfig();
}

// ── Square Labor / Team ───────────────────────────────────────────────────────────────────────────────────
function squareHeaders() {
    const token = process.env.SQUARE_ACCESS_TOKEN;
    if (!token) throw new Error("missing_square_token");
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Square-Version": SQUARE_VERSION };
}
async function squareCall(path, init = {}) {
    const res = await fetch(`${SQUARE_API_BASE}${path}`, { ...init, headers: { ...squareHeaders(), ...(init.headers || {}) } });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
}

// Active team members (so the admin can pick who the tracked employee is). Non-owners first.
export async function listTeamMembers() {
    const r = await squareCall("/v2/team-members/search", { method: "POST", body: JSON.stringify({ query: { filter: { status: "ACTIVE" } }, limit: 100 }) }).catch(() => null);
    if (!r?.ok) return { ok: false, status: r?.status || 0, members: [] };
    const members = (r.json?.team_members || []).map((m) => ({
        id: m.id, name: [m.given_name, m.family_name].filter(Boolean).join(" ").trim() || m.email_address || m.id,
        isOwner: Boolean(m.is_owner),
    })).sort((a, b) => Number(a.isOwner) - Number(b.isOwner));
    return { ok: true, members };
}

// The tracked employee's Square hourly wage (from their wage-setting job assignments — highest hourly rate).
// Returns cents or null if unavailable, plus the source label.
export async function getWageCents(teamMemberId) {
    if (!teamMemberId) return { cents: null, source: null };
    const r = await squareCall(`/v2/team-members/${teamMemberId}/wage-setting`).catch(() => null);
    if (!r?.ok) return { cents: null, source: null };
    const jobs = r.json?.wage_setting?.job_assignments || [];
    let best = null;
    for (const j of jobs) {
        const amt = Number(j?.hourly_rate?.amount); // hourly job assignments only
        if (Number.isFinite(amt) && (best == null || amt > best)) best = amt;
    }
    return best != null ? { cents: best, source: "square" } : { cents: null, source: null };
}

// Sum clocked hours per day over [fromISO, toISO) for one or more team members. Returns { ok, byDay:
// {YYYY-MM-DD: hours}, totalHours }. byDay keys are Chicago-local dates (the shop's timezone) so they line up
// with sales days.
//
// `ok: false` when NOBODY is passed, not `ok: true` with an empty result. Those are different facts — "the
// employee worked zero hours" and "we never asked about any employee" cannot look identical to the caller, or
// the tracker reports $0 labor as if it had measured it. That is exactly what went wrong: no employee was ever
// pinned in the config, so break-even quietly billed overhead only.
export async function employeeHoursByDay(teamMemberIds, fromISO, toISO) {
    const ids = (Array.isArray(teamMemberIds) ? teamMemberIds : [teamMemberIds]).filter(Boolean);
    if (!ids.length) return { ok: false, reason: "no_team_members", byDay: {}, totalHours: 0 };
    const byDay = {};
    const byMemberDay = {}; // memberId -> { date: hours } — each person is priced at THEIR own wage
    let cursor = null;
    let totalHours = 0;
    let pages = 0;
    do {
        const body = {
            query: { filter: { team_member_ids: ids, start: { start_at: fromISO, end_at: toISO } } },
            limit: 200, ...(cursor ? { cursor } : {}),
        };
        const r = await squareCall("/v2/labor/shifts/search", { method: "POST", body: JSON.stringify(body) }).catch(() => null);
        if (!r?.ok) return { ok: false, reason: "square_error", status: r?.status || 0, byDay: {}, byMemberDay: {}, totalHours: 0 };
        for (const s of r.json?.shifts || []) {
            const start = s?.start_at ? new Date(s.start_at) : null;
            const end = s?.end_at ? new Date(s.end_at) : null;
            if (!start || !end) continue; // open shift (not clocked out yet) — skip until closed
            let hrs = (end.getTime() - start.getTime()) / 3.6e6;
            for (const br of s?.breaks || []) { // subtract unpaid breaks
                if (br?.is_paid === false && br?.start_at && br?.end_at) hrs -= (new Date(br.end_at) - new Date(br.start_at)) / 3.6e6;
            }
            hrs = Math.max(0, hrs);
            const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(start);
            byDay[day] = (byDay[day] || 0) + hrs;
            const mid = s?.team_member_id || "unknown";
            (byMemberDay[mid] ||= {})[day] = (byMemberDay[mid][day] || 0) + hrs;
            totalHours += hrs;
        }
        cursor = r.json?.cursor || null;
        pages += 1;
    } while (cursor && pages < 25);
    return { ok: true, byDay, byMemberDay, totalHours };
}

// ── Break-even summary over a date range ──────────────────────────────────────────────────────────────────
// Returns the COST side only (overhead + labor) as a per-day series + totals + resolved config. The app pairs
// this with the gross profit its reports already compute for the same range.
export async function breakevenSummary({ from, to }) {
    const [items, config] = await Promise.all([listOverhead(), getConfig()]);
    const activeItems = items.filter((i) => i.active);
    const dailyOverheadCents = activeItems.reduce((s, i) => s + perDayCents(i), 0);

    const fromDate = from ? new Date(`${from}T00:00:00-05:00`) : new Date(Date.now() - 29 * 864e5);
    const toDate = to ? new Date(`${to}T23:59:59-05:00`) : new Date();
    const fromISO = fromDate.toISOString();
    const toISO = new Date(toDate.getTime() + 1000).toISOString();

    // WHO counts as labor. If an employee is pinned in config, just them. If nobody is pinned — which was the
    // case in production, and is why break-even had been reporting overhead only — fall back to every ACTIVE
    // non-owner team member. That is the real wage bill, and it means the tracker is right by default instead
    // of silently zero until somebody remembers to configure it. The owner is excluded: Luke doesn't draw an
    // hourly wage, and counting his hours would turn working the counter into a loss.
    let tracked = [];
    let scope = "pinned";
    if (config.employeeTeamMemberId) {
        tracked = [{ id: config.employeeTeamMemberId, name: config.employeeName || null }];
    } else {
        const team = await listTeamMembers();
        tracked = (team.members || []).filter((m) => !m.isOwner).map((m) => ({ id: m.id, name: m.name }));
        scope = team.ok ? "all_employees" : "unavailable";
    }

    // Each person is priced at THEIR own Square wage. defaultWageCents is only a fallback, and when it's used
    // we say so (wageSource) rather than passing a guess off as a measurement.
    const wages = await Promise.all(tracked.map(async (m) => {
        const w = await getWageCents(m.id);
        return { ...m, wageCents: w.cents ?? config.defaultWageCents, wageSource: w.cents != null ? "square" : "default" };
    }));
    const hours = await employeeHoursByDay(wages.map((m) => m.id), fromISO, toISO);
    const burdenMult = 1 + Math.max(0, config.burdenPct) / 100;

    const days = [];
    let totalOverhead = 0;
    let totalLabor = 0;
    let totalHours = 0;
    const perMember = wages.map((m) => ({ ...m, hours: 0, cents: 0 }));
    for (let d = new Date(fromDate); d <= toDate; d = new Date(d.getTime() + 864e5)) {
        const key = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
        let laborCents = 0;
        let hrs = 0;
        for (const m of perMember) {
            const mh = hours.byMemberDay?.[m.id]?.[key] || 0;
            if (!mh) continue;
            const c = Math.round(mh * m.wageCents * burdenMult);
            laborCents += c; hrs += mh;
            m.hours += mh; m.cents += c;
        }
        const overheadCents = Math.round(dailyOverheadCents);
        days.push({ date: key, overheadCents, hours: Math.round(hrs * 100) / 100, laborCents, costCents: overheadCents + laborCents });
        totalOverhead += overheadCents;
        totalLabor += laborCents;
        totalHours += hrs;
    }
    // A single blended figure for the summary line when more than one person is tracked.
    const wageCents = perMember.length === 1 ? perMember[0].wageCents
        : (totalHours > 0 ? Math.round(totalLabor / burdenMult / totalHours) : config.defaultWageCents);
    const wageSource = perMember.length === 1 ? perMember[0].wageSource
        : (perMember.some((m) => m.wageSource === "square") ? "square" : "default");

    return {
        range: { from: days[0]?.date || null, to: days[days.length - 1]?.date || null, dayCount: days.length },
        overhead: { items, activeCount: activeItems.length, dailyCents: Math.round(dailyOverheadCents), totalCents: totalOverhead },
        labor: {
            employeeTeamMemberId: config.employeeTeamMemberId, employeeName: config.employeeName,
            wageCents, wageSource, burdenPct: config.burdenPct, hoursAvailable: hours.ok,
            // What labor actually covers, so the screen can never again imply it's included when it isn't.
            //   pinned         — one configured employee
            //   all_employees  — nobody pinned, so every active non-owner
            //   unavailable    — Square wouldn't tell us; labor is MISSING, not zero
            scope, unavailableReason: hours.ok ? null : (hours.reason || "unknown"),
            members: perMember.map((m) => ({
                id: m.id, name: m.name, wageCents: m.wageCents, wageSource: m.wageSource,
                hours: Math.round(m.hours * 100) / 100, totalCents: m.cents,
            })),
            totalHours: Math.round(totalHours * 100) / 100, totalCents: totalLabor,
        },
        config,
        breakEvenPerDayCents: Math.round(dailyOverheadCents), // labor varies by day; overhead is the fixed floor
        totalCostCents: totalOverhead + totalLabor,
        days,
    };
}
