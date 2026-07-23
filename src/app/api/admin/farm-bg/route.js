import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { generateSceneImage } from "@/lib/marketplace/openai-image.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const SKY = {
    day: "a bright blue midday sky with a few soft white clouds and warm sunlight",
    dusk: "a glowing golden-orange sunset sky with long warm dusk light and purple clouds",
    night: "a deep indigo starry night sky with a bright moon and cool blue moonlight",
    dawn: "a soft pink and peach sunrise sky with gentle early-morning light and low mist",
};
const buildPrompt = (tod) =>
    `A cozy 2D game farm background in a wide side-scrolling horizontal composition. Foreground: a lush green grassy pasture. ` +
    `Midground: a simple wooden post-and-rail fence running along the horizon. Background: gentle rolling hills, a distant red barn and a windmill, a few trees. Sky: ${SKY[tod] || SKY.day}. ` +
    `Painterly cel-shaded fantasy RPG game-art style, warm and inviting, soft depth. NO characters, NO animals, NO people, NO text, NO UI, NO watermark, NO border. ` +
    `The left and right thirds should look similar and uncluttered so the scene tiles cleanly when repeated.`;

// One-off: generate a farm backdrop for a time of day. Body { tod: "day"|"dusk"|"night"|"dawn" }. Returns the
// Blob URL to hardcode into FarmClient (mirror-tiled behind the pets, like the sailing sky).
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/farm-bg", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            const tod = ["day", "dusk", "night", "dawn"].includes(body?.tod) ? body.tod : "day";
            const url = await generateSceneImage(buildPrompt(tod), { pathPrefix: "marketplace/farm-bg" });
            return NextResponse.json({ ok: Boolean(url), tod, url }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.farm_bg.failure" });
        }
    });
}
