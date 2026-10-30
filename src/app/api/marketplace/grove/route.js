import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import {
    groveState, groveEnter, groveSettle, groveMove, groveCraft, groveCraftMany, groveRework, groveEquipEmblem, groveBelt, groveBoss, groveOpenChest,
    groveForgeArmour, groveWearArmour } from "@/lib/marketplace/grove.js";
import { turnInStatue } from "@/lib/marketplace/grove-statue-store.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init) => {
    const res = NextResponse.json(body, init);
    res.headers.set("Cache-Control", "no-store");
    return res;
};

// ── THE GROVE'S ONE DOOR ─────────────────────────────────────────────────────────────────────────────────────
// Five verbs, and that is deliberately ALL of them.
//
// ⚠️ THERE IS NO "I MOVED", NO "I SWUNG", NO "I WAS HIT". The scene runs entirely in the browser (see
// grove-roll.js for why) because a kill loop that talked to the server per event would be the most expensive
// feature in the game — round trips are Active CPU, which is the meter that bills. This endpoint is spoken to
// when you enter a zone, when you settle a burst of kills, and when a boss dies, and at no other time.
//
// The boss is the one kill that gets its own request, and it is worth the spend: at most one every thirty
// minutes per zone, in exchange for a cooldown and a clear-the-zone check that a batched claim could not be
// held to. See groveBoss.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/grove", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer(request);
            if (!buyer?.id) return noStore({ ok: false, error: "signed_out" }, { status: 401 });
            return noStore(await groveState(buyer.id));
        } catch (error) {
            return internalError(error, { event: "grove.state.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/grove", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer(request);
            if (!buyer?.id) return noStore({ ok: false, error: "signed_out" }, { status: 401 });
            const b = await request.json().catch(() => ({}));
            switch (b?.action) {
                // ⚠️ THE CHARM RIDES THE ENTER, it is not its own action. Choosing one and spending it
                // must be the same request: a two-step "select, then enter" leaves a charm marked as
                // chosen and never burned if the player closes the tab between them.
                case "enter": return noStore(await groveEnter(buyer.id, String(b.zone || ""), {
                    charm: b.charm ? { id: String(b.charm.id || ""), band: String(b.charm.band || "") } : null,
                }));
                case "settle": return noStore(await groveSettle(buyer.id, { zoneId: String(b.zone || ""), kills: b.kills, eaten: b.eaten }));
                case "boss": return noStore(await groveBoss(buyer.id, String(b.zone || "")));
                case "move": return noStore(await groveMove(buyer.id, b));
                // ⚠️ THE ACT RIDES THE CRAFT, exactly like the charm rides the enter. The two skill beats
                // are played before this fires and reported with it, so there is still ONE request per
                // craft — a begin/commit pair would double the round trips on the one screen a player
                // visits in bursts, and round trips are the meter that bills (see CLAUDE.md).
                case "craft": return noStore(await groveCraft(buyer.id, String(b.recipe || ""), {
                    temper: Boolean(b.temper),
                    act: b.act && typeof b.act === "object" ? b.act : null,
                    aim: b.aim,
                }));
                // ⚠️ NO `act` AND NO `aim`. Craft-all skips the skill beats, so it must not accept a
                // score for beats nobody played -- a client that could post a flawless act with a batch of
                // ten would be buying the top of the rack ten times for one request. See groveCraftMany.
                case "craftAll": return noStore(await groveCraftMany(buyer.id, String(b.recipe || ""), {
                    temper: Boolean(b.temper),
                    times: b.times,
                }));
                case "rework": return noStore(await groveRework(buyer.id, String(b.slot || "")));
                // The Grove's own chest line, never chests.js. See the note on the boss grant.
                case "openChest": return noStore(await groveOpenChest(buyer.id, String(b.tier || "")));
                case "forgeArmour": return noStore(await groveForgeArmour(buyer.id, String(b.piece || "")));
                case "wearArmour": return noStore(await groveWearArmour(buyer.id, String(b.piece || "")));
                case "emblem": return noStore(await groveEquipEmblem(buyer.id, b));
                // ⚠️ ONE STATUE PER CALL, matching the gesture. Luke: "you can turn them in by clicking the
                // associated statue. It fills a bar." A bulk endpoint would spend the first-crystal and
                // first-prismatic moments -- the actual reward of the whole system -- inside a loop nobody
                // sees. See turnInStatue.
                case "statue": return noStore(await turnInStatue(buyer.id, String(b?.stat || ""), String(b?.rarity || "regular")));
                case "belt": return noStore(await groveBelt(buyer.id, b.food ? String(b.food) : null));
                default: return noStore({ error: "bad_action" }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "grove.action.failure" });
        }
    });
}
