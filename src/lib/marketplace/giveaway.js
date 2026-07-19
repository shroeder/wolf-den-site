import "server-only";

import { db } from "@/lib/db";
import { addChests, CHEST_TIERS } from "@/lib/marketplace/chests.js";
import { grantItem } from "@/lib/marketplace/inventory.js";
import { itemById } from "@/lib/marketplace/items.js";
import { sendWebPush } from "@/lib/push/web-push.js";
import { sendBuyerPush } from "@/lib/push/send.js";
import { recordGift } from "@/lib/marketplace/gifts.js";

// "Currently active heroes" = every member who has built a hero (alias set). A giveaway is a one-time drop
// to THIS roster only — future signups are not retroactively included, exactly as Luke wants. We snapshot
// the ids up front so nobody who registers mid-run gets pulled in.
async function activeHeroIds() {
    const rows = await db.query(`SELECT id FROM mkt_buyer WHERE alias IS NOT NULL`).catch(() => []);
    return rows.map((r) => r.id);
}

// Best-effort push to everyone in the drop, on BOTH channels (FCM marketplace app + browser web push)
// so recipients actually get alerted (fire-and-forget; failures ignored per-member).
async function pushAll(ids, payload) {
    await Promise.allSettled(
        ids.flatMap((id) => [
            sendWebPush(id, payload),
            sendBuyerPush(id, { title: payload.title, body: payload.body, data: payload.data || {} }),
        ])
    );
}

// Give N loot chests of a tier to every active hero. Returns recipient count.
export async function giveawayChest({ tier = "wooden", count = 1 } = {}) {
    const def = CHEST_TIERS[tier];
    if (!def) return { ok: false, error: "unknown_tier" };
    const n = Math.max(1, Math.min(10, Math.round(Number(count) || 1)));
    const ids = await activeHeroIds();
    for (const id of ids) {
        await addChests(id, { [tier]: n });
        await recordGift(id, { kind: "chest", title: "🎁 Free loot!", body: n > 1 ? `${n}× ${def.label} landed in your stash — open them now!` : `A ${def.label} landed in your stash — open it now!`, icon: def.emoji });
    }
    await pushAll(ids, {
        title: `${def.emoji} Free loot!`,
        body: n > 1 ? `${n}× ${def.label} just landed in your stash — open them now!` : `A ${def.label} just landed in your stash — open it now!`,
        url: "/marketplace/inventory",
        tag: "giveaway-chest",
    });
    return { ok: true, kind: "chest", tier, count: n, recipients: ids.length };
}

// Give a specific gear item to every active hero (they can equip it now or once they hit its reqLevel).
export async function giveawayItem({ itemId } = {}) {
    const item = itemById(itemId);
    if (!item) return { ok: false, error: "unknown_item" };
    const ids = await activeHeroIds();
    for (const id of ids) {
        await grantItem(id, item.id, "giveaway").catch(() => {});
        await recordGift(id, { kind: "item", title: "🎁 Free gear!", body: `You received ${item.name} — equip it now!`, icon: "🎁", rarity: item.rarity });
    }
    const lvl = item.reqLevel ? ` (equip at level ${item.reqLevel})` : "";
    await pushAll(ids, {
        title: `${item.icon || "🎁"} Free gear!`,
        body: `You received ${item.name}${lvl} — check your inventory!`,
        url: "/marketplace/inventory",
        tag: "giveaway-item",
    });
    return { ok: true, kind: "item", itemId: item.id, name: item.name, recipients: ids.length };
}

// Give gold to every active hero.
export async function giveawayGold({ amount = 100 } = {}) {
    const gold = Math.max(1, Math.min(100000, Math.round(Number(amount) || 0)));
    const ids = await activeHeroIds();
    for (const id of ids) {
        await db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [id, gold]).catch(() => {});
        await recordGift(id, { kind: "gold", title: "🪙 Free gold!", body: `${gold.toLocaleString()} gold landed in your purse — spend it in the gear shop!`, icon: "🪙" });
    }
    await pushAll(ids, {
        title: "🪙 Free gold!",
        body: `${gold} gold just dropped into your purse — spend it in the gear shop!`,
        url: "/marketplace/inventory",
        tag: "giveaway-gold",
    });
    return { ok: true, kind: "gold", amount: gold, recipients: ids.length };
}
