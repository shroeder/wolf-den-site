import { NextResponse } from "next/server";

import { createDndResponse } from "@/lib/dnd-survey-store";
import { isTrustedWriteRequest } from "@/lib/request-security";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

// Public D&D interest survey submission. Open to anyone — the audience is a Facebook post, not the membership —
// so the only guard is the same-origin write check every other public write on the site uses.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/dnd-survey", async ({ logger, internalError }) => {
        try {
            if (!isTrustedWriteRequest(request)) {
                return NextResponse.json({ error: "Could not verify this request." }, { status: 403 });
            }

            const body = await request.json().catch(() => null);

            if (!body) {
                return NextResponse.json({ error: "Missing answers." }, { status: 400 });
            }

            try {
                const result = await createDndResponse(body);
                logger.info("dnd_survey.created", { responseId: result.id });
                return NextResponse.json({ ok: true });
            } catch (error) {
                // Only a rejected ANSWER is the caller's fault and safe to quote back. Anything else — a db
                // outage, a missing column — falls through to internalError, which logs it and answers 500
                // with a request id rather than handing a visitor the driver's own error text.
                if (error?.code !== "invalid_answers") {
                    throw error;
                }
                return NextResponse.json({ error: error.message }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "dnd_survey.create.failure" });
        }
    });
}
