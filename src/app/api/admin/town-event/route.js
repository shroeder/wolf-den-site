import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { spawnTownEvent, TOWN_EVENT_TYPES } from "@/lib/marketplace/town-events.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET — the event types an admin can trigger (for the admin app's button list).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/town-event", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const types = Object.entries(TOWN_EVENT_TYPES).map(([kind, t]) => ({ kind, name: t.name, emoji: t.emoji, hp: t.hp, rewardGold: t.rewardGold, durationMin: t.durationMin }));
            return noStore({ types });
        } catch (error) {
            return internalError(error, { event: "admin.town_event.list.failure" });
        }
    });
}

// POST { kind } — spawn a town event (bandit raid, etc.). Alerts every member via push. One active at a time.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/town-event", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            // Pass { silent: true } to spawn a quiet test that alerts nobody; default alerts everyone.
            const res = await spawnTownEvent(String(body?.kind || "bandit_raid"), { silent: Boolean(body?.silent) });
            if (!res.ok) return noStore({ error: res.error }, { status: res.error === "already_active" ? 409 : 400 });
            return noStore(res);
        } catch (error) {
            return internalError(error, { event: "admin.town_event.spawn.failure" });
        }
    });
}
