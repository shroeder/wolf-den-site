import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { mintTicket } from "@/lib/marketplace/rt-ticket.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (b, i) => NextResponse.json(b, {
    ...i,
    headers: { "Cache-Control": "no-store", ...(i?.headers || {}) },
});

// ── THE ONLY DOOR INTO THE REALTIME SERVER ───────────────────────────────────────────────────────────────────
// POST → a 60-second signed ticket for the member who is already signed in here.
//
// ⚠️ THE GAME SERVER DOES NOT GET ITS OWN ACCOUNTS. This is the whole point of the ticket: Den Quest players
// ARE Wolf Den members. There is one identity system, it lives here, and it already works -- sessions,
// password resets, email verification, bans. Standing up a second one would mean a second password to forget,
// a second account to ban, and two tables that disagree about who someone is.
//
// ⚠️ A BANNED BUYER GETS NOTHING. Checked here rather than in the game server, because this is where the ban
// lives and the game server is deliberately ignorant of everything except a signature.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/rt-ticket", async ({ internalError, log }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return noStore({ ok: false, error: "sign in first" }, { status: 401 });
            if (buyer.banned_at) return noStore({ ok: false, error: "account suspended" }, { status: 403 });

            let zone = "ashfall-1";
            try {
                const body = await request.json();
                if (body?.zone && /^[a-z0-9-]{1,32}$/.test(body.zone)) zone = body.zone;
            } catch { /* no body is fine; the default zone stands */ }

            const minted = await mintTicket(buyer.id, { zone });
            log?.info?.("rt_ticket.minted", { buyerId: buyer.id, zone });
            return noStore({ ok: true, ...minted, url: process.env.RT_PUBLIC_URL || null });
        } catch (error) {
            return internalError(error, { event: "rt_ticket.failure" });
        }
    });
}
