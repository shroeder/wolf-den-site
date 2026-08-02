import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { isPrimaryOwner } from "@/lib/marketplace/owner.js";
import { buyMerchantChest, gambleMerchantGear, contributeTownProject, getTownState, getTownTodo, moveTown, sendTownChat, setTownEventsLive, setTownTyping } from "@/lib/marketplace/town.js";
import { attackTownEvent, spawnTownEvent, duelRaidEnemy, bossRaidStrike, endTownEvent, markRaidRecapSeen } from "@/lib/marketplace/town-events.js";
import { claimTownQuest } from "@/lib/marketplace/town-quests.js";
import { claimWishingWell } from "@/lib/marketplace/town-projects.js";
import { claimShiny } from "@/lib/marketplace/town-shiny.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — the town state (you + nearby players + buildings). Owner-gated during the build.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/town", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ signedIn: false, owner: false }, { headers: { "Cache-Control": "no-store" } });
            // ?todo=1 — the nav pill's four counts only. The nav asks on every page for every member, and the
            // full town state renders rosters, art, projects and chat; running all of that for a badge would
            // cost more than the screen the badge points at.
            if (new URL(request.url).searchParams.get("todo")) {
                return NextResponse.json({ todo: await getTownTodo(buyer.id) }, { headers: { "Cache-Control": "no-store" } });
            }
            return NextResponse.json(await getTownState(buyer.id), { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.town.state.failure" });
        }
    });
}

// POST — walk ({ x, y, facing }), chat ({ action:"chat", body }), or typing ({ action:"typing" }).
// Owner-gated during the build.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/town", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
            const body = await request.json().catch(() => ({}));
            let res;
            if (body?.action === "chat") res = await sendTownChat(buyer.id, body?.body);
            else if (body?.action === "typing") res = await setTownTyping(buyer.id);
            else if (body?.action === "project_contribute") res = await contributeTownProject(buyer.id, body?.projectId, body?.amount);
            else if (body?.action === "attack") res = await attackTownEvent(buyer.id, body?.eventId, body?.move);
            else if (body?.action === "duel") res = await duelRaidEnemy(buyer.id, body?.eventId, body?.enemyId, body?.dist);
            // `dist` is the swing's distance from the timing bar's centre (0 = dead centre). Graded server-side.
            else if (body?.action === "boss_strike") res = await bossRaidStrike(buyer.id, body?.eventId, body?.dist);
            else if (body?.action === "recap_seen") res = await markRaidRecapSeen(buyer.id, body?.eventId);
            else if (body?.action === "merchant_buy") res = await buyMerchantChest(buyer.id, body?.tier);
            else if (body?.action === "merchant_gamble") res = await gambleMerchantGear(buyer.id);
            else if (body?.action === "quest_claim") res = await claimTownQuest(buyer.id, body?.key);
            else if (body?.action === "well_claim") res = await claimWishingWell(buyer.id);
            else if (body?.action === "claim_shiny") res = await claimShiny(buyer.id, body?.shinyId);
            // Raid controls are PRIMARY-OWNER only (Luke) — a co-owner must not be able to fire a raid at the
            // whole membership. The in-Town spawn is now a REAL surprise drop: full HP + push everyone.
            else if (body?.action === "spawn_event") res = isPrimaryOwner(buyer.id) ? await spawnTownEvent(body?.kind || "bandit_raid") : { ok: false, error: "forbidden" };
            else if (body?.action === "end_event") res = isPrimaryOwner(buyer.id) ? await endTownEvent() : { ok: false, error: "forbidden" };
            else if (body?.action === "set_events_live") res = isPrimaryOwner(buyer.id) ? await setTownEventsLive(buyer.id, Boolean(body?.on)) : { ok: false, error: "forbidden" };
            else res = await moveTown(buyer.id, { x: body?.x, y: body?.y, facing: body?.facing });
            if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.error === "forbidden" ? 403 : 400 });
            return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.town.action.failure" });
        }
    });
}
