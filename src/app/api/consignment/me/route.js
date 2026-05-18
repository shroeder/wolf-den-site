import { NextResponse } from "next/server";

import { getAuthenticatedConsignorFromCookies } from "@/lib/consignment/session";

export const runtime = "nodejs";

export async function GET() {
    try {
        const consignor = await getAuthenticatedConsignorFromCookies();

        if (!consignor) {
            return NextResponse.json({ error: "unauthorized" }, { status: 401 });
        }

        return NextResponse.json(
            {
                consignor: {
                    id: consignor.id,
                    slug: consignor.slug,
                    displayName: consignor.display_name,
                    email: consignor.email,
                    payoutRate: Number(consignor.payout_rate || 0),
                    active: Boolean(consignor.active),
                    mustChangePassword: Boolean(consignor.must_change_password),
                },
            },
            {
                headers: {
                    "Cache-Control": "no-store",
                },
            }
        );
    } catch {
        return NextResponse.json({ error: "internal_server_error" }, { status: 500 });
    }
}
