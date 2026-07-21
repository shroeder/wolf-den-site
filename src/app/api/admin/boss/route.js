import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { claimBossPrize, createDraftBoss, deleteBoss, endBoss, generateBossArt, generateBossBackground, getBossRecapAdmin, listBossesAdmin, releaseBoss, setBossArt, setBossBackground, setBossChaseItem, setBossRewardItems, setBossPrize, updateDraftBoss } from "@/lib/marketplace/boss-admin.js";
import { projectBossHp } from "@/lib/marketplace/boss.js";
import { activateBuff, endBuff, getActiveBuff, BUFF_PRESETS } from "@/lib/marketplace/boss-buff.js";
import { giveawayChest, giveawayGold, giveawayItem } from "@/lib/marketplace/giveaway.js";
import { CHEST_ORDER, CHEST_TIERS } from "@/lib/marketplace/chests.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120; // AI image generation can take a while

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// List all bosses (drafts + live + ended) for the admin control panel.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/boss", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const [bosses, buff] = await Promise.all([listBossesAdmin(), getActiveBuff().catch(() => null)]);
            return noStore({
                bosses,
                buff, // currently active boss buff (or null)
                buffPresets: BUFF_PRESETS,
                chestTiers: CHEST_ORDER.map((t) => ({ tier: t, label: CHEST_TIERS[t].label, emoji: CHEST_TIERS[t].emoji })),
            });
        } catch (error) {
            return internalError(error, { event: "admin.boss.list.failure" });
        }
    });
}

// Action dispatch: create | update | art | release | end.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/boss", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            const action = String(body?.action || "");
            if (action === "projectHp") return noStore(await projectBossHp({ targetDays: body.days }));
            if (action === "recap") return noStore({ recap: await getBossRecapAdmin(String(body.bossId || "")) });
            if (action === "create") return noStore({ boss: await createDraftBoss(body) });
            if (action === "update") return noStore({ boss: await updateDraftBoss(body.bossId, body) });
            if (action === "art") {
                if (!body.bossId) return noStore({ error: "missing_boss" }, { status: 400 });
                const url = await generateBossArt(body.bossId, body.prompt);
                return noStore({ imageUrl: url });
            }
            if (action === "setArt") {
                if (!body.bossId || !body.image) return noStore({ error: "missing_image" }, { status: 400 });
                return noStore({ imageUrl: await setBossArt(body.bossId, body.image) });
            }
            if (action === "setBg") {
                if (!body.bossId || !body.image) return noStore({ error: "missing_image" }, { status: 400 });
                return noStore({ backgroundUrl: await setBossBackground(body.bossId, body.image) });
            }
            if (action === "bg") {
                if (!body.bossId) return noStore({ error: "missing_boss" }, { status: 400 });
                return noStore({ backgroundUrl: await generateBossBackground(body.bossId, body.prompt) });
            }
            if (action === "release") return noStore({ boss: await releaseBoss(body.bossId, { days: body.days, notify: body.notify !== false }) });
            if (action === "setPrize") {
                if (!body.bossId) return noStore({ error: "missing_boss" }, { status: 400 });
                return noStore(await setBossPrize(body.bossId, { name: body.prizeName, imageUrl: body.prizeImageUrl, squareId: body.prizeSquareId }));
            }
            if (action === "setChaseItem") {
                if (!body.bossId) return noStore({ error: "missing_boss" }, { status: 400 });
                return noStore(await setBossChaseItem(body.bossId, body.itemId || null));
            }
            if (action === "setRewardItems") {
                if (!body.bossId) return noStore({ error: "missing_boss" }, { status: 400 });
                return noStore(await setBossRewardItems(body.bossId, body.itemIds || []));
            }
            if (action === "claimPrize") {
                if (!body.bossId) return noStore({ error: "missing_boss" }, { status: 400 });
                return noStore(await claimBossPrize(body.bossId));
            }
            if (action === "end") return noStore(await endBoss(body.bossId));
            if (action === "delete") return noStore(await deleteBoss(body.bossId));
            // Boss-fight buffs (timed damage multipliers, admin sets the duration when triggering).
            if (action === "buff") return noStore({ buff: await activateBuff({ key: body.key, hours: body.hours }) });
            if (action === "endBuff") return noStore(await endBuff());
            // Giveaways to the CURRENT active-hero roster only (not future signups).
            if (action === "giveaway") {
                const kind = String(body.kind || "chest");
                if (kind === "chest") return noStore(await giveawayChest({ tier: body.tier, count: body.count }));
                if (kind === "gold") return noStore(await giveawayGold({ amount: body.amount }));
                if (kind === "item") return noStore(await giveawayItem({ itemId: body.itemId }));
                return noStore({ error: "unknown_giveaway" }, { status: 400 });
            }
            return noStore({ error: "unknown_action" }, { status: 400 });
        } catch (error) {
            if (error?.message && !/database|query/i.test(error.message)) return noStore({ error: error.message }, { status: 400 });
            return internalError(error, { event: "admin.boss.action.failure" });
        }
    });
}
