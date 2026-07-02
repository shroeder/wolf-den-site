import { NextResponse } from "next/server";

import { acceptVendorInvite } from "@/lib/marketplace/vendors.js";
import { geocodeAddress } from "@/lib/marketplace/geocode.js";
import { setVendorCoordinates } from "@/lib/marketplace/vendors.js";
import { createVendorSession, setVendorSessionCookie } from "@/lib/marketplace/vendor-session.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/onboard", async ({ logger, internalError }) => {
        try {
            const body = await request.json().catch(() => null);

            if (!body || !body.token || !body.password) {
                return NextResponse.json({ error: "Missing token or password." }, { status: 400 });
            }

            const address = body.address || {};

            let vendor;
            try {
                vendor = await acceptVendorInvite({
                    token: body.token,
                    password: body.password,
                    displayName: body.displayName,
                    address,
                });
            } catch (validationError) {
                return NextResponse.json({ error: validationError.message }, { status: 400 });
            }

            if (!vendor) {
                return NextResponse.json(
                    { error: "This invite link is invalid, expired, or already used." },
                    { status: 400 }
                );
            }

            // Best-effort geocode so the vendor shows up on the browse map. Geocode the TOWN (city +
            // state), not the street address, so the pin sits on the town center and never reveals a
            // vendor's exact (usually home) address.
            try {
                const coords = await geocodeAddress({
                    city: address.city,
                    region: address.region,
                    country: address.country,
                });
                if (coords) {
                    await setVendorCoordinates(vendor.id, coords.latitude, coords.longitude);
                }
            } catch (geoError) {
                logger.warn("marketplace.onboard.geocode_failed", { reason: geoError.message });
            }

            // Log them straight into their portal.
            const { token } = await createVendorSession(vendor.id, { deviceLabel: "web-onboard" });
            await setVendorSessionCookie(token);

            logger.info("marketplace.onboard.success", { vendorId: vendor.id });

            return NextResponse.json({ ok: true });
        } catch (error) {
            return internalError(error, { event: "marketplace.onboard.failure" });
        }
    });
}
