import { after, NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";
import { db } from "@/lib/db";
import { grantItem } from "@/lib/marketplace/inventory.js";
import { addChests, CHEST_ORDER, CHEST_TIERS } from "@/lib/marketplace/chests.js";
import { ITEMS, describeStats } from "@/lib/marketplace/items.js";
import { itemSpriteMap } from "@/lib/marketplace/item-sprites.js";
import { COLLECTIBLES, collectibleById } from "@/lib/marketplace/collectibles.js";
import { signatureFor } from "@/lib/marketplace/signatures.js";
import { syncEarnedBadges } from "@/lib/marketplace/badges.js";
import { sendWebPush } from "@/lib/push/web-push.js";
import { sendBuyerPush } from "@/lib/push/send.js";
import { recordGift } from "@/lib/marketplace/gifts.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Dopamine dressing for gift pushes — rarity flavor so a mythic drop feels like a mythic drop.
const RARITY_EMOJI = { common: "⚪", rare: "🔵", epic: "🟣", legendary: "🟠", mythic: "💎", ascendant: "🌟", eternal: "👑" };
const RARITY_ARTICLE = { rare: "a rare ", epic: "an epic ", legendary: "a legendary ", mythic: "a MYTHIC ", ascendant: "an ASCENDANT ", eternal: "an ETERNAL " };

// Alert the recipient on BOTH channels: FCM to the marketplace app (the configured/live one — same as DMs
// and friend requests) AND browser web push. Fire-and-forget; a missing channel just no-ops.
function giftNotify(buyerId, title, body, tag, data) {
    sendBuyerPush(buyerId, { title, body, data }).catch(() => {});
    sendWebPush(buyerId, { title, body, url: "/marketplace/inventory", tag, data }).catch(() => {});
}

function noStore(body, init = {}) {
    return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });
}

// GET — the item catalog (for the admin grant picker). Serialized without the icon component.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/admin/items", async ({ logger, internalError }) => {
        const authError = await requireAdminAccess(request, "marketplace.manage", logger);
        if (authError) return authError;
        try {
            const spriteMap = await itemSpriteMap();
            const items = ITEMS.map((i) => {
                const sig = signatureFor(i.id);
                return {
                    id: i.id, name: i.name, slot: i.slot, rarity: i.rarity, reqLevel: i.reqLevel,
                    stats: describeStats(i.stats), charged: Boolean(i.charged), chargeRewardLabel: i.chargeRewardLabel || null,
                    charges: i.charges || null, cooldownDays: i.cooldownDays || null, source: i.source,
                    signature: sig ? `${sig.label}: ${sig.desc}` : null,
                    flavor: i.flavor || null,
                    sprite: spriteMap[i.id] || null,
                };
            });
            const chestTiers = CHEST_ORDER.map((t) => ({ tier: t, label: CHEST_TIERS[t].label, emoji: CHEST_TIERS[t].emoji }));
            // Pet catalog for the per-member "grant a pet" picker (sorted worst → best by unlock level).
            const pets = [...COLLECTIBLES]
                .sort((a, b) => (a.level || 0) - (b.level || 0))
                .map((p) => ({ id: p.id, name: p.name, rarity: p.rarity, level: p.level || null }));
            return noStore({ items, chestTiers, pets });
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

            // Credit mystery-bag purchases (sold in-store, so staff attribute them to a member here) + an
            // optional "big hit" flag. Drives the mystery-bag badges (Grab Bagger / Big Hit / Bag Fiend / Legend).
            if (body?.mysteryBag || body?.bigHit) {
                const n = Math.max(0, Math.min(200, Math.floor(Number(body.mysteryBag) || 0)));
                if (n > 0) await db.query(`UPDATE mkt_buyer SET mystery_bags_bought = COALESCE(mystery_bags_bought, 0) + $2 WHERE id = $1`, [buyerId, n]).catch(() => {});
                if (body.bigHit) await db.query(`UPDATE mkt_buyer SET mystery_big_hit = TRUE WHERE id = $1`, [buyerId]).catch(() => {});
                const granted = await syncEarnedBadges(buyerId).catch(() => []);
                return noStore({ ok: true, kind: "mysteryBag", credited: n, bigHit: Boolean(body.bigHit), badges: granted.map((b) => b.slug) });
            }

            // Give a single loot chest.
            if (body?.chest) {
                const tier = String(body.chest);
                const def = CHEST_TIERS[tier];
                if (!def) return noStore({ error: "unknown_tier" }, { status: 400 });
                await addChests(buyerId, { [tier]: 1 });
                await recordGift(buyerId, { kind: "chest", title: "🎁 You got a loot chest!", body: `A ${def.label} landed in your stash — open it now!`, icon: def.emoji });
                after(() => giftNotify(buyerId, `${def.emoji} A gift from The Wolf Den!`, `A ${def.label} just dropped into your stash — tap to rip it open! ✨`, "gift-chest", { type: "gift_chest", tier }));
                return noStore({ ok: true, kind: "chest", tier });
            }
            // Give gold.
            if (body?.gold) {
                const amt = Math.max(1, Math.min(100000, Math.floor(Number(body.gold) || 0)));
                await db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [buyerId, amt]).catch(() => {});
                await logCoin(buyerId, amt, "admin_grant").catch(() => {});
                await recordGift(buyerId, { kind: "gold", title: "💰 You got gold!", body: `${amt.toLocaleString()} gold landed in your purse — spend it in the gear shop!`, icon: "💰" });
                after(() => giftNotify(buyerId, "💰 A gift from The Wolf Den!", `${amt.toLocaleString()} gold just landed in your purse — spend it in the gear shop! ✨`, "gift-gold", { type: "gift_gold", amount: amt }));
                return noStore({ ok: true, kind: "gold", amount: amt });
            }
            // Grant a specific pet (unlock it for this member, like buying/earning one).
            if (body?.petId) {
                const pet = collectibleById(String(body.petId));
                if (!pet) return noStore({ error: "unknown_pet" }, { status: 400 });
                const existing = await db
                    .queryOne(`SELECT 1 FROM mkt_cosmetic_unlock WHERE buyer_id = $1 AND category = 'pet' AND ref = $2`, [buyerId, pet.id])
                    .catch(() => null);
                if (existing) return noStore({ ok: true, kind: "pet", petId: pet.id, name: pet.name, alreadyOwned: true });
                await db.query(`INSERT INTO mkt_cosmetic_unlock (buyer_id, category, ref) VALUES ($1, 'pet', $2) ON CONFLICT DO NOTHING`, [buyerId, pet.id]).catch(() => {});
                await recordGift(buyerId, { kind: "pet", title: "🐾 You got a pet!", body: `${pet.name} joined your pack — equip it from your Pets!`, icon: "🐾", rarity: pet.rarity });
                after(() => giftNotify(buyerId, "🐾 A gift from The Wolf Den!", `${pet.name} just joined your pack — tap to make it your companion! ✨`, "gift-pet", { type: "gift_pet", petId: pet.id }));
                return noStore({ ok: true, kind: "pet", petId: pet.id, name: pet.name });
            }
            // Grant a specific item.
            const itemId = String(body?.itemId || "").trim();
            if (!itemId) return noStore({ error: "missing_params" }, { status: 400 });
            const res = await grantItem(buyerId, itemId, "admin");
            const def = ITEMS.find((i) => i.id === itemId);
            // Only alert on a NEW grant (not a re-grant of something they already own).
            if (res?.granted && def) {
                await recordGift(buyerId, { kind: "item", title: "🎁 You got new gear!", body: `You received ${RARITY_ARTICLE[def.rarity] || ""}${def.name} — equip it now!`, icon: RARITY_EMOJI[def.rarity] || "🎁", rarity: def.rarity });
                after(() => giftNotify(
                    buyerId,
                    `${RARITY_EMOJI[def.rarity] || "🎁"} A gift from The Wolf Den!`,
                    `You received ${RARITY_ARTICLE[def.rarity] || ""}${def.name} — tap to equip it! ✨`,
                    "gift-item",
                    { type: "gift_item", itemId },
                ));
            }
            return noStore({ ...res, name: def?.name || null, rarity: def?.rarity || null }, { status: res.ok ? 200 : 400 });
        } catch (error) {
            return internalError(error, { event: "admin.items.grant.failure" });
        }
    });
}
