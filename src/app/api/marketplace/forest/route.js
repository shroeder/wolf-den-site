import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { forestOpenTo } from "@/lib/marketplace/forest-gate.js";
import { fellTree, forestState, noteStreak, upgradeAxe } from "@/lib/marketplace/forest-store.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) =>
    NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

// ⚠️ THE SECOND HALF OF THE PAIR. The page will not render for anybody this gate excludes; this stops the
// forest being played by anybody who found the URL. Both are needed and neither is sufficient.
// See [[feature-gates-come-in-pairs]] and FOREST_PUBLIC.
async function gate() {
    const buyer = await getAuthenticatedBuyer();
    if (!buyer) return { error: noStore({ error: "unauthorized" }, { status: 401 }) };
    if (!forestOpenTo(buyer.id)) return { error: noStore({ error: "not_found" }, { status: 404 }) };
    return { buyer };
}

export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/forest", async ({ internalError }) => {
        try {
            const g = await gate();
            if (g.error) return g.error;
            return noStore(await forestState(g.buyer.id) || { error: "failed" });
        } catch (error) {
            return internalError(error, { event: "marketplace.forest.read.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/forest", async ({ internalError }) => {
        try {
            const g = await gate();
            if (g.error) return g.error;
            const body = await request.json().catch(() => ({}));
            switch (String(body?.action || "")) {
                case "fell": {
                    // ONE REQUEST A TREE, NOT ONE A TAP. See the note on fellTree: the browser runs the swing
                    // loop and posts only when something comes down.
                    const res = await fellTree(g.buyer.id, body.patch, body.swings);
                    if (body.streak) await noteStreak(g.buyer.id, body.streak).catch(() => {});
                    return res?.ok ? noStore(res) : noStore(res || { error: "failed" }, { status: 400 });
                }
                case "axe": {
                    const res = await upgradeAxe(g.buyer.id, String(body.track || ""));
                    return res?.ok ? noStore(res) : noStore(res || { error: "failed" }, { status: 400 });
                }
                default:
                    return noStore({ error: "bad_action" }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "marketplace.forest.act.failure" });
        }
    });
}
