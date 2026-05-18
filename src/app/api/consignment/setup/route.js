import { NextResponse } from "next/server";

import {
    getConsignorById,
    setConsignorPasswordFromSetup,
} from "@/lib/consignment/config";
import { consumeSetupToken, validateSetupToken } from "@/lib/consignment/tokens";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

const badRequest = (message) => NextResponse.json({ error: message }, { status: 400 });
const notFound = () => NextResponse.json({ error: "Token not found or expired" }, { status: 404 });

export async function POST(request) {
    return withRequestLogging(request, "POST /api/consignment/setup", async ({ logger, internalError }) => {
        try {
            const body = await request.json().catch(() => null);

            if (!body) {
                logger.warn("consignment.setup.validation_failure", {
                    reason: "invalid_request_body",
                });

                return badRequest("Invalid request body");
            }

            const token = typeof body.token === "string" ? body.token.trim() : "";
            const password = typeof body.password === "string" ? body.password : "";

            if (!token) {
                logger.warn("consignment.setup.validation_failure", {
                    reason: "missing_token",
                });

                return badRequest("Missing token");
            }

            if (!password || password.length < 8) {
                logger.warn("consignment.setup.validation_failure", {
                    reason: "invalid_password",
                });

                return badRequest("Password must be at least 8 characters");
            }

            const tokenValidation = await validateSetupToken(token);

            if (!tokenValidation) {
                logger.warn("consignment.setup.failure", {
                    reason: "token_not_found_or_expired",
                });

                return notFound();
            }

            const consignor = await getConsignorById(tokenValidation.consignorId);

            if (!consignor) {
                logger.warn("consignment.setup.failure", {
                    reason: "consignor_not_found",
                });

                return notFound();
            }

            const slug = await setConsignorPasswordFromSetup(consignor.id, password);

            if (!slug) {
                return internalError(new Error("password_update_failed"), {
                    event: "consignment.setup.failure",
                    consignorId: consignor.id,
                });
            }

            await consumeSetupToken(tokenValidation.id);

            logger.info("consignment.setup.success", {
                consignorId: consignor.id,
                slug,
            });

            return NextResponse.json({
                success: true,
                slug,
                message: "Password set successfully. You can now log in.",
            });
        } catch (error) {
            return internalError(error, {
                event: "consignment.setup.failure",
            });
        }
    });
}
