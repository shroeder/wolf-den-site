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

export const runtime = "nodejs";

const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });

export async function POST(request) {
    let body;

    try {
        body = await request.json();
    } catch {
        return unauthorized();
    }

    const slug = typeof body?.slug === "string" ? body.slug : "";
    const password = typeof body?.password === "string" ? body.password : "";

    try {
        const isValid = await validateConsignorPassword(slug, password);

        if (!isValid) {
            return unauthorized();
        }

        const consignor = await getPublicConsignorBySlug(slug);

        if (!consignor) {
            return unauthorized();
        }

        assertSessionSecret();
        const cookieStore = await cookies();
        const token = createSessionToken(consignor.slug);

        cookieStore.set(CONSIGNMENT_SESSION_COOKIE, token, getConsignmentCookieOptions());

        return NextResponse.json({
            success: true,
            consignor,
        });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}