import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── RECEIPTS LAND IN BLOB, NOT IN SOMEBODY'S GOOGLE DRIVE ────────────────────────────────────────────────────
// The July migration moved the ledger DATA off Google — trades, cash on hand, the main ledger and COGS all
// live in Neon now. Receipts were left behind on Drive, and being left behind made them the LAST reason the
// app touched Google at all. Two things follow from that, and both of them are bugs:
//
//   1. Every receipt goes into Luke's personal Google account. Nobody else can open one, so a receipt is
//      evidence only one person in the business can look at.
//   2. The EMPLOYEE build has no Google and never will — its package is not registered with the OAuth client.
//      So attaching a photo there did not fail the upload, it failed the whole save. An employee typing a
//      gas receipt lost the entry by photographing it. The camera buttons are hidden there as a stopgap; this
//      is the fix that lets them come back.
//
// SIZE IS THE WHOLE DESIGN CONSTRAINT. This is a Vercel function, so the request body cap is ~4.5MB — the
// same cap that once 413'd the card scanner on ordinary phone photos. The app therefore DOWNSCALES before it
// posts (see ReceiptUploader.kt); this end rejects anything over the limit with a clear message rather than
// letting the platform return an opaque 413. If receipts ever need to arrive full-resolution, the answer is
// a client-upload handshake straight to Blob, not a bigger body.
//
// Blob paths are `receipts/<entryId>/<n>-<random>.<ext>`: grouped by entry so everything for one purchase
// sits together, and suffixed randomly so re-uploading a replacement can never silently overwrite the
// original evidence.

const MAX_BYTES = 4 * 1024 * 1024;   // under Vercel's ~4.5MB, with headroom for headers
const EXT = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" };

export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/receipts", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "ledger.manage", logger);
        if (authError) return authError;

        if (!process.env.BLOB_READ_WRITE_TOKEN) {
            return NextResponse.json({ error: "blob_not_configured" }, { status: 503 });
        }

        try {
            const url = new URL(request.url);
            const entryId = (url.searchParams.get("entryId") || "").trim();
            const seq = Math.max(0, Number(url.searchParams.get("seq")) || 0);
            if (!entryId) return NextResponse.json({ error: "entry_id_required" }, { status: 400 });

            const contentType = (request.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
            const ext = EXT[contentType.toLowerCase()];
            if (!ext) return NextResponse.json({ error: "unsupported_type", contentType }, { status: 415 });

            // Raw bytes, not text(): reading an image with text() corrupts it — the same mistake that put
            // every scanned card into Square with no image for three days.
            const bytes = Buffer.from(await request.arrayBuffer());
            if (!bytes.length) return NextResponse.json({ error: "empty_body" }, { status: 400 });
            if (bytes.length > MAX_BYTES) {
                return NextResponse.json({
                    error: "too_large",
                    bytes: bytes.length,
                    limit: MAX_BYTES,
                    detail: "Downscale the photo before uploading — this endpoint sits under Vercel's request-body cap.",
                }, { status: 413 });
            }

            const safeEntry = entryId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || "entry";
            const blob = await put(`receipts/${safeEntry}/${seq}.${ext}`, bytes, {
                access: "public",
                contentType,
                addRandomSuffix: true,   // a replacement never overwrites the original evidence
            });

            logger.info("admin.receipts.stored", { step: "receipt_stored", entryId: safeEntry, bytes: bytes.length });
            return NextResponse.json({ ok: true, url: blob.url, bytes: bytes.length },
                { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "admin.receipts.upload.failure" });
        }
    });
}
