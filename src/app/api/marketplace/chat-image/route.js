import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { canPostImage } from "@/lib/marketplace/town.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── A SCREENSHOT, ON ITS WAY INTO THE TESTING ROOM ───────────────────────────────────────────────────────────
// Luke: "for the tester channel, allow them to upload images as part of their messages. you and I will use
// that to iterate and fix."
//
// ⚠️ THE MEMBERSHIP IS CHECKED HERE, BEFORE THE BLOB STORE IS TOUCHED, and not only where the file picker is
// drawn. A picker that only renders for the testing room is a hidden door; this endpoint takes a POST from
// anybody with a session. Uploading is the expensive half — it costs storage and it is the half a stranger
// would want — so it is gated on the same list the room itself is: channelsFor, the earned roles, server-side.
//
// The write is checked AGAIN in sendTownChat against the channel the message actually lands in, because these
// are two requests and the second one carries a URL somebody could have kept. Two gates, because the upload
// and the post are separate acts and either one alone is a hole.
const MAX_BYTES = 4 * 1024 * 1024;
// A Vercel function body caps out around 4.5MB — see the admin app's proxy note, which learned this the hard
// way. Four is under it with room for the multipart wrapper, and a phone screenshot is 200-600KB.
const OK_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/chat-image", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ ok: false, error: "not_signed_in" }, { status: 401 });

            const form = await request.formData().catch(() => null);
            const channel = String(form?.get("channel") || "");
            if (!canPostImage(channel)) {
                return NextResponse.json({ ok: false, error: "no_images_here" }, { status: 400 });
            }
            const { standingFor, channelsFor } = await import("@/lib/marketplace/roles.js");
            const { roles } = await standingFor(buyer.id);
            if (!channelsFor(buyer.id, roles).includes(channel)) {
                return NextResponse.json({ ok: false, error: "not_in_channel" }, { status: 403 });
            }

            const file = form.get("file");
            if (!file || typeof file === "string") {
                return NextResponse.json({ ok: false, error: "no_file" }, { status: 400 });
            }
            if (!OK_TYPES.has(file.type)) {
                return NextResponse.json({ ok: false, error: "not_an_image" }, { status: 400 });
            }
            if (file.size > MAX_BYTES) {
                return NextResponse.json({ ok: false, error: "too_big" }, { status: 400 });
            }

            // The buyer id is in the path so a stray file can always be traced back to whoever sent it, and
            // addRandomSuffix means two people uploading screenshot.png do not overwrite each other.
            const ext = (file.type.split("/")[1] || "png").replace("jpeg", "jpg");
            const blob = await put(`marketplace/chat/${channel}/${buyer.id}.${ext}`, file, {
                access: "public",
                addRandomSuffix: true,
                contentType: file.type,
            });
            return NextResponse.json({ ok: true, url: blob.url });
        } catch (error) {
            return internalError(error, { event: "marketplace.chat_image.failure" });
        }
    });
}
