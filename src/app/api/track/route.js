import { NextResponse } from "next/server";
import { after } from "next/server";

import { recordEngagement } from "@/lib/marketplace/engagement.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Site-wide page-view beacon. The client posts { path, vid } on each navigation; we log it as a
// 'pageview' engagement event (fire-and-forget, never blocks). Public — it's anonymous telemetry.
export async function POST(request) {
    try {
        const body = await request.json().catch(() => null);
        const path = typeof body?.path === "string" ? body.path.slice(0, 200) : null;
        const vid = typeof body?.vid === "string" ? body.vid.slice(0, 80) : null;
        if (path) {
            after(() => recordEngagement("pageview", { path, vid }));
        }
    } catch {
        // ignore — telemetry must never error a request
    }
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
