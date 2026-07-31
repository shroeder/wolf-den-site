import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { generateImage } from "@/lib/marketplace/openai-image.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PIG_PROMPT =
    "2D video-game farm pig sprite, full body, a cute chubby pink pig with a happy mischievous grin, mid-run " +
    "trotting pose, facing and looking toward the RIGHT side of the image, bold stylized illustration, clean " +
    "confident outlines, cel-shaded flat vibrant colors, strong readable silhouette, centered, polished RPG " +
    "game-art style. Transparent background, die-cut. NO crown, no hat, no accessories, no text, no logo, no " +
    "watermark, no border.";

// One-off: generate the Wild Loot Pig sprite (crown is overlaid separately in the UI). Returns the Blob URL to
// hardcode into FarmClient.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/loot-pig-sprite", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const url = await generateImage(PIG_PROMPT, { size: "1024x1024", quality: "low", pathPrefix: "marketplace/farm", resizeTo: 256, faceRight: true, meta: { origin: "admin", label: "Loot pig sprite" } });
            return NextResponse.json({ ok: Boolean(url), url }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.loot_pig_sprite.failure" });
        }
    });
}
