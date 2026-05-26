import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { deleteMysteryBagCardByIdOrCardId } from "@/lib/mystery-bags";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function DELETE(request, { params }) {
    return withRequestLogging(request, "DELETE /api/admin/mystery-bags/[id]", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);

        if (authError) {
            return authError;
        }

        const { id } = await params;

        if (!id || typeof id !== "string") {
            return NextResponse.json({ error: "invalid_id" }, { status: 400 });
        }

        try {
            const deleted = await deleteMysteryBagCardByIdOrCardId(id);

            if (!deleted) {
                return NextResponse.json({ error: "card_not_found" }, { status: 404 });
            }

            return NextResponse.json({
                success: true,
                card: deleted,
            });
        } catch (error) {
            return internalError(error, {
                event: "admin.mystery_bags.delete.failure",
                id,
            });
        }
    });
}
