import { NextResponse } from "next/server";

import {
    getConsignorById,
    setConsignorPasswordFromSetup,
} from "@/lib/consignment/config";
import { consumeSetupToken, validateSetupToken } from "@/lib/consignment/tokens";

export const runtime = "nodejs";

const badRequest = (message) => NextResponse.json({ error: message }, { status: 400 });
const notFound = () => NextResponse.json({ error: "Token not found or expired" }, { status: 404 });
const serverError = () => NextResponse.json({ error: "Internal server error" }, { status: 500 });

export async function POST(request) {
    try {
        const body = await request.json().catch(() => null);

        if (!body) {
            return badRequest("Invalid request body");
        }

        const token = typeof body.token === "string" ? body.token.trim() : "";
        const password = typeof body.password === "string" ? body.password : "";

        if (!token) {
            return badRequest("Missing token");
        }

        if (!password || password.length < 8) {
            return badRequest("Password must be at least 8 characters");
        }

        const tokenValidation = await validateSetupToken(token);

        if (!tokenValidation) {
            return notFound();
        }

        const consignor = await getConsignorById(tokenValidation.consignorId);

        if (!consignor) {
            return notFound();
        }

        const slug = await setConsignorPasswordFromSetup(consignor.id, password);

        if (!slug) {
            return serverError();
        }

        await consumeSetupToken(tokenValidation.id);

        return NextResponse.json({
            success: true,
            slug,
            message: "Password set successfully. You can now log in.",
        });
    } catch {
        return serverError();
    }
}
