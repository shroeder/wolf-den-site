import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { hasAnswered, openPoll, pollForClient, savePollAnswers } from "@/lib/marketplace/polls.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) =>
    NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

// GET  — should this member be asked, and what is the question?
// POST — record their answers (one row per member per question; answering again overwrites).
//
// The poll rides along on the GET so the modal never keeps its own copy of the choices — one source of truth
// for the ids that end up in the database, which is the same rule the survey route follows.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/poll", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return noStore({ ask: false });
            const poll = openPoll();
            if (!poll) return noStore({ ask: false });
            const answered = await hasAnswered(buyer.id, poll);
            return noStore({ ask: !answered, poll: answered ? null : pollForClient(poll) });
        } catch (error) {
            return internalError(error, { event: "marketplace.poll.get.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/poll", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return noStore({ error: "unauthorized" }, { status: 401 });
            const b = await request.json().catch(() => ({}));
            const res = await savePollAnswers(buyer.id, String(b?.pollId || ""), b?.answers || {}, b?.note);
            if (!res.ok) return noStore(res, { status: 400 });
            return noStore(res);
        } catch (error) {
            return internalError(error, { event: "marketplace.poll.post.failure" });
        }
    });
}
