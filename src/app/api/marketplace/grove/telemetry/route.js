import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── THE GROVE SAYS WHAT IT IS DOING ─────────────────────────────────────────────────────────────────────────
// Luke, 2026-11-15: "we need telemetry and insight in the admin app for the grove feature".
//
// ⚠️ WHY NOT /api/client-error. That endpoint records a CRASH: one row when something already went wrong,
// and a push to the phone. It cannot answer "is this normal" because it only ever sees the abnormal. The
// Coliseum freeze cost a day for exactly that reason — there was no record of a healthy run to compare a
// broken one against, so every theory was unfalsifiable until the frame numbers finally landed in a bark.
//
// This is the opposite: it records ORDINARY moments too. A dive that ended, a run that ended, and — the one
// that matters most — a frame that threw.
//
// ⚠️ NO PUSH, EVER. A notification per Grove event would make the phone useless inside an hour, and the
// whole lesson of the last two days is that a channel which cries wolf is a channel nobody reads. Insight
// lives on a screen you choose to open.
//
// Fire-and-forget by design: the client posts with keepalive and never waits, so a slow write must not be
// able to stutter a frame.
const KINDS = new Set(["scene_throw", "run_end", "dive_end", "stall"]);

const int = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(-1, Math.min(1_000_000, Math.round(n))) : null;
};

export async function POST(request) {
    try {
        const body = await request.json().catch(() => ({}));
        const kind = String(body?.kind || "");
        // An unknown kind is dropped rather than stored. This table is read by a dashboard that groups by
        // kind, and one typo'd value becomes a permanent extra row in every chart.
        if (!KINDS.has(kind)) return NextResponse.json({ ok: true });

        const buyer = await getAuthenticatedBuyer().catch(() => null);

        await db.query(
            `INSERT INTO mkt_grove_telemetry
                (buyer_id, kind, zone, arena, wave, foes, worst_frame_ms, slow_frames, message, stack, device, meta)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
                buyer?.id || null,
                kind,
                int(body?.zone),
                Boolean(body?.arena),
                int(body?.wave),
                int(body?.foes),
                int(body?.worstFrameMs),
                int(body?.slowFrames),
                body?.message ? String(body.message).slice(0, 300) : null,
                body?.stack ? String(body.stack).slice(0, 1200) : null,
                body?.device ? String(body.device).slice(0, 60) : null,
                body?.meta ? JSON.stringify(body.meta).slice(0, 2000) : null,
            ],
        ).catch(() => { /* telemetry must never surface as a failure to the player */ });

        return NextResponse.json({ ok: true });
    } catch {
        // Same rule as /api/client-error: a reporting endpoint that errors is a second bug on top of the one
        // it was trying to describe.
        return NextResponse.json({ ok: true });
    }
}
