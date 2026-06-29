import { NextResponse } from "next/server";

import { listAvailableGames } from "@/lib/marketplace/search.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Public: the games that currently have catalog data, for rendering dynamic game filters.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/games", async ({ logger, internalError }) => {
        try {
            const games = await listAvailableGames();

            logger.info("marketplace.games.success", { count: games.length });

            return NextResponse.json(
                { games },
                { headers: { "Cache-Control": "public, max-age=300" } }
            );
        } catch (error) {
            return internalError(error, { event: "marketplace.games.failure" });
        }
    });
}
