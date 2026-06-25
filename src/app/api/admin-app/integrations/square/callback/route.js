import { upsertIntegration } from "@/lib/admin-app/integrations";
import { exchangeSquareCode, fetchSquarePrimaryLocation, verifySquareOAuthState } from "@/lib/admin-app/square-oauth";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

function page(title, message) {
    return new Response(
        `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>body{font-family:system-ui,sans-serif;background:#111;color:#eee;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;text-align:center;padding:24px}
.card{max-width:420px}h1{font-size:20px;margin:0 0 8px}p{color:#aaa;line-height:1.5}</style></head>
<body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`,
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
    );
}

export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin-app/integrations/square/callback", async ({ logger }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");

        const verified = verifySquareOAuthState(state);

        if (!verified) {
            logger.warn("admin_app.integrations.square.callback.bad_state");
            return page("Couldn't connect Square", "This link has expired or is invalid. Please start again from the app.");
        }

        // User declined authorization (or Square returned no code).
        if (!code) {
            logger.warn("admin_app.integrations.square.callback.no_code", { storeId: verified.storeId });
            return page("Square connection cancelled", "No changes were made. You can try again from the app.");
        }

        try {
            const tokens = await exchangeSquareCode(code);
            const locationId = await fetchSquarePrimaryLocation(tokens.access_token);

            await upsertIntegration(verified.storeId, "square", {
                credentialObject: {
                    access_token: tokens.access_token,
                    refresh_token: tokens.refresh_token || null,
                },
                metadata: {
                    merchant_id: tokens.merchant_id || null,
                    location_id: locationId,
                },
                status: "connected",
                expiresAt: tokens.expires_at || null,
            });

            logger.info("admin_app.integrations.square.callback.connected", {
                storeId: verified.storeId,
                hasLocation: Boolean(locationId),
            });

            return page("Square connected", "You're all set. Return to the app to finish.");
        } catch (error) {
            logger.error("admin_app.integrations.square.callback.failed", error, { storeId: verified.storeId });
            return page("Couldn't connect Square", "Something went wrong exchanging the authorization. Please try again from the app.");
        }
    });
}
