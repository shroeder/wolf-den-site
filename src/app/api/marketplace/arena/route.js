import { NextResponse } from "next/server";

import { clearBout, fightRound, getArenaState, seenArena, startBout } from "@/lib/marketplace/arena.js";
import {
    buyArenaUpgrade, pickClass, refundNode, respecClass, respecTree, takeNode,
} from "@/lib/marketplace/arena-progress.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Arena is OWNER-GATED. The gate lives in arena.js (ARENA_UNLOCKED) rather than here, so every entry point
// is covered by one switch instead of each route remembering to check.
const noStore = (body, init) => NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init?.headers || {}) } });

export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/arena", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer?.id) return noStore({ unlocked: false }, { status: 200 });
            return noStore(await getArenaState(buyer.id));
        } catch (error) {
            return internalError(error, { event: "arena.get.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/arena", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer?.id) return noStore({ error: "unauthorized" }, { status: 401 });
            const b = await request.json().catch(() => ({}));
            switch (String(b?.action || "")) {
                case "start": return noStore(await startBout(buyer.id, String(b?.target || "")));
                case "seen": return noStore(await seenArena(buyer.id));
                case "beat": return noStore(await fightRound(buyer.id, {
                    command: b?.command ? String(b.command) : null,
                    off: b?.off,
                    abilityId: b?.ability ? String(b.ability) : null,
                    itemId: b?.item ? String(b.item) : null,
                }));
                case "dismiss": return noStore(await clearBout(buyer.id));
                // ── PROGRESSION ── each returns the whole state so the screen never has to guess what
                // changed; a skill point is worth gold, so every one of these re-validates server-side.
                case "pick_class":
                    return noStore({ ...(await pickClass(buyer.id, String(b?.classId || ""))), ...(await getArenaState(buyer.id)) });
                case "take_node":
                    return noStore({ ...(await takeNode(buyer.id, String(b?.nodeId || ""))), ...(await getArenaState(buyer.id)) });
                case "refund_node":
                    return noStore({ ...(await refundNode(buyer.id, String(b?.nodeId || ""))), ...(await getArenaState(buyer.id)) });
                case "respec_tree":
                    return noStore({ ...(await respecTree(buyer.id)), ...(await getArenaState(buyer.id)) });
                case "respec_class":
                    return noStore({ ...(await respecClass(buyer.id, String(b?.classId || ""))), ...(await getArenaState(buyer.id)) });
                case "arena_upgrade":
                    return noStore({ ...(await buyArenaUpgrade(buyer.id, String(b?.track || ""))), ...(await getArenaState(buyer.id)) });
                default: return noStore({ error: "bad_action" }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "arena.act.failure" });
        }
    });
}
