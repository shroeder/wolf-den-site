import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { createMysterySoldEvent, listMysterySoldCards } from "@/lib/mystery-bags";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/mystery-bags/sold-events", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "mystery.manage", logger);

        if (authError) {
            return authError;
        }

        try {
            const cards = await listMysterySoldCards();
            const marketValueTotal = cards.reduce((sum, card) => sum + (Number(card.marketValue) || 0), 0);

            return NextResponse.json({
                summary: {
                    soldCardCount: cards.length,
                    marketValueTotal: Math.round(marketValueTotal * 100) / 100,
                },
                cards,
            });
        } catch (error) {
            return internalError(error, {
                event: "admin.mystery_bags.sold_events.list_failure",
            });
        }
    });
}

function normalizeSoldEventPayload(body = {}) {
    return {
        idempotencyKey: typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim() : "",
        source: typeof body?.source === "string" ? body.source.trim() : "manual",
        soldAt: typeof body?.soldAt === "string" ? body.soldAt.trim() : null,
        quantity: body?.quantity,
        squareOrderId: typeof body?.squareOrderId === "string" ? body.squareOrderId.trim() : null,
        squareLineItemUid: typeof body?.squareLineItemUid === "string" ? body.squareLineItemUid.trim() : null,
        squarePaymentId: typeof body?.squarePaymentId === "string" ? body.squarePaymentId.trim() : null,
        soldPackVariationId: typeof body?.soldPackVariationId === "string" ? body.soldPackVariationId.trim() : null,
        soldPackItemName: typeof body?.soldPackItemName === "string" ? body.soldPackItemName.trim() : null,
    };
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/mystery-bags/sold-events", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "mystery.manage", logger);

        if (authError) {
            return authError;
        }

        let body;

        try {
            body = await request.json();
        } catch {
            return NextResponse.json(
                {
                    error: "bad_request",
                    code: "bad_request",
                    message: "Invalid JSON body.",
                },
                { status: 400 }
            );
        }

        const payload = normalizeSoldEventPayload(body);

        try {
            const result = await createMysterySoldEvent(payload);

            if (result?.error) {
                return NextResponse.json(
                    {
                        error: result.error,
                        code: result.error,
                        message: "Unable to process sold event.",
                    },
                    { status: result.status || 400 }
                );
            }

            return NextResponse.json({
                assigned: result.assigned,
                remainingUnassignedUnits: result.remainingUnassignedUnits,
                soldEventId: result.soldEventId,
            });
        } catch (error) {
            return internalError(error, {
                event: "admin.mystery_bags.sold_events.failure",
                source: payload.source,
            });
        }
    });
}
