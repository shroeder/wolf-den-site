import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { getShippingRates, isEasyPostEnabled } from "@/lib/shipping/easypost";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Diagnostic for the EasyPost shipping integration: reports which env vars the RUNNING deployment
// actually sees (presence only — never the secret value), then does a live test rate call so we can
// tell exactly why checkout is falling back to flat shipping. Admin-gated.
//
//   GET /api/admin/shop/shipping/diagnose   (x-admin-key: <ADMIN_API_KEY>)
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/shop/shipping/diagnose", async ({ logger }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;

        const present = (name) => Boolean(String(process.env[name] || "").trim());
        const rawKey = String(process.env.EASYPOST_API_KEY || "").trim();
        // EasyPost keys: production start "EZAK", test start "EZTK". Report the prefix (not the secret)
        // so we can catch a test key pasted into prod, or a stray quote/whitespace.
        const keyPrefix = rawKey ? rawKey.slice(0, 4) : null;

        const env = {
            EASYPOST_API_KEY: present("EASYPOST_API_KEY"),
            EASYPOST_API_KEY_prefix: keyPrefix, // "EZAK" = production, "EZTK" = test
            EASYPOST_API_KEY_length: rawKey.length || 0,
            SHOP_SHIP_FROM_NAME: present("SHOP_SHIP_FROM_NAME"),
            SHOP_SHIP_FROM_STREET1: present("SHOP_SHIP_FROM_STREET1"),
            SHOP_SHIP_FROM_STREET2: present("SHOP_SHIP_FROM_STREET2"),
            SHOP_SHIP_FROM_CITY: present("SHOP_SHIP_FROM_CITY"),
            SHOP_SHIP_FROM_STATE: present("SHOP_SHIP_FROM_STATE"),
            SHOP_SHIP_FROM_ZIP: present("SHOP_SHIP_FROM_ZIP"),
            PAYMENTS_ENABLED: process.env.PAYMENTS_ENABLED === "true",
            NEXT_PUBLIC_PAYMENTS_ENABLED: process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === "true",
        };

        const shipFromComplete =
            env.SHOP_SHIP_FROM_STREET1 && env.SHOP_SHIP_FROM_CITY && env.SHOP_SHIP_FROM_STATE && env.SHOP_SHIP_FROM_ZIP;

        // Live test: ask EasyPost for rates to a known-good address with a 1-item parcel. This exercises
        // the exact code path checkout uses, so any config/key/carrier error surfaces here verbatim.
        const testTo = {
            name: "EasyPost Test",
            addressLine1: "417 Montgomery Street",
            addressLine2: "5th Floor",
            city: "San Francisco",
            state: "CA",
            postalCode: "94104",
            country: "US",
        };

        let liveTest;
        if (!isEasyPostEnabled()) {
            liveTest = { ran: false, reason: "EASYPOST_API_KEY not set in this deployment." };
        } else {
            try {
                const result = await getShippingRates({ toAddress: testTo, items: [{ quantity: 1 }] });
                if (!result) {
                    liveTest = { ran: true, ok: false, reason: "getShippingRates returned null (address not rateable or key absent)." };
                } else {
                    liveTest = {
                        ran: true,
                        ok: result.rates.length > 0,
                        shipmentId: result.shipmentId,
                        rateCount: result.rates.length,
                        rates: result.rates.slice(0, 6).map((r) => ({
                            carrier: r.carrier,
                            service: r.service,
                            amount: (r.amountCents / 100).toFixed(2),
                            deliveryDays: r.deliveryDays,
                        })),
                    };
                }
            } catch (error) {
                liveTest = {
                    ran: true,
                    ok: false,
                    error: error?.message || String(error),
                    easyPostStatus: error?.easyPostStatus ?? null,
                };
            }
        }

        // Plain-language verdict so the fix is obvious.
        let verdict;
        if (!env.EASYPOST_API_KEY) {
            verdict = "EASYPOST_API_KEY is missing in the running deployment. Add it in Vercel and redeploy (env changes need a new deploy).";
        } else if (!shipFromComplete) {
            verdict = "The key is set but SHOP_SHIP_FROM_* is incomplete — rating throws, so checkout falls back to flat. Set STREET1, CITY, STATE, ZIP.";
        } else if (liveTest?.ok) {
            verdict = "Working — EasyPost returned live rates. If checkout still shows flat, the buyer's address may be incomplete when rates are fetched.";
        } else {
            verdict = "Key + ship-from look present but the live rate call failed — see liveTest.error (e.g. invalid key, or no carrier enabled on the EasyPost account).";
        }

        return NextResponse.json({ env, shipFromComplete, liveTest, verdict }, { headers: { "Cache-Control": "no-store" } });
    });
}
