import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { hasPower } from "@/lib/marketplace/ascension-powers.js";
import { getActiveTownEvent } from "@/lib/marketplace/town-events.js";
import { swarmState } from "@/lib/marketplace/town-swarm.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── THE MUSTER ───────────────────────────────────────────────────────────────────────────────────────────────
// "You may fight in a town raid from anywhere. You need not be stood in the plaza."
//
// The raid was never gated on presence in the SERVER — duelRaidEnemy and bossRaidStrike are plain calls that
// check nothing about where you are. What actually held people to the plaza is that the only client that can
// draw a foe and let you tap it is the Town page. So the power is wired the way the constraint really works:
// this endpoint hands the raid's foes to a small panel that rides on every page.
//
// Deliberately NARROW compared with GET /town. That route renders rosters, art, chat, projects and presence,
// and it is already the highest-volume request in the app; a floating panel polling it from every page would
// multiply the most expensive query in the game by every page a member visits. This returns the raid and
// nothing else, and returns `{ live: false }` in one query for the ~99% of the time no raid is running.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/muster", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ live: false }, { headers: { "Cache-Control": "no-store" } });
            // Called with NO buyer id on purpose. Passed one, getActiveTownEvent accrues the siege's passive
            // "presence = damage" tick — and that tick means "this member is stood in the square", which is
            // precisely the thing this panel is not. Muster lets you swing from anywhere; it does not make
            // standing anywhere count as standing in the plaza.
            const ev = await getActiveTownEvent().catch(() => null);
            if (!ev) return NextResponse.json({ live: false }, { headers: { "Cache-Control": "no-store" } });
            // The power is checked AFTER the raid, so the cheap "is anything happening" query short-circuits
            // first for everyone not wearing the piece too.
            if (!(await hasPower(buyer.id, "muster"))) {
                return NextResponse.json({ live: false }, { headers: { "Cache-Control": "no-store" } });
            }
            const swarm = ev.boss ? null : await swarmState(ev.id, buyer.id, ev.kind).catch(() => null);
            return NextResponse.json({
                live: true,
                event: { id: ev.id, kind: ev.kind, name: ev.name, emoji: ev.emoji, boss: ev.boss, hpPct: ev.hpPct, endsAt: ev.endsAt, myDamage: ev.myDamage },
                wave: swarm?.wave || null,
                enemies: (swarm?.enemies || []).filter((e) => e.takeable),
            }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.muster.state.failure" });
        }
    });
}
