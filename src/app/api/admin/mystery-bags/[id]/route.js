import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

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
            logger.warn("admin.mystery_bags.delete.invalid_id", {
                id: id || null,
            });

            return NextResponse.json({ error: "invalid_id" }, { status: 400 });
        }

        try {
            const deleted = await deleteMysteryBagCardByIdOrCardId(id);

            if (!deleted) {
                logger.warn("admin.mystery_bags.delete.not_found", {
                    id,
                });

                return NextResponse.json({ error: "card_not_found" }, { status: 404 });
            }

            logger.info("admin.mystery_bags.delete.success", {
                id,
                deletedCardId: deleted.cardId,
                deletedId: deleted.id,
            });

            revalidatePath("/mystery-bags");
            revalidatePath("/api/mystery-bags");

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
