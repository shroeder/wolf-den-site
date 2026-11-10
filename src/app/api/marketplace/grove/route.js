import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import {
    groveState, groveEnter, groveSettle,
    groveBoss } from "@/lib/marketplace/grove.js";
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
                // ✂️ `move` went with the bank it moved parts into.
                // ✂️ craft, craftAll AND rework ARE GONE, 2026-11-08. Luke: "remove crafting all
                // together." The three cases are deleted rather than left returning an error, because a
                // route that still ACCEPTS an action it no longer honours is the shape the tempering
                // removal warned about: "a flag the UI no longer sends but the server still honours is
                // an exploit waiting to be found." An unknown action falls through to bad_action.
                // The Grove's own chest line, never chests.js. See the note on the boss grant.
                // ⚠️ ONE STATUE PER CALL, matching the gesture. Luke: "you can turn them in by clicking the
                // associated statue. It fills a bar." A bulk endpoint would spend the first-crystal and
                // first-prismatic moments -- the actual reward of the whole system -- inside a loop nobody
                // sees. See turnInStatue.
                case "statue": return noStore(await turnInStatue(buyer.id, String(b?.stat || ""), String(b?.rarity || "regular")));
                // ✂️ case "belt" WAS HERE. The belt went on 2026-11-09; an old tab still sending
                // this now falls through to the unknown-action branch, which is the right answer.
                default: return noStore({ error: "bad_action" }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "grove.action.failure" });
        }
    });
}
