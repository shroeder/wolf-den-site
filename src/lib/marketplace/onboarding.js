import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";

// ── "Getting started" onboarding — one-time setup tasks, each granting gold once ────────────────────────────
// The two permission tasks are the point: getting members to allow push (so we can ping them) + location (so the
// farm/sailing match their real weather). Completion is claimed by the client after the browser grants the
// permission; the server grants the gold once and records it in onboarding_done.

export const ONBOARDING_TASKS = [
    { key: "notifications", icon: "🔔", label: "Turn on notifications", desc: "Get pinged for boss fights, trades & rewards.", gold: 250 },
    { key: "location", icon: "📍", label: "Enable location", desc: "Your farm & sailing match your real weather.", gold: 250 },
];
const TASK_BY_KEY = new Map(ONBOARDING_TASKS.map((t) => [t.key, t]));

const parseDone = (raw) => { try { const p = typeof raw === "string" ? JSON.parse(raw) : (raw || []); return Array.isArray(p) ? p : []; } catch { return []; } };

export async function getOnboarding(buyerId) {
    if (!buyerId) return { tasks: [], allDone: true };
    const row = await db.queryOne(`SELECT onboarding_done FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const done = new Set(parseDone(row?.onboarding_done));
    const tasks = ONBOARDING_TASKS.map((t) => ({ key: t.key, icon: t.icon, label: t.label, desc: t.desc, gold: t.gold, claimed: done.has(t.key) }));
    return { tasks, allDone: tasks.every((t) => t.claimed) };
}

// Grant a task's gold once. Trusts the client only claims after the real permission grant (low-stakes reward).
export async function claimOnboarding(buyerId, key) {
    const task = TASK_BY_KEY.get(key);
    if (!buyerId || !task) return { ok: false, error: "bad_task" };
    const row = await db.queryOne(`SELECT onboarding_done FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const done = new Set(parseDone(row?.onboarding_done));
    if (done.has(key)) return { ok: false, error: "claimed", ...(await getOnboarding(buyerId)) };
    done.add(key);
    const paid = await db.queryOne(`UPDATE mkt_buyer SET onboarding_done = $2::jsonb, gold = gold + $3 WHERE id = $1 RETURNING gold`, [buyerId, JSON.stringify([...done]), task.gold]).catch(() => null);
    if (!paid) return { ok: false, error: "db" };
    await logCoin(buyerId, task.gold, "onboarding", { balanceAfter: paid.gold, meta: { key } }).catch(() => {});
    return { ok: true, gold: task.gold, ...(await getOnboarding(buyerId)) };
}
