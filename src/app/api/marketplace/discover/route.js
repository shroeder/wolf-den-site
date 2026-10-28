import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { discoverOpenFor } from "@/lib/marketplace/discover-gate.js";
import { DISCOVER_BUDGETS, DISCOVER_GAMES, discoverDeck } from "@/lib/marketplace/discover.js";
import { getProfile, setGameInterests } from "@/lib/marketplace/profile.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) =>
    NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

// Stage one of the rollout: owner only. See discover-gate.js — the condition is IMPORTED, never re-derived.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/discover", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer || !discoverOpenFor(buyer.id)) return noStore({ open: false }, { status: 403 });

            const url = new URL(request.url);
            const budget = url.searchParams.get("budget") || "any";
            const skipIds = (url.searchParams.get("skip") || "").split(",").map((s) => s.trim()).filter(Boolean);
            const qsGames = (url.searchParams.get("games") || "").split(",").map((s) => s.trim()).filter(Boolean);

            // ⚠️ THE QUIZ READS THE PROFILE IT WILL LATER WRITE. A member who already told us which games
            //    they follow is not asked again — the doc is explicit that the quiz is a shortcut, never a
            //    toll, and asking a question we already have the answer to is the fastest way to make it one.
            const profile = await getProfile(buyer.id).catch(() => null);
            const known = Array.isArray(profile?.gameInterests) ? profile.gameInterests : [];
            const games = qsGames.length ? qsGames : known;

            const items = await discoverDeck({ games, budget, skipIds });
            return noStore({
                open: true,
                items,
                games: DISCOVER_GAMES.map((g) => ({ key: g.key, label: g.label })),
                budgets: DISCOVER_BUDGETS.map((b) => ({ key: b.key, label: b.label })),
                // What we already knew, so the quiz can show itself as a confirmation rather than a prompt.
                knownGames: known,
                asked: games.length > 0,
            });
        } catch (error) {
            return internalError(error, { event: "discover.list.failure" });
        }
    });
}

// Persist the taste answers, so a second visit never asks again.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/discover", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer || !discoverOpenFor(buyer.id)) return noStore({ ok: false }, { status: 403 });

            const body = await request.json().catch(() => ({}));
            const games = Array.isArray(body?.games) ? body.games.filter(Boolean).slice(0, 8) : [];
            // ⚠️ WRITES THE PROFILE THE WHOLE SITE USES, not a Discover-only copy. The doc's §2 point: a
            //    parallel taste model would immediately disagree with product alerts and the profile page.
            await setGameInterests(buyer.id, games).catch(() => {});
            return noStore({ ok: true });
        } catch (error) {
            return internalError(error, { event: "discover.save.failure" });
        }
    });
}
