import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { listAdminConsignors } from "@/lib/admin/consignors";

export const runtime = "nodejs";

export async function GET(request) {
    const authError = verifyAdminApiKey(request);

    if (authError) {
        return authError;
    }

    try {
        const consignors = await listAdminConsignors();

        return NextResponse.json(
            {
                consignors,
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
