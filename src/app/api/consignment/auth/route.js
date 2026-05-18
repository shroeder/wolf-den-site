import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
    getPublicConsignorBySlug,
    validateConsignorPassword,
} from "@/lib/consignment/config";
import {
    CONSIGNMENT_SESSION_COOKIE,
    assertSessionSecret,
    createSessionToken,
    getConsignmentCookieOptions,
} from "@/lib/consignment/session";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });

export async function POST(request) {
    return withRequestLogging(request, "POST /api/consignment/auth", async ({ logger, internalError }) => {
        logger.info("consignment.auth.check.started", {
            step: "auth_check_started",
            authType: "consignor_password",
        });

        let body;

        try {
            body = await request.json();
        } catch {
            logger.warn("consignment.auth.invalid_json");

            return unauthorized();
        }

        const slug = typeof body?.slug === "string" ? body.slug : "";
        const password = typeof body?.password === "string" ? body.password : "";

        if (!slug || !password) {
            logger.warn("consignment.auth.validation_failure", {
                reason: "missing_credentials",
            });

            logger.warn("consignment.auth.check.failed", {
                step: "auth_check_failed",
                authType: "consignor_password",
                reason: "missing_credentials",
            });

            return unauthorized();
        }

        try {
            const isValid = await validateConsignorPassword(slug, password);

            if (!isValid) {
                logger.warn("consignment.auth.failure", {
                    reason: "invalid_credentials",
                    slug,
                });

                logger.warn("consignment.auth.check.failed", {
                    step: "auth_check_failed",
                    authType: "consignor_password",
                    reason: "invalid_credentials",
                });

                return unauthorized();
            }

            const consignor = await getPublicConsignorBySlug(slug);

            if (!consignor) {
                logger.warn("consignment.auth.failure", {
                    reason: "consignor_not_found",
                    slug,
                });

                logger.warn("consignment.auth.check.failed", {
                    step: "auth_check_failed",
                    authType: "consignor_password",
                    reason: "consignor_not_found",
                });

                return unauthorized();
            }

            logger.info("consignment.auth.check.passed", {
                step: "auth_check_passed",
                authType: "consignor_password",
                slug: consignor.slug,
            });

            assertSessionSecret(logger);
            const cookieStore = await cookies();
            const token = createSessionToken(consignor.slug);

            cookieStore.set(CONSIGNMENT_SESSION_COOKIE, token, getConsignmentCookieOptions());

            logger.info("consignment.auth.success", {
                slug: consignor.slug,
            });

            return NextResponse.json({
                success: true,
                consignor,
            });
        } catch (error) {
            return internalError(error, {
                event: "consignment.auth.failure",
                slug,
            });
        }
    });
}