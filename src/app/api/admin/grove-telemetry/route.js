import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { db } from "@/lib/db";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── IS THE GROVE HEALTHY RIGHT NOW? ─────────────────────────────────────────────────────────────────────────
// Luke, 2026-11-15: "we need telemetry and insight in the admin app for the grove feature". For the admin
// app's Grove screen.
//
// ⚠️ IT ANSWERS "IS THIS NORMAL", WHICH IS THE QUESTION THE CRASHES SCREEN CANNOT ASK. Crashes shows what
// broke. This shows what USUALLY happens, so a break is visible as a departure from it — the Coliseum freeze
// took a day to find because nobody could see that every arena stall was wave 12 while healthy runs ended
// anywhere.
//
// Six panels, in the order a person actually asks them:
//   1. throws      — a frame that threw. ANY row here is a bug; the list is the triage queue.
//   2. runs        — Coliseum runs by the wave they ended on. A spike at one wave is a bug at that wave.
//   3. frames      — worst frame time, bucketed. How it actually feels on the devices people own.
//   4. devices     — the same, by hardware, because "fine on my machine" is not evidence.
//   5. players     — who is in there, how deep, how long.
//   6. stalls      — the loop going silent, with what was on screen.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/grove-telemetry", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        const hours = Math.max(1, Math.min(720, Number(new URL(request.url).searchParams.get("hours")) || 48));
        const since = `${hours} hours`;
        try {
            const [throws, runs, frames, devices, players, stalls, totals] = await Promise.all([
                // ⚠️ GROUPED BY MESSAGE. One broken frame throws sixty times a second; ungrouped, the first
                // throw of a second, different bug is a thousand rows down.
                db.query(
                    `SELECT t.message, COUNT(*) AS n, COUNT(DISTINCT t.buyer_id) AS members,
                            MAX(t.created_at) AS last, MIN(t.stack) AS stack,
                            MAX(t.wave) AS wave, BOOL_OR(t.arena) AS arena
                       FROM mkt_grove_telemetry t
                      WHERE t.kind = 'scene_throw' AND t.created_at > NOW() - $1::interval
                      GROUP BY t.message ORDER BY n DESC LIMIT 20`, [since]).catch(() => []),
                db.query(
                    `SELECT wave, COUNT(*) AS n FROM mkt_grove_telemetry
                      WHERE kind = 'run_end' AND arena AND created_at > NOW() - $1::interval
                      GROUP BY wave ORDER BY wave`, [since]).catch(() => []),
                // Buckets, not an average: one 8-second frame and ninety-nine good ones averages to "fine".
                db.query(
                    `SELECT CASE WHEN worst_frame_ms < 50 THEN 'under 50ms'
                                 WHEN worst_frame_ms < 120 THEN '50-120ms'
                                 WHEN worst_frame_ms < 400 THEN '120-400ms'
                                 WHEN worst_frame_ms < 1000 THEN '0.4-1s'
                                 ELSE 'over 1s' END AS bucket,
                            COUNT(*) AS n
                       FROM mkt_grove_telemetry
                      WHERE worst_frame_ms IS NOT NULL AND created_at > NOW() - $1::interval
                      GROUP BY 1 ORDER BY MIN(worst_frame_ms)`, [since]).catch(() => []),
                db.query(
                    `SELECT device, COUNT(*) AS n, MAX(worst_frame_ms) AS worst,
                            ROUND(AVG(worst_frame_ms)) AS avg_worst
                       FROM mkt_grove_telemetry
                      WHERE device IS NOT NULL AND created_at > NOW() - $1::interval
                      GROUP BY device ORDER BY worst DESC NULLS LAST LIMIT 15`, [since]).catch(() => []),
                db.query(
                    `SELECT COALESCE(b.display_name, b.alias, '?') AS who,
                            MAX(p.unlocked_n) AS zone,
                            COUNT(t.id) FILTER (WHERE t.kind = 'dive_end') AS dives,
                            COUNT(t.id) FILTER (WHERE t.kind = 'run_end') AS runs,
                            COUNT(t.id) FILTER (WHERE t.kind = 'scene_throw') AS throws
                       FROM mkt_grove_player p
                       JOIN mkt_buyer b ON b.id = p.buyer_id
                       LEFT JOIN mkt_grove_telemetry t
                              ON t.buyer_id = p.buyer_id AND t.created_at > NOW() - $1::interval
                      GROUP BY 1 ORDER BY zone DESC NULLS LAST LIMIT 25`, [since]).catch(() => []),
                db.query(
                    `SELECT e.created_at, e.message, e.stack,
                            COALESCE(b.display_name, b.alias, '?') AS who
                       FROM mkt_client_error e LEFT JOIN mkt_buyer b ON b.id = e.buyer_id
                      WHERE e.message LIKE '%scene loop silent%' AND e.created_at > NOW() - $1::interval
                      ORDER BY e.created_at DESC LIMIT 25`, [since]).catch(() => []),
                db.queryOne(
                    `SELECT (SELECT COUNT(*) FROM mkt_grove_player)                                   AS players_ever,
                            (SELECT COUNT(*) FROM mkt_grove_player WHERE created_at > NOW() - $1::interval) AS players_new,
                            (SELECT COUNT(*) FROM mkt_grove_telemetry WHERE kind='scene_throw' AND created_at > NOW() - $1::interval) AS throws,
                            (SELECT COUNT(*) FROM mkt_client_error WHERE message LIKE '%scene loop silent%' AND created_at > NOW() - $1::interval) AS stalls`,
                    [since]).catch(() => null),
            ]);

            return NextResponse.json({
                hours,
                totals: totals || {},
                throws, runs, frames, devices, players, stalls,
            });
        } catch (error) {
            return internalError(error, "Could not read Grove telemetry.");
        }
    });
}
