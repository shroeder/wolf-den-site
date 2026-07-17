import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { CHEST_TIERS, CHEST_ORDER } from "@/lib/marketplace/chests.js";
import { CHEST_ART_TIERS, generateChestArt, getChestArt } from "@/lib/marketplace/chest-art.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120; // AI image generation can take a while

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// The four tiers with their current AI art (label/emoji for the admin UI).
async function tiersWithArt() {
    const art = await getChestArt().catch(() => ({}));
    return CHEST_ORDER.map((t) => ({
        tier: t,
        label: CHEST_TIERS[t].label,
        emoji: CHEST_TIERS[t].emoji,
        color: CHEST_TIERS[t].color,
        image: art[t] || null,
    }));
}

// GET current chest art for all tiers.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/chest-art", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            return noStore({ tiers: await tiersWithArt() });
        } catch (error) {
            return internalError(error, { event: "admin.chest-art.list.failure" });
        }
    });
}

// POST { tier | "all" } — generate (regenerate) chest art. Returns the updated tier list.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/chest-art", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            const tier = String(body?.tier || "");
            const targets = tier === "all" || !tier ? CHEST_ART_TIERS : [tier];
            for (const t of targets) {
                if (!CHEST_ART_TIERS.includes(t)) return noStore({ error: "unknown_tier" }, { status: 400 });
            }
            for (const t of targets) await generateChestArt(t);
            return noStore({ tiers: await tiersWithArt() });
        } catch (error) {
            if (error?.message && !/database|query/i.test(error.message)) return noStore({ error: error.message }, { status: 400 });
            return internalError(error, { event: "admin.chest-art.generate.failure" });
        }
    });
}
