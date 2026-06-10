import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { listMysteryBagCards, upsertMysteryBagCard } from "@/lib/mystery-bags";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
const MYSTERY_CARD_ID_PATTERN = /^MP-[A-Z0-9]+-[A-Z0-9]+$/;

function normalizePayload(body) {
    return {
        cardId: typeof body?.cardId === "string" ? body.cardId.trim() : "",
        squareVariationId: typeof body?.squareVariationId === "string" ? body.squareVariationId.trim() : "",
        variationSku: typeof body?.variationSku === "string" ? body.variationSku.trim() : "",
        name: typeof body?.name === "string" ? body.name.trim() : "",
        set: typeof body?.set === "string" ? body.set.trim() : "",
        number: typeof body?.number === "string" ? body.number.trim() : "",
        marketValue: body?.marketValue,
        imageUrl: typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "",
    };
}

function validatePayload(payload) {
    if (!payload.cardId || !payload.name || !payload.set || !payload.number || payload.marketValue === undefined) {
        return "missing_required_fields";
    }

    if (!MYSTERY_CARD_ID_PATTERN.test(payload.cardId)) {
        return "invalid_card_id";
    }

    if (!payload.variationSku) {
        return "missing_variation_sku";
    }

    if (payload.squareVariationId && payload.cardId === payload.squareVariationId) {
        return "identity_conflict_card_id_equals_square_variation_id";
    }

    const marketValue = Number(payload.marketValue);

    if (!Number.isFinite(marketValue) || marketValue < 0 || marketValue > 1000000) {
        return "invalid_market_value";
    }

    payload.marketValue = Number(marketValue.toFixed(2));

    if (payload.imageUrl) {
        try {
            const parsed = new URL(payload.imageUrl);

            if (!["https:", "http:"].includes(parsed.protocol)) {
                return "invalid_image_url";
            }
        } catch {
            return "invalid_image_url";
        }
    } else {
        payload.imageUrl = null;
    }

    payload.squareVariationId = payload.squareVariationId || null;
    payload.variationSku = payload.variationSku || null;

    return null;
}

export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/mystery-bags", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);

        if (authError) {
            return authError;
        }

        try {
            const cards = await listMysteryBagCards();

            logger.info("admin.mystery_bags.list.success", {
                count: cards.length,
            });

            return NextResponse.json(
                { cards },
                {
                    headers: {
                        "Cache-Control": "no-store",
                    },
                }
            );
        } catch (error) {
            return internalError(error, {
                event: "admin.mystery_bags.list.failure",
            });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/mystery-bags", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);

        if (authError) {
            return authError;
        }

        let body;

        try {
            body = await request.json();
        } catch {
            logger.warn("admin.mystery_bags.create.invalid_json");

            return NextResponse.json({ error: "invalid_json" }, { status: 400 });
        }

        const payload = normalizePayload(body);
        const payloadError = validatePayload(payload);

        if (payloadError) {
            logger.warn("admin.mystery_bags.create.validation_failure", {
                reason: payloadError,
                cardId: payload.cardId || null,
            });

            return NextResponse.json({ error: payloadError }, { status: 400 });
        }

        try {
            const card = await upsertMysteryBagCard(payload);
            revalidatePath("/mystery-bags");
            revalidatePath("/api/mystery-bags");

            logger.info("admin.mystery_bags.create.success", {
                cardId: card.cardId,
                id: card.id,
                marketValue: card.marketValue,
            });

            return NextResponse.json(
                {
                    success: true,
                    card,
                },
                { status: 201 }
            );
        } catch (error) {
            return internalError(error, {
                event: "admin.mystery_bags.create.failure",
                cardId: payload.cardId,
            });
        }
    });
}
