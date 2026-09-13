import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import { captainsOpenTo } from "@/lib/marketplace/captains.js";
import { brigView, interrogateCaptive } from "@/lib/marketplace/captains-store.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) =>
    NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

// ⚠️ THE SECOND HALF OF THE PAIR. finishFleetBattle will not OFFER a captain to anybody this gate excludes;
// this stops one being acted on. Both are needed and neither is sufficient — a feature gated only at the door
// is a feature whose play path is open, and one gated only at the play path still advertises itself.
// See [[feature-gates-come-in-pairs]].
async function gate() {
    const buyer = await getAuthenticatedBuyer();
    if (!buyer) return { error: noStore({ error: "unauthorized" }, { status: 401 }) };
    if (!captainsOpenTo(isOwner(buyer.id))) return { error: noStore({ error: "not_found" }, { status: 404 }) };
    return { buyer };
}

export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/sailing/brig", async ({ internalError }) => {
        try {
            const g = await gate();
            if (g.error) return g.error;
            return noStore(await brigView(g.buyer.id));
        } catch (error) {
            return internalError(error, { event: "marketplace.brig.read.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/sailing/brig", async ({ internalError }) => {
        try {
            const g = await gate();
            if (g.error) return g.error;
            const body = await request.json().catch(() => ({}));
            const id = Number(body?.id) || 0;
            let res;
            // ⚠️ ONE ACTION. take / ransom / release / chart were the four verbs of a collection — buy him,
            // sell him back, let him go, spend three of him. There is one thing you do with a captain now and
            // this is it. See the note at the top of captains.js.
            switch (String(body?.action || "")) {
                case "ask": res = await interrogateCaptive(g.buyer.id, id, String(body?.tactic || "")); break;
                default: return noStore({ error: "bad_action" }, { status: 400 });
            }
            if (!res?.ok) return noStore(res || { error: "failed" }, { status: 400 });
            // The whole brig comes back with every action, because every action changes more than one thing
            // in it — breaking a man both empties a berth and adds a confession, and a screen that patched
            // only the row it tapped would be wrong about the other half.
            return noStore({ ...res, brig: await brigView(g.buyer.id) });
        } catch (error) {
            return internalError(error, { event: "marketplace.brig.act.failure" });
        }
    });
}
