import { NextResponse } from "next/server";

import { createWant } from "@/lib/marketplace/wants.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/want", async ({ logger, internalError }) => {
        try {
            const body = await request.json().catch(() => null);

            if (!body || !body.catalogProductId || !body.email) {
                return NextResponse.json({ error: "Product and a valid email are required." }, { status: 400 });
            }

            try {
                await createWant({
                    catalogProductId: body.catalogProductId,
                    email: body.email,
                    maxPrice: body.maxPrice ?? null,
                });
                logger.info("marketplace.want.success", { catalogProductId: body.catalogProductId });

                return NextResponse.json({ ok: true });
            } catch (validationError) {
                return NextResponse.json({ error: validationError.message }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "marketplace.want.failure" });
        }
    });
}
