import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { addCredit } from "@/lib/marketplace/store-credit.js";
import { closePullTask, getPullQueue } from "@/lib/marketplace/pack-telemetry.js";
import { db } from "@/lib/db";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) =>
    NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

// ── THE STAFF PULL QUEUE ─────────────────────────────────────────────────────────────────────────────────────
// Design doc §1.3. Both app flavours reach this: the employee is the one who can walk to the tub.
//
// ⚠️ `mystery.manage`, NOT `marketplace.manage`. The telemetry beside it reads `mystery.report` because it
// carries margin and per-member net position; working the queue is floor work and the employee build has to
// be able to do it. Gating both the same way would have built a screen the only person who needs it cannot
// open.
//
// ⚠️ AND THE KEY HAS TO BE ONE THAT EXISTS. The first version asked for `inventory.manage`, which is not in
// the permission vocabulary at all — and hasPermission fails CLOSED on an unknown key, so the queue would
// have been permanently shut to every staff account while looking perfectly correct in the diff. The real
// list lives in lib/admin-app/permissions.js; check a key against it rather than guessing a plausible one.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/packs/queue", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "mystery.manage", logger);
        if (authError) return authError;
        try {
            return noStore({ tasks: await getPullQueue({}) });
        } catch (error) {
            return internalError(error, { event: "admin.pack_queue.failure" });
        }
    });
}

export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/packs/queue", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "mystery.manage", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            const taskId = String(body?.taskId || "");
            const notFound = Boolean(body?.notFound);
            const by = String(body?.by || "staff").slice(0, 60);

            const closed = await closePullTask({ taskId, by, notFound, note: body?.note || null });
            if (!closed) return noStore({ error: "That task is already closed." }, { status: 409 });

            if (!notFound) return noStore({ ok: true, status: closed.status });

            // ── "CAN'T FIND IT" ─────────────────────────────────────────────────────────────────────────────
            // Refund in full, no questions (Luke's call). The member never pays for our inventory drift — and
            // this action is the only detector we have that a bag has gone missing from the tub, which is why
            // it refunds rather than asking anybody to adjudicate.
            const open = await db.queryOne(
                `SELECT id, buyer_id, price_cents, outcome FROM mkt_pack_open WHERE id = $1`,
                [closed.pack_open_id]
            );
            if (open) {
                await addCredit(open.buyer_id, open.price_cents, "refund", `pack-missing:${open.id}`, {
                    reason: "bag_not_found",
                });
                await db.query(`UPDATE mkt_pack_open SET outcome = 'refunded' WHERE id = $1`, [open.id]);
                await db.query(
                    `UPDATE mkt_vault_card SET status = 'sold_back', sold_back_at = NOW()
                     WHERE pack_open_id = $1 AND status = 'held'`,
                    [open.id]
                );
                await db.query(
                    `INSERT INTO mkt_vault_event (buyer_id, pack_open_id, action, credit_delta_cents, meta)
                     VALUES ($1, $2, 'refunded', $3, $4)`,
                    [open.buyer_id, open.id, open.price_cents, JSON.stringify({ reason: "bag_not_found" })]
                ).catch(() => {});
            }

            // The bag is gone from the tub, so it must not stay in the pool pretending otherwise.
            await db.query(
                `UPDATE mystery_bag_cards SET status = 'removed', removed_at = NOW(), updated_at = NOW()
                 WHERE id = $1`,
                [closed.mystery_card_id]
            );

            logger.warn("admin.pack_queue.bag_not_found", { taskId, openId: closed.pack_open_id });
            return noStore({ ok: true, status: "not_found", refundedCents: open?.price_cents || 0 });
        } catch (error) {
            return internalError(error, { event: "admin.pack_queue.close.failure" });
        }
    });
}
