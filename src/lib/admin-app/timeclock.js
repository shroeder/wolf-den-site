import "server-only";

import { storeStatus } from "@/lib/marketplace/store-hours.js";
import { getSetting, setSetting } from "@/lib/settings.js";

// ── SQUARE TIME CLOCK ────────────────────────────────────────────────────────────────────────────────────────
// Clock the shop's employee in and out of Square Labor from the employee app, plus the reminder logic that nudges
// them BEFORE each end of the shift rather than after it — a reminder that arrives once you're already late is
// just a telling-off.
//
// Shift times come from the canonical store hours (store-hours.js), because there is no roster: Square had zero
// scheduled shifts, so opening/closing time IS the schedule. If real Square scheduling ever gets used, swap
// shiftWindow() for a scheduled-shifts read and the rest of this file is unchanged.

const SQUARE_API_BASE = "https://connect.squareup.com";
const SQUARE_VERSION = "2025-01-23";

// How far ahead to nudge, and how hard to keep at it once a shift is running long.
export const CLOCK_IN_LEAD_MIN = 15;    // "your shift starts soon" before opening
export const CLOCK_OUT_LEAD_MIN = 10;   // "wrap up and clock out" before closing
export const NAG_EVERY_MIN = 30;        // keep reminding while still clocked in past close
export const ESCALATE_AFTER_MIN = 60;   // still open this long after close → tell the owner too

const SETTING_TEAM = "timeclock_team_member_id";
const SETTING_LOC = "timeclock_location_id";

function headers() {
    const token = process.env.SQUARE_ACCESS_TOKEN;
    if (!token) throw new Error("missing_square_token");
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Square-Version": SQUARE_VERSION };
}
async function sq(path, init = {}) {
    const res = await fetch(`${SQUARE_API_BASE}${path}`, { ...init, headers: { ...headers(), ...(init.headers || {}) } });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
}

// Who gets clocked. Configurable, but with a zero-setup default: if there's exactly ONE active non-owner on the
// team, that's unambiguously the employee — no admin step needed before their first shift.
export async function resolveTeamMember() {
    const saved = String((await getSetting(SETTING_TEAM, "")) || "").trim();
    if (saved) return { id: saved, source: "setting" };
    const r = await sq("/v2/team-members/search", { method: "POST", body: JSON.stringify({ query: { filter: { status: "ACTIVE" } }, limit: 50 }) }).catch(() => null);
    const staff = (r?.json?.team_members || []).filter((m) => !m.is_owner);
    if (staff.length === 1) {
        return { id: staff[0].id, name: [staff[0].given_name, staff[0].family_name].filter(Boolean).join(" ").trim(), source: "only_staff" };
    }
    return { id: null, source: staff.length ? "ambiguous" : "none", candidates: staff.map((m) => ({ id: m.id, name: [m.given_name, m.family_name].filter(Boolean).join(" ").trim() })) };
}

export async function setTeamMember(id) {
    await setSetting(SETTING_TEAM, String(id || "").trim());
    return { ok: true };
}

async function resolveLocation() {
    const saved = String((await getSetting(SETTING_LOC, "")) || "").trim();
    if (saved) return saved;
    const r = await sq("/v2/locations").catch(() => null);
    const active = (r?.json?.locations || []).filter((l) => l.status === "ACTIVE");
    return active[0]?.id || null;
}

// The open (not yet clocked out) shift for this member, if any.
async function openShift(teamMemberId) {
    const r = await sq("/v2/labor/shifts/search", {
        method: "POST",
        body: JSON.stringify({ query: { filter: { team_member_ids: [teamMemberId], status: "OPEN" } }, limit: 5 }),
    }).catch(() => null);
    if (!r?.ok) return null;
    const shifts = r.json?.shifts || [];
    return shifts.find((s) => !s.end_at) || null;
}

// Today's clocked hours (Central), so the app can show "3h 20m so far" rather than just a raw start time.
async function hoursToday(teamMemberId) {
    const now = new Date();
    const dayStart = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(now) + "T00:00:00-05:00");
    const r = await sq("/v2/labor/shifts/search", {
        method: "POST",
        body: JSON.stringify({ query: { filter: { team_member_ids: [teamMemberId], start: { start_at: dayStart.toISOString(), end_at: new Date(now.getTime() + 864e5).toISOString() } } }, limit: 50 }),
    }).catch(() => null);
    let mins = 0;
    for (const s of r?.json?.shifts || []) {
        const start = s.start_at ? new Date(s.start_at) : null;
        if (!start) continue;
        const end = s.end_at ? new Date(s.end_at) : now; // an open shift counts up to right now
        mins += Math.max(0, (end - start) / 60000);
    }
    return Math.round(mins);
}

// Store hours as a shift window, in minutes relative to now. Negative "untilOpen" means it already started.
export function shiftWindow(now = new Date()) {
    const st = storeStatus(now);
    if (st.open) {
        // storeStatus doesn't expose time-to-close directly; derive it from the label-free numbers it does give.
        const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
        const hh = Number(parts.find((p) => p.type === "hour")?.value || 0) % 24;
        const mm = Number(parts.find((p) => p.type === "minute")?.value || 0);
        const openedAt = hh * 60 + mm - st.minutesSinceOpen;
        // Close time comes from the same table storeStatus uses; recover it from the label it hands back.
        const m = /^(\d+)(?::(\d+))?\s*(AM|PM)$/i.exec(st.closesLabel || "");
        let closeMin = null;
        if (m) {
            let h = Number(m[1]) % 12;
            if (/pm/i.test(m[3])) h += 12;
            closeMin = h * 60 + Number(m[2] || 0);
        }
        return { open: true, untilOpen: 0, untilClose: closeMin == null ? null : closeMin - (hh * 60 + mm), openedAt, closesLabel: st.closesLabel };
    }
    return { open: false, untilOpen: st.minutesUntilOpen, untilClose: null, nextOpenLabel: st.nextOpenLabel };
}

// ── STATUS / ACTIONS ─────────────────────────────────────────────────────────────────────────────────────────
export async function clockStatus() {
    const member = await resolveTeamMember();
    if (!member.id) return { ok: false, error: "no_team_member", detail: member };
    const [open, mins] = await Promise.all([openShift(member.id).catch(() => null), hoursToday(member.id).catch(() => 0)]);
    const win = shiftWindow();
    return {
        ok: true,
        teamMemberId: member.id,
        name: member.name || null,
        clockedIn: Boolean(open),
        shiftId: open?.id || null,
        startedAt: open?.start_at || null,
        minutesToday: mins,
        store: win,
    };
}

export async function clockIn() {
    const member = await resolveTeamMember();
    if (!member.id) return { ok: false, error: "no_team_member" };
    const already = await openShift(member.id).catch(() => null);
    if (already) return { ok: false, error: "already_clocked_in", shiftId: already.id, startedAt: already.start_at };
    const locationId = await resolveLocation();
    if (!locationId) return { ok: false, error: "no_location" };
    const r = await sq("/v2/labor/shifts", {
        method: "POST",
        body: JSON.stringify({
            idempotency_key: `in-${member.id}-${Date.now()}`,
            shift: { location_id: locationId, team_member_id: member.id, start_at: new Date().toISOString() },
        }),
    }).catch(() => null);
    if (!r?.ok) return { ok: false, error: "square_failed", status: r?.status, detail: r?.json?.errors?.[0]?.detail || null };
    const shift = r.json?.shift;
    return { ok: true, shiftId: shift?.id || null, startedAt: shift?.start_at || null };
}

export async function clockOut() {
    const member = await resolveTeamMember();
    if (!member.id) return { ok: false, error: "no_team_member" };
    const open = await openShift(member.id).catch(() => null);
    if (!open) return { ok: false, error: "not_clocked_in" };
    // Square wants the whole shift back on update, so send it through with an end time added.
    const r = await sq(`/v2/labor/shifts/${open.id}`, {
        method: "PUT",
        body: JSON.stringify({
            shift: {
                location_id: open.location_id,
                team_member_id: open.team_member_id,
                start_at: open.start_at,
                end_at: new Date().toISOString(),
                ...(open.wage ? { wage: open.wage } : {}),
                ...(open.breaks ? { breaks: open.breaks } : {}),
                version: open.version,
            },
        }),
    }).catch(() => null);
    if (!r?.ok) return { ok: false, error: "square_failed", status: r?.status, detail: r?.json?.errors?.[0]?.detail || null };
    const shift = r.json?.shift;
    const mins = shift?.start_at && shift?.end_at ? Math.round((new Date(shift.end_at) - new Date(shift.start_at)) / 60000) : null;
    return { ok: true, shiftId: shift?.id || null, minutes: mins };
}
