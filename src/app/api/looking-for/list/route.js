import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { withRequestLogging } from "@/lib/server-logger";
import {
    addWatchlistItem,
    getOrCreateWatcher,
    getWatchlist,
    removeWatchlistItem,
} from "@/lib/looking-for/watchers";

export const runtime = "nodejs";

function parseCardId(value) {
    const cardId = Number(value);

    return Number.isInteger(cardId) && cardId > 0 ? cardId : null;
}

async function buildListResponse(watcher) {
    const items = await getWatchlist(watcher.id);

    return {
        items,
        email: watcher.email || null,
        emailVerified: Boolean(watcher.email_verified),
    };
}

export async function GET(request) {
    return withRequestLogging(request, "GET /api/looking-for/list", async ({ internalError }) => {
        try {
            const cookieStore = await cookies();
            const watcher = await getOrCreateWatcher(cookieStore);

            return NextResponse.json(await buildListResponse(watcher));
        } catch (error) {
            return internalError(error, { event: "looking_for.list.get.failed" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/looking-for/list", async ({ internalError }) => {
        try {
            const body = await request.json().catch(() => null);
            const cardId = parseCardId(body?.cardId);

            if (!cardId) {
                return NextResponse.json({ error: "A valid cardId is required." }, { status: 400 });
            }

            const cookieStore = await cookies();
            const watcher = await getOrCreateWatcher(cookieStore);
            const result = await addWatchlistItem(watcher.id, cardId);

            if (result.status === "not_found") {
                return NextResponse.json({ error: "Card not found." }, { status: 404 });
            }

            return NextResponse.json(await buildListResponse(watcher), { status: 201 });
        } catch (error) {
            return internalError(error, { event: "looking_for.list.add.failed" });
        }
    });
}

export async function DELETE(request) {
    return withRequestLogging(request, "DELETE /api/looking-for/list", async ({ internalError }) => {
        try {
            const { searchParams } = new URL(request.url);
            const cardId = parseCardId(searchParams.get("cardId"));

            if (!cardId) {
                return NextResponse.json({ error: "A valid cardId is required." }, { status: 400 });
            }

            const cookieStore = await cookies();
            const watcher = await getOrCreateWatcher(cookieStore);

            await removeWatchlistItem(watcher.id, cardId);

            return NextResponse.json(await buildListResponse(watcher));
        } catch (error) {
            return internalError(error, { event: "looking_for.list.remove.failed" });
        }
    });
}
