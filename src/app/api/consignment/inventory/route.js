import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getConsignorInventory } from "@/lib/consignment/portal-data";
import { CONSIGNMENT_SESSION_COOKIE, getAuthenticatedConsignorFromToken } from "@/lib/consignment/session";

export const runtime = "nodejs";

export async function GET() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get(CONSIGNMENT_SESSION_COOKIE)?.value;
        const consignor = await getAuthenticatedConsignorFromToken(token);

        if (!consignor) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const inventory = await getConsignorInventory(consignor);

        return NextResponse.json(inventory, {
            headers: {
                "Cache-Control": "no-store",
            },
        });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}