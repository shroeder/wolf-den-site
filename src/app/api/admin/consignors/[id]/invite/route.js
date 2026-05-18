import { NextResponse } from "next/server";

import { inviteAdminConsignor } from "@/lib/admin/consignors";
import { verifyAdminApiKey } from "@/lib/admin/admin-auth";

export const runtime = "nodejs";

export async function POST(request, { params }) {
    const authError = verifyAdminApiKey(request);

    if (authError) {
        return authError;
    }

    const { id } = await params;

    try {
        const result = await inviteAdminConsignor(id);

        if (result.error) {
            return NextResponse.json({ error: result.error }, { status: result.status || 400 });
        }

        return NextResponse.json({ success: true, consignor: result.consignor });
    } catch {
        return NextResponse.json({ error: "internal_server_error" }, { status: 500 });
    }
}
