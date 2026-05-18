import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { getConsignorById } from "@/lib/consignment/config";
import { createPayoutForConsignor, getTotalPaidForConsignor, listPayoutsForConsignor } from "@/lib/consignment/payouts";
import { getConsignorSummary } from "@/lib/consignment/portal-data";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

function normalizePayload(body) {
    return {
        amount: body?.amount,
        paidAt: typeof body?.paidAt === "string" ? body.paidAt : undefined,
        paymentMethod: typeof body?.paymentMethod === "string" ? body.paymentMethod.trim() : "",
        note: typeof body?.note === "string" ? body.note.trim() : "",
    };
}

function validatePayload(payload) {
    const amount = Number(payload.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
        return "invalid_amount";
    }

    if (payload.paidAt) {
        const parsedDate = new Date(payload.paidAt);

        if (Number.isNaN(parsedDate.getTime())) {
            return "invalid_paid_at";
        }
    }

    if (payload.paymentMethod && payload.paymentMethod.length > 80) {
        return "payment_method_too_long";
    }

    if (payload.note && payload.note.length > 4000) {
        return "note_too_long";
    }

    payload.amount = amount;

    return null;
}

export async function GET(request, { params }) {
    return withRequestLogging(request, "GET /api/admin/consignors/[id]/payouts", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);

        if (authError) {
            return authError;
        }

        const { id } = await params;

        try {
            const consignor = await getConsignorById(id);

            if (!consignor) {
                return NextResponse.json({ error: "consignor_not_found" }, { status: 404 });
            }

            const [payouts, totalPaid] = await Promise.all([
                listPayoutsForConsignor(id),
                getTotalPaidForConsignor(id),
            ]);

            return NextResponse.json({
                payouts,
                totalPaid,
            });
        } catch (error) {
            return internalError(error, {
                event: "admin.consignors.payouts.list.failure",
                consignorId: id,
            });
        }
    });
}

export async function POST(request, { params }) {
    return withRequestLogging(request, "POST /api/admin/consignors/[id]/payouts", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);

        if (authError) {
            return authError;
        }

        let body;

        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: "invalid_json" }, { status: 400 });
        }

        const payload = normalizePayload(body);
        const payloadError = validatePayload(payload);

        if (payloadError) {
            return NextResponse.json({ error: payloadError }, { status: 400 });
        }

        const { id } = await params;

        try {
            const consignor = await getConsignorById(id);

            if (!consignor) {
                return NextResponse.json({ error: "consignor_not_found" }, { status: 404 });
            }

            const summary = await getConsignorSummary(id);
            const totalPaidBefore = Number(summary.totalPaid || 0);
            const owedBefore = Number(summary.estimatedPayout || 0);

            const result = await createPayoutForConsignor(consignor, {
                ...payload,
                totalPaidBefore,
                owedBefore,
            });

            if (result.error) {
                return NextResponse.json({ error: result.error }, { status: result.status || 400 });
            }

            logger.info("admin.consignors.payouts.create.success", {
                consignorId: id,
                payoutId: result.payout.id,
                amount: result.payout.amount,
            });

            return NextResponse.json({
                success: true,
                payout: result.payout,
            }, { status: 201 });
        } catch (error) {
            return internalError(error, {
                event: "admin.consignors.payouts.create.failure",
                consignorId: id,
            });
        }
    });
}
