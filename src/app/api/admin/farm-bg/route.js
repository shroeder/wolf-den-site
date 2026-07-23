import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { generateSceneImage } from "@/lib/marketplace/openai-image.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

// Each variant = the sky/ground description. Ground defaults to green grass; snow overrides it.
const VARIANT = {
    day: { sky: "a bright blue midday sky with a few soft white clouds and warm sunlight" },
    dusk: { sky: "a glowing golden-orange sunset sky with long warm dusk light and purple clouds" },
    night: { sky: "a deep indigo starry night sky with a bright moon and cool blue moonlight" },
    dawn: { sky: "a soft pink and peach sunrise sky with gentle early-morning light and low mist" },
    storm: { sky: "a dark, heavy, dramatic storm sky with thick grey-blue clouds and a moody overcast gloom" },
    snow: { sky: "a soft pale grey overcast winter sky with gently falling snow", ground: "a snow-covered white winter pasture with snow dusting the fence and hills, and bare frosted trees" },
};
const buildPrompt = (v) => {
    const cfg = VARIANT[v] || VARIANT.day;
    const ground = cfg.ground || "a lush green grassy pasture";
    return (
        `A cozy 2D game farm background in a wide side-scrolling horizontal composition. Foreground: ${ground}. ` +
        `Midground: a simple wooden post-and-rail fence running the full width along the horizon. ` +
        `Sky: ${cfg.sky}. Painterly cel-shaded fantasy RPG game-art style, warm and inviting, soft depth. ` +
        `IMPORTANT for seamless tiling: put ALL distinct features (a red barn, a windmill, a big tree) ONLY in the CENTER third. ` +
        `The far LEFT and far RIGHT edges must be PLAIN — only gentle rolling hills, sky, grass and the fence — with NO trees, barn, windmill, bushes or any distinct object near either edge. ` +
        `NO characters, NO animals, NO people, NO text, NO UI, NO watermark, NO border.`
    );
};

// One-off: generate a farm backdrop. Body { variant: "day"|"dusk"|"night"|"dawn"|"storm"|"snow" } (or legacy
// { tod }). Returns the Blob URL to hardcode into FarmClient (mirror-tiled behind the pets, like the sailing sky).
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/farm-bg", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            const key = body?.variant || body?.tod;
            const variant = VARIANT[key] ? key : "day";
            const url = await generateSceneImage(buildPrompt(variant), { pathPrefix: "marketplace/farm-bg" });
            return NextResponse.json({ ok: Boolean(url), variant, url }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.farm_bg.failure" });
        }
    });
}
