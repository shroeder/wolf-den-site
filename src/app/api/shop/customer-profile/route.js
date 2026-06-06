import { NextResponse } from "next/server";

import { findSquareCustomerByEmail, toCheckoutProfileFromSquareCustomer } from "@/lib/consignment/square";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

function isPaymentsEnabled() {
    return process.env.PAYMENTS_ENABLED === "true";
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/shop/customer-profile", async ({ internalError }) => {
        if (!isPaymentsEnabled()) {
            return NextResponse.json({ error: "Payments are currently disabled." }, { status: 403 });
        }

        try {
            const body = await request.json().catch(() => null);
            const email = String(body?.email || "").trim().toLowerCase();

            if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
                return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
            }

            const customer = await findSquareCustomerByEmail(email);

            return NextResponse.json({
                found: Boolean(customer),
                profile: toCheckoutProfileFromSquareCustomer(customer),
            });
        } catch (error) {
            return internalError(error, {
                event: "shop.customer_profile.lookup.failed",
            });
        }
    });
}
