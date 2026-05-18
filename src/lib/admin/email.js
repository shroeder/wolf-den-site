import "server-only";

import { sendSetupEmail } from "@/lib/consignment/email";

export async function sendAdminSetupEmail(consignor, setupToken) {
    return sendSetupEmail(consignor, setupToken);
}
