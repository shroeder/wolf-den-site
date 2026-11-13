import { NextResponse } from "next/server";

import { sweepExpiredVaultCards } from "@/lib/marketplace/vault.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request) {
    const expected = process.env.CRON_SECRET;
    if (!expected) return false;
    return (request.headers.get("authorization") || "") === `Bearer ${expected}`;
}

// ── HOURLY: SELL BACK EVERY VAULT CARD WHOSE THREE DAYS ARE UP ──────────────────────────────────────────────
// Luke, 2026-11-12: "Cards should auto sell back after 3 days."
//
// ⚠️ HOURLY, AND THE CADENCE IS PART OF THE PROMISE. The vault shows a live countdown, so the gap between a
// timer reaching zero and the card actually selling is a window in which the screen and the truth disagree.
// An hour is the most that can be off; a daily run would mean a card reading "expired" for most of a day
// while still sittable, and a member tapping "sell back" on it would be racing the sweep.
//
// ⚠️ AND IT IS NOT A NOTIFICATION JOB. Nothing here nudges anybody — see [[cost-cuts-narrow-never-disable]]
// for why the cadence of a job is never just a cost dial: this one's cadence IS the accuracy of a number
// shown to members, so slowing it down changes what the vault screen means.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/jobs/vault-expiry", async ({ logger, internalError }) => {
        try {
            if (!isAuthorized(request)) {
                logger.warn("vault_expiry.unauthorized");
                return NextResponse.json({ error: "unauthorized" }, { status: 401 });
            }
            return NextResponse.json({ success: true, ...(await sweepExpiredVaultCards()) });
        } catch (error) {
            return internalError(error, { event: "vault_expiry.run.failure" });
        }
    });
}
