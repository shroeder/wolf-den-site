import { NextResponse } from "next/server";

import { getConsignorInventory } from "@/lib/consignment/portal-data";
import { getAuthenticatedConsignorFromCookies } from "@/lib/consignment/session";

export const runtime = "nodejs";

export async function GET() {
    try {
        const consignor = await getAuthenticatedConsignorFromCookies();

        if (!consignor) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const inventory = await getConsignorInventory(consignor.id);

        return NextResponse.json(inventory, {
            headers: {
                "Cache-Control": "no-store",
            },
        });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}