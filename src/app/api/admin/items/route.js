import { after, NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { db } from "@/lib/db";
import { grantItem } from "@/lib/marketplace/inventory.js";
import { addChests, CHEST_ORDER, CHEST_TIERS } from "@/lib/marketplace/chests.js";
import { ITEMS, describeStats } from "@/lib/marketplace/items.js";
import { sendWebPush } from "@/lib/push/web-push.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Dopamine dressing for gift pushes — rarity flavor so a mythic drop feels like a mythic drop.
const RARITY_EMOJI = { common: "⚪", rare: "🔵", epic: "🟣", legendary: "🟠", mythic: "💎" };
const RARITY_ARTICLE = { rare: "a rare ", epic: "an epic ", legendary: "a legendary ", mythic: "a MYTHIC " };

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET — the item catalog (for the admin grant picker). Serialized without the icon component.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/items", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const items = ITEMS.map((i) => ({
                id: i.id, name: i.name, slot: i.slot, rarity: i.rarity, reqLevel: i.reqLevel,
                stats: describeStats(i.stats), charged: Boolean(i.charged), chargeRewardLabel: i.chargeRewardLabel || null, source: i.source,
            }));
            const chestTiers = CHEST_ORDER.map((t) => ({ tier: t, label: CHEST_TIERS[t].label, emoji: CHEST_TIERS[t].emoji }));
            return noStore({ items, chestTiers });
        } catch (error) {
            return internalError(error, { event: "admin.items.list.failure" });
        }
    });
}

// POST — give something to ONE member. Body: { buyerId, itemId } (grant gear) | { buyerId, chest: tier }
// (give a loot box) | { buyerId, gold: amount }. Recipient gets a push.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/admin/items", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const body = await request.json().catch(() => ({}));
            const buyerId = String(body?.buyerId || "").trim();
            if (!buyerId) return noStore({ error: "missing_buyer" }, { status: 400 });

            // Give a single loot chest.
            if (body?.chest) {
                const tier = String(body.chest);
                const def = CHEST_TIERS[tier];
                if (!def) return noStore({ error: "unknown_tier" }, { status: 400 });
                await addChests(buyerId, { [tier]: 1 });
                after(() => sendWebPush(buyerId, { title: `${def.emoji} A gift from The Wolf Den!`, body: `A ${def.label} just dropped into your stash — tap to rip it open! ✨`, url: "/marketplace/equipment", tag: "gift-chest", data: { type: "gift_chest", tier } }).catch(() => {}));
                return noStore({ ok: true, kind: "chest", tier });
            }
            // Give gold.
            if (body?.gold) {
                const amt = Math.max(1, Math.min(100000, Math.floor(Number(body.gold) || 0)));
                await db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [buyerId, amt]).catch(() => {});
                after(() => sendWebPush(buyerId, { title: "🪙 A gift from The Wolf Den!", body: `${amt.toLocaleString()} gold just landed in your purse — spend it in the gear shop! ✨`, url: "/marketplace/equipment", tag: "gift-gold", data: { type: "gift_gold", amount: amt } }).catch(() => {}));
                return noStore({ ok: true, kind: "gold", amount: amt });
            }
            // Grant a specific item.
            const itemId = String(body?.itemId || "").trim();
            if (!itemId) return noStore({ error: "missing_params" }, { status: 400 });
            const res = await grantItem(buyerId, itemId, "admin");
            const def = ITEMS.find((i) => i.id === itemId);
            // Only alert on a NEW grant (not a re-grant of something they already own).
            if (res?.granted && def) {
                after(() => sendWebPush(buyerId, {
                    title: `${RARITY_EMOJI[def.rarity] || "🎁"} A gift from The Wolf Den!`,
                    body: `You received ${RARITY_ARTICLE[def.rarity] || ""}${def.name} — tap to equip it! ✨`,
                    url: "/marketplace/equipment",
                    tag: "gift-item",
                    data: { type: "gift_item", itemId },
                }).catch(() => {}));
            }
            return noStore({ ...res, name: def?.name || null, rarity: def?.rarity || null }, { status: res.ok ? 200 : 400 });
        } catch (error) {
            return internalError(error, { event: "admin.items.grant.failure" });
        }
    });
}
