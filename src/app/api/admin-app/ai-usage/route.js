import { NextResponse } from "next/server";

import { verifyAdminApiKey } from "@/lib/admin/admin-auth";
import { logGeneration, logText } from "@/lib/marketplace/ai-ledger.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Where the admin app reports OpenAI calls it made DIRECTLY, without going through /api/admin-app/proxy.
//
// Three services can't use the proxy: the card scanner and the product-lookup services send images large
// enough to hit the proxy's ~4.5MB body cap, and the boss art generator does the same. They hold the key on
// the phone and call OpenAI themselves — which meant their spend never touched this server and was invisible
// to the AI Costs screen. They now POST what they used, after the fact.
//
// This records only; it never gates or bills. A dropped report costs us a ledger row, not a feature, so the
// app fires it best-effort and ignores the result.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin-app/ai-usage", async ({ logger, internalError }) => {
        const authError = verifyAdminApiKey(request, logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => null);
            if (!body) return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });

            const common = {
                source: body.source || "app/direct",
                label: body.label || "Admin app (direct)",
                subject: body.subject || null,
                origin: "admin",
                buyerLabel: body.actor || "admin app",
                ok: body.ok !== false,
                error: body.error || null,
            };

            if (body.kind === "image") {
                await logGeneration({
                    ...common,
                    model: body.model || "gpt-image-1",
                    size: body.size, quality: body.quality, edit: Boolean(body.edit),
                    prompt: body.prompt, url: body.url || null,
                });
            } else {
                await logText({
                    ...common,
                    model: body.model || "gpt-4o-mini",
                    usage: { prompt_tokens: Number(body.tokensIn) || 0, completion_tokens: Number(body.tokensOut) || 0 },
                });
            }
            return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin_app.ai_usage.failure" });
        }
    });
}
