import { NextResponse } from "next/server";

import { listSetsForGame, normalizeGame } from "@/lib/looking-for/catalog";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function GET(request) {
    return withRequestLogging(request, "GET /api/looking-for/sets", async ({ internalError }) => {
        try {
            const { searchParams } = new URL(request.url);
            const game = normalizeGame(searchParams.get("game"));

            if (!game) {
                return NextResponse.json({ error: "Unsupported game." }, { status: 400 });
            }

            const sets = await listSetsForGame(game);

            return NextResponse.json({ sets });
        } catch (error) {
            return internalError(error, { event: "looking_for.sets.failed" });
        }
    });
}
