import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session";
import { groveOpen } from "@/lib/marketplace/grove.js";
import { startRun, settleRun, pendingChests, runPlan } from "@/lib/marketplace/grove-coliseum.js";
import { coliseumState } from "@/lib/marketplace/grove-quests.js";
import { openColiseumChest } from "@/lib/marketplace/grove-coliseum-loot.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) =>
    NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

/** State, the plan, and anything still sitting on the ground from a previous run. */
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/grove/coliseum", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer || !groveOpen(buyer.id)) return noStore({ error: "Not found." }, { status: 404 });
            const map = Math.max(1, Math.min(7, Number(new URL(request.url).searchParams.get("map")) || 1));
            return noStore({
                ok: true,
                state: await coliseumState(buyer.id, map),
                plan: runPlan(map),
                chests: await pendingChests(buyer.id),
            });
        } catch (error) {
            return internalError(error, { event: "grove.coliseum.get.failure" });
        }
    });
}

// ── START, SETTLE, OPEN ──────────────────────────────────────────────────────────────────────────────────────
// Three writes on one route rather than three routes, because they are one flow and the shape of each is
// decided entirely by the server.
//
// ⚠️ THE KILLS INSIDE ARE NOT SETTLED HERE. They go through the ordinary Grove settle — same loot, same
// multi-kill, same zone progress — because Luke's rule is that the Coliseum has no special rules. All this
// route owns is the frame: the key, how far you got, and the boxes that fall out of it.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/grove/coliseum", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer || !groveOpen(buyer.id)) return noStore({ error: "Not found." }, { status: 404 });

            const body = await request.json().catch(() => ({}));
            const map = Math.max(1, Math.min(7, Number(body?.map) || 1));

            if (body?.action === "start") {
                const r = await startRun(buyer.id, map);
                return noStore(r, { status: r.ok ? 200 : 409 });
            }

            if (body?.action === "settle") {
                // ⚠️ THE WAVE COUNT IS CLAMPED AGAINST THE PLAN, not taken on trust. A claimed wave number is
                // the only thing deciding how many chests fall, so an unchecked one is a chest printer with
                // a text box attached. settleRun clamps to the real wave list.
                const r = await settleRun(buyer.id, {
                    map,
                    wavesCleared: Number(body?.wavesCleared) || 0,
                    cleared: Boolean(body?.cleared),
                });
                return noStore(r);
            }

            if (body?.action === "open") {
                const r = await openColiseumChest(buyer.id, Number(body?.chestId));
                return noStore(r, { status: r.ok ? 200 : 409 });
            }

            return noStore({ error: "unknown_action" }, { status: 400 });
        } catch (error) {
            return internalError(error, { event: "grove.coliseum.post.failure" });
        }
    });
}
