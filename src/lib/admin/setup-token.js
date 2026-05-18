import "server-only";

import { createSetupToken } from "@/lib/consignment/tokens";

export async function createAdminSetupToken(consignorId) {
    return createSetupToken(consignorId);
}
