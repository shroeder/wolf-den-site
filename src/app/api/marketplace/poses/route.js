import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { poseShelf, equipPose, buyPose } from "@/lib/marketplace/pose-shelf.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) =>
    NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

// ── THE POSE SHELF ──────────────────────────────────────────────────────────────────────────────────────────
// Read it, wear one, buy one. Three verbs against one lib, because every rule about what a member owns and
// what it costs lives in pose-shelf.js — a route that re-decided any of that would be a second answer.
//
// ⚠️ THE REPLY TO A WRITE IS THE WHOLE SHELF, NOT AN ACKNOWLEDGEMENT. Buying a pose changes the balance,
// the owned set and what is worn, all at once; handing back {ok:true} would make the screen patch three
// things from memory and drift from the server the first time one of them failed.
export async function GET() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) return noStore({ error: "Sign in." }, { status: 401 });
    return noStore(await poseShelf(buyer.id));
}

export async function POST(request) {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) return noStore({ error: "Sign in." }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const id = String(body?.pose || "");
    // ⚠️ THE ACTION IS NAMED, NOT INFERRED FROM THE SHAPE. "buy" and "equip" differ by one word and one of
    // them spends money; a route that guessed which you meant would eventually guess wrong on the paid one.
    const res = body?.action === "buy" ? await buyPose(buyer.id, id)
        : body?.action === "equip" ? await equipPose(buyer.id, id)
            : { ok: false, error: "unknown_action" };

    if (!res.ok) return noStore({ ...res, ...(await poseShelf(buyer.id)) }, { status: 400 });
    return noStore({ ...res, ...(await poseShelf(buyer.id)) });
}
