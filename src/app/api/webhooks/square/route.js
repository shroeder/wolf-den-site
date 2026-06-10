import { createHmac, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import {
    createMysteryWebhookEvent,
    runMysteryWebhookProcessing,
} from "@/lib/mystery-bags";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

function isValidSquareSignature({ signature, body, requestUrl }) {
    const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || "";

    if (!signature || !signatureKey || !requestUrl) {
        return false;
    }

    const expected = createHmac("sha256", signatureKey)
        .update(`${requestUrl}${body}`)
        .digest("base64");

    const providedBuffer = Buffer.from(signature, "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");

    if (providedBuffer.length !== expectedBuffer.length) {
        return false;
    }

    return timingSafeEqual(providedBuffer, expectedBuffer);
}

function tryParseJson(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function getProviderEventId(payload) {
    return payload?.event_id || payload?.eventId || payload?.id || payload?.data?.id || null;
}

function getEventType(payload) {
    return payload?.type || payload?.event_type || payload?.eventType || payload?.data?.type || null;
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/webhooks/square", async ({ logger, internalError }) => {
        const signature = request.headers.get("x-square-hmacsha256-signature") || "";
        const bodyText = await request.text();
        const requestUrl = request.url;
        const payload = tryParseJson(bodyText);

        if (!payload) {
            return NextResponse.json(
                {
                    error: "bad_request",
                    code: "bad_request",
                    message: "Invalid JSON payload.",
                },
                { status: 400 }
            );
        }

        const signatureValid = isValidSquareSignature({
            signature,
            body: bodyText,
            requestUrl,
        });

        if (!signatureValid) {
            return NextResponse.json(
                {
                    error: "invalid_webhook_signature",
                    code: "invalid_webhook_signature",
                    message: "Webhook signature verification failed.",
                },
                { status: 401 }
            );
        }

        try {
            const row = await createMysteryWebhookEvent({
                provider: "square",
                providerEventId: getProviderEventId(payload),
                eventType: getEventType(payload),
                idempotencyKey: getProviderEventId(payload)
                    ? `square:${getProviderEventId(payload)}`
                    : null,
                signatureValid: true,
                payload,
            });

            // Process inline (awaited) rather than fire-and-forget. On Vercel the function is
            // frozen once the response is returned, so setImmediate work never finished and the
            // card removal + Square variation cleanup silently never ran. This is fast (one order
            // fetch + a few writes + one delete) and stays well within Square's webhook timeout.
            const result = await runMysteryWebhookProcessing(row.id);

            logger.info("webhooks.square.processed", {
                eventId: row.id,
                status: result?.status || "unknown",
                processed: result?.processed ?? false,
                assignedCount: result?.assignedCount || 0,
            });

            return NextResponse.json(
                {
                    success: true,
                    eventId: row.id,
                    status: result?.status || "queued",
                    processed: result?.processed ?? false,
                },
                { status: 200 }
            );
        } catch (error) {
            return internalError(error, {
                event: "webhooks.square.enqueue.failure",
                eventType: getEventType(payload),
            });
        }
    });
}
