import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { createDraftBoss, endBoss, generateBossArt, listBossesAdmin, releaseBoss, updateDraftBoss } from "@/lib/marketplace/boss-admin.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// List all bosses (drafts + live + ended) for the admin control panel.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/boss", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            return noStore({ bosses: await listBossesAdmin() });
        } catch (error) {
            return internalError(error, { event: "admin.boss.list.failure" });
        }
    });
}

// Action dispatch: create | update | art | release | end.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/boss", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            const action = String(body?.action || "");
            if (action === "create") return noStore({ boss: await createDraftBoss(body) });
            if (action === "update") return noStore({ boss: await updateDraftBoss(body.bossId, body) });
            if (action === "art") {
                if (!body.bossId) return noStore({ error: "missing_boss" }, { status: 400 });
                const url = await generateBossArt(body.bossId, body.prompt);
                return noStore({ imageUrl: url });
            }
            if (action === "release") return noStore({ boss: await releaseBoss(body.bossId, { days: body.days }) });
            if (action === "end") return noStore(await endBoss(body.bossId));
            return noStore({ error: "unknown_action" }, { status: 400 });
        } catch (error) {
            if (error?.message && !/database|query/i.test(error.message)) return noStore({ error: error.message }, { status: 400 });
            return internalError(error, { event: "admin.boss.action.failure" });
        }
    });
}
