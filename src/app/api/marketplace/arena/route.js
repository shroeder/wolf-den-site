import { NextResponse } from "next/server";

import {
    actBout, clearBout, forfeitBout, getArenaState, seenArena, startBout,
} from "@/lib/marketplace/arena.js";
import {
    buyArenaUpgrade, buyArmoury, buyArmouryRecipe, pickClass, purserExchange, refundNode, refundSkill,
    respecClass, respecTree, takeNode, takeSkill, takeSkillNode,
} from "@/lib/marketplace/arena-progress.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Arena is PUBLIC as of 2026-08-10. It was owner-gated through its build, behind a single predicate in
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
                // ── A BEAT ── what you throw, and nothing else. The brace action went with the timing game;
                // their swing resolves inside advance() and arrives as transcript.
                case "act":
                    return noStore(await actBout(buyer.id, { skillId: b?.skillId || null }));
                case "dismiss": return noStore(await clearBout(buyer.id));
                // Leaving a fight that is still running. It resolves as a loss — see forfeitBout.
                case "forfeit": return noStore(await forfeitBout(buyer.id));
                // ── PROGRESSION ── each returns the whole state so the screen never has to guess what
                // changed; a skill point is worth gold, so every one of these re-validates server-side.
                case "pick_class":
                    return noStore({ ...(await pickClass(buyer.id, String(b?.classId || ""))), ...(await getArenaState(buyer.id)) });
                case "take_node":
                    return noStore({ ...(await takeNode(buyer.id, String(b?.nodeId || ""))), ...(await getArenaState(buyer.id)) });
                case "refund_node":
                    return noStore({ ...(await refundNode(buyer.id, String(b?.nodeId || ""))), ...(await getArenaState(buyer.id)) });
                // ── THE SKILL PANEL ── same shape as the tree's three above: every one re-validates
                // server-side against the same pure catalog the screen renders from, because a skill point is
                // worth gold and a route that can be posted into is a route that will be.
                case "take_skill":
                    return noStore({ ...(await takeSkill(buyer.id, String(b?.skillId || ""))), ...(await getArenaState(buyer.id)) });
                case "take_skill_node":
                    return noStore({ ...(await takeSkillNode(buyer.id, String(b?.skillId || ""), String(b?.nodeId || ""))), ...(await getArenaState(buyer.id)) });
                // `nodeId` absent gives the whole skill back; present gives back that rung and everything
                // under it in its branch, which could not have been bought without it.
                case "refund_skill":
                    return noStore({ ...(await refundSkill(buyer.id, String(b?.skillId || ""), b?.nodeId ? String(b.nodeId) : null)), ...(await getArenaState(buyer.id)) });
                case "respec_tree":
                    return noStore({ ...(await respecTree(buyer.id)), ...(await getArenaState(buyer.id)) });
                case "respec_class":
                    return noStore({ ...(await respecClass(buyer.id, String(b?.classId || ""))), ...(await getArenaState(buyer.id)) });
                case "buy_stone": {
                    const { buyStone } = await import("@/lib/marketplace/pet-ascension.js");
                    const r = await buyStone(buyer.id, String(b?.stone || ""), "laurels");
                    return noStore({ ...r, ...(await getArenaState(buyer.id)) });
                }
                case "buy_recipe":
                    return noStore({ ...(await buyArmouryRecipe(buyer.id)), ...(await getArenaState(buyer.id)) });
                case "buy_armoury":
                    return noStore({ ...(await buyArmoury(buyer.id, String(b?.id || ""))), ...(await getArenaState(buyer.id)) });
                // The Purser's Exchange. purserExchange is the gate — it refuses anyone not wearing the
                // piece, so this route never has to know which item grants what.
                case "purser":
                    return noStore({ ...(await purserExchange(buyer.id, String(b?.from || ""), b?.amount)), ...(await getArenaState(buyer.id)) });
                case "arena_upgrade":
                    return noStore({ ...(await buyArenaUpgrade(buyer.id, String(b?.track || ""))), ...(await getArenaState(buyer.id)) });
                default: return noStore({ error: "bad_action" }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "arena.act.failure" });
        }
    });
}
