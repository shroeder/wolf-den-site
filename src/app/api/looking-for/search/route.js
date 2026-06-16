import { NextResponse } from "next/server";

import { getFeaturedCards, normalizeGame, searchCards } from "@/lib/looking-for/catalog";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function GET(request) {
    return withRequestLogging(request, "GET /api/looking-for/search", async ({ internalError }) => {
        try {
            const { searchParams } = new URL(request.url);
            const game = normalizeGame(searchParams.get("game"));

            if (!game) {
                return NextResponse.json({ error: "Unsupported game." }, { status: 400 });
            }

            const query = searchParams.get("q") || "";
            const setIdRaw = Number(searchParams.get("set"));
            const setId = Number.isInteger(setIdRaw) && setIdRaw > 0 ? setIdRaw : null;

            // Empty/short query with no explicit set -> show featured cards instead of nothing.
            const isFeatured = !setId && query.trim().length < 2;
            const results = isFeatured
                ? await getFeaturedCards(game)
                : await searchCards({ game, query, setId });

            return NextResponse.json({ results, featured: isFeatured });
        } catch (error) {
            return internalError(error, { event: "looking_for.search.failed" });
        }
    });
}
