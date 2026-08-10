import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { FUSE_COUNT, FUSE_MAX_TIER, GEMS, GEM_TIERS, MAX_SOCKETS, gemById, gemId, socketCost, sumGemStats } from "@/lib/marketplace/gems.js";
import { describeStats, itemById } from "@/lib/marketplace/items.js";
import { isOwner } from "@/lib/marketplace/owner.js";

// ── THE JEWELCUTTER ──────────────────────────────────────────────────────────────────────────────────────────
// The bench where a gem meets a piece of gear. Two operations and nothing else: CUT a socket into something
// (expensive, permanent, one per piece), and SET a gem into a socket you have already cut.
//
// UNDER CONSTRUCTION. `jewelsEnabled` is the one predicate the whole feature reads — the bench, the drops, the
// bag and the stat merge — so opening it is one line rather than a hunt. Both halves are gated deliberately:
// a member who cannot reach the bench must not be finding jewels either, or the drop is a mystery item with
// nowhere to go and the first thing anybody does is ask what it is for.
export const jewelsEnabled = (buyerId) => isOwner(buyerId);

// ── THE BAG ──────────────────────────────────────────────────────────────────────────────────────────────────
export async function getGems(buyerId) {
    if (!buyerId || !jewelsEnabled(buyerId)) return [];
    const rows = await db.query(
        `SELECT gem_id, count FROM mkt_gem WHERE buyer_id = $1 AND count > 0`, [buyerId]
    ).catch(() => []);
    const held = new Map(rows.map((r) => [r.gem_id, Number(r.count) || 0]));
    // Everything you hold, in catalog order, so the bag reads as a set you are filling rather than a list of
    // whatever happened to drop.
    return GEMS.filter((g) => held.get(g.id) > 0).map((g) => {
        const next = g.tier + 1 <= FUSE_MAX_TIER
            ? GEMS.find((x) => x.kind === g.kind && x.tier === g.tier + 1) || null
            : null;
        return {
            ...g,
            count: held.get(g.id),
            // What three of them would make, and whether you are holding three.
            fuseInto: next ? { id: next.id, name: next.name, stats: next.stats } : null,
            canFuse: Boolean(next) && held.get(g.id) >= FUSE_COUNT,
            fuseCount: FUSE_COUNT,
        };
    });
}

/** Put a gem in the bag. The one way in — drops, purchases and admin grants all land here. */
export async function grantGem(buyerId, gemId, n = 1, source = "drop") {
    const g = gemById(gemId);
    if (!buyerId || !g || n <= 0) return { ok: false };
    await db.query(
        `INSERT INTO mkt_gem (buyer_id, gem_id, count) VALUES ($1, $2, $3)
         ON CONFLICT (buyer_id, gem_id) DO UPDATE SET count = mkt_gem.count + $3`,
        [buyerId, g.id, n]
    ).catch(() => {});
    await db.query(
        `INSERT INTO mkt_gem_event (buyer_id, kind, gem_id, meta) VALUES ($1, $2, $3, $4::jsonb)`,
        [buyerId, source === "drop" ? "drop" : "bought", g.id, JSON.stringify({ n, source })]
    ).catch(() => {});
    return { ok: true, gem: g, n };
}

// ── WHAT IS SET INTO WHAT ────────────────────────────────────────────────────────────────────────────────────
/** Sockets for a member's items → { item_id: [{ idx, gemId }] }. */
export async function socketsFor(buyerId, itemIds = null) {
    if (!buyerId) return {};
    const rows = itemIds?.length
        ? await db.query(`SELECT item_id, idx, gem_id FROM mkt_item_socket WHERE buyer_id = $1 AND item_id = ANY($2) ORDER BY idx`, [buyerId, itemIds]).catch(() => [])
        : await db.query(`SELECT item_id, idx, gem_id FROM mkt_item_socket WHERE buyer_id = $1 ORDER BY idx`, [buyerId]).catch(() => []);
    const out = {};
    for (const r of rows) {
        if (!out[r.item_id]) out[r.item_id] = [];
        out[r.item_id].push({ idx: Number(r.idx) || 0, gemId: r.gem_id || null });
    }
    return out;
}

/**
 * The combat stats a member's SOCKETED gems are worth, for the items passed in.
 *
 * Reads exactly like enhanceBonusFor in inventory.js and merges at the same place, so a socketed ruby and a
 * forge enhancement are the same kind of number by the time anything fights with them.
 */
export async function socketBonusFor(buyerId, itemIds) {
    if (!buyerId || !itemIds?.length || !jewelsEnabled(buyerId)) return {};
    const rows = await db.query(
        `SELECT gem_id FROM mkt_item_socket WHERE buyer_id = $1 AND item_id = ANY($2) AND gem_id IS NOT NULL`,
        [buyerId, itemIds]
    ).catch(() => []);
    return sumGemStats(rows.map((r) => r.gem_id));
}

// ── WHEN THE ITEM LEAVES YOUR HANDS ──────────────────────────────────────────────────────────────────────────
// Salvaging, selling, auctioning or trading a socketed piece used to take the jewel with it: the item row was
// deleted and the socket row was left orphaned, so a Flawless Ruby somebody spent a week of mining on simply
// stopped existing, silently, with no line anywhere saying where it went.
//
// The gem comes HOME instead. Not destroyed, not sold with the piece — back in the bag, because you paid for
// the socket and you found the stone, and neither of those was part of the trade. Called from every disposal
// path; safe to call on an item with no socket, which is what makes it safe to bolt onto all of them.
export async function reclaimGems(buyerId, itemId, reason = "item_gone") {
    if (!buyerId || !itemId) return [];
    const rows = await db.query(
        `DELETE FROM mkt_item_socket WHERE buyer_id = $1 AND item_id = $2 RETURNING gem_id`,
        [buyerId, itemId]
    ).catch(() => []);
    const back = [];
    for (const r of rows) {
        if (!r.gem_id) continue;
        await grantGem(buyerId, r.gem_id, 1, "reclaimed");
        await db.query(`INSERT INTO mkt_gem_event (buyer_id, kind, gem_id, item_id, meta) VALUES ($1,'reclaimed',$2,$3,$4::jsonb)`,
            [buyerId, r.gem_id, itemId, JSON.stringify({ reason })]).catch(() => {});
        back.push(gemById(r.gem_id));
    }
    return back.filter(Boolean);
}

// ── FUSING ──────────────────────────────────────────────────────────────────────────────────────────────────
// Three of a kind become one of the tier above. This is what stops the bottom tiers being litter: a Chipped
// Ruby is not worth setting into anything by the time you have real gear, but nine of them are a Polished one,
// and the mine hands out chips by the fistful. It also gives the shallow end of the mine a purpose after you
// have outgrown what it drops.
//
// The kind never changes — only the tier. Turning rubies into emeralds would make the colour meaningless and
// the whole choice of which stat to chase collapses into "fuse whatever you have most of".
export async function fuseGems(buyerId, id) {
    if (!jewelsEnabled(buyerId)) return { ok: false, error: "not_available" };
    const gem = gemById(id);
    if (!gem) return { ok: false, error: "bad_gem" };
    // The ladder stops at Polished — above that a jewel is mined or it is not had. Checked here as well as
    // hidden in the bag, because a shop rule that only exists in the UI is not a rule.
    if (gem.tier + 1 > FUSE_MAX_TIER) return { ok: false, error: "max_tier" };
    const next = gemById(gemId(gem.kind, gem.tier + 1));
    if (!next) return { ok: false, error: "max_tier" };

    // Spend conditionally — three at once, in one statement, so two taps cannot both pass a count check that
    // only one of them can afford.
    const spent = await db.queryOne(
        `UPDATE mkt_gem SET count = count - $3 WHERE buyer_id = $1 AND gem_id = $2 AND count >= $3 RETURNING count`,
        [buyerId, gem.id, FUSE_COUNT]
    ).catch(() => null);
    if (!spent) return { ok: false, error: "not_enough" };

    await grantGem(buyerId, next.id, 1, "fuse");
    await db.query(`INSERT INTO mkt_gem_event (buyer_id, kind, gem_id, meta) VALUES ($1, 'fused', $2, $3::jsonb)`,
        [buyerId, next.id, JSON.stringify({ from: gem.id, spent: FUSE_COUNT })]).catch(() => {});
    await trackActivity(buyerId, "gem_fuse", { from: gem.id, to: next.id }).catch(() => {});
    return { ok: true, from: gem, to: next };
}

// ── CUTTING A SOCKET ─────────────────────────────────────────────────────────────────────────────────────────
// Expensive on purpose, and priced by the item's rarity: a socket in a mythic is a commitment, a socket in a
// common is a cheap lesson in what sockets do.
export async function cutSocket(buyerId, itemId) {
    if (!jewelsEnabled(buyerId)) return { ok: false, error: "not_available" };
    const item = itemById(itemId);
    if (!item) return { ok: false, error: "bad_item" };
    // You have to own it. Checked against the same table equip checks use, so a crafted POST cannot socket
    // something out of the catalog it has never held.
    const owns = await db.queryOne(`SELECT 1 FROM mkt_user_item WHERE buyer_id = $1 AND item_id = $2`, [buyerId, itemId]).catch(() => null);
    if (!owns) return { ok: false, error: "not_owned" };

    const have = await db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_item_socket WHERE buyer_id = $1 AND item_id = $2`, [buyerId, itemId]).catch(() => null);
    if ((have?.n || 0) >= MAX_SOCKETS) return { ok: false, error: "already_socketed" };

    const cost = socketCost(item.rarity);
    // Charge conditionally inside the UPDATE — neon() has no transactions, so the balance check and the spend
    // have to be one statement or two taps both pass a check that only one of them can afford.
    const paid = await db.queryOne(
        `UPDATE mkt_buyer SET gold = gold - $2, updated_at = NOW() WHERE id = $1 AND gold >= $2 RETURNING gold`,
        [buyerId, cost]
    ).catch(() => null);
    if (!paid) return { ok: false, error: "not_enough_gold", cost };
    await logCoin(buyerId, -cost, "socket_cut", { balanceAfter: paid.gold, meta: { itemId } }).catch(() => {});

    await db.query(
        `INSERT INTO mkt_item_socket (buyer_id, item_id, idx) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [buyerId, itemId, have?.n || 0]
    ).catch(() => {});
    await db.query(`INSERT INTO mkt_gem_event (buyer_id, kind, item_id, meta) VALUES ($1, 'socket_cut', $2, $3::jsonb)`,
        [buyerId, itemId, JSON.stringify({ cost })]).catch(() => {});
    await trackActivity(buyerId, "socket_cut", { itemId, cost }).catch(() => {});
    return { ok: true, cost };
}

// ── SETTING A GEM ────────────────────────────────────────────────────────────────────────────────────────────
export async function setGem(buyerId, itemId, gemId, idx = 0) {
    if (!jewelsEnabled(buyerId)) return { ok: false, error: "not_available" };
    const gem = gemById(gemId);
    if (!gem || !itemById(itemId)) return { ok: false, error: "bad_gem" };

    const socket = await db.queryOne(
        `SELECT gem_id FROM mkt_item_socket WHERE buyer_id = $1 AND item_id = $2 AND idx = $3`,
        [buyerId, itemId, idx]
    ).catch(() => null);
    if (!socket) return { ok: false, error: "no_socket" };
    if (socket.gem_id) return { ok: false, error: "socket_full" };

    // Spend the gem conditionally, for the same reason the gold is spent conditionally.
    const spent = await db.queryOne(
        `UPDATE mkt_gem SET count = count - 1 WHERE buyer_id = $1 AND gem_id = $2 AND count > 0 RETURNING count`,
        [buyerId, gem.id]
    ).catch(() => null);
    if (!spent) return { ok: false, error: "no_gem" };

    await db.query(
        `UPDATE mkt_item_socket SET gem_id = $3, set_at = NOW() WHERE buyer_id = $1 AND item_id = $2 AND idx = $4`,
        [buyerId, itemId, gem.id, idx]
    ).catch(() => {});
    await db.query(`INSERT INTO mkt_gem_event (buyer_id, kind, gem_id, item_id) VALUES ($1, 'gem_set', $2, $3)`,
        [buyerId, gem.id, itemId]).catch(() => {});
    await trackActivity(buyerId, "gem_set", { itemId, gemId: gem.id }).catch(() => {});
    return { ok: true, gem };
}

/**
 * Take a gem back out. TWO WAYS, and the difference is the decision.
 *
 * FREE, and it breaks. Setting a jewel has to cost something or a socket is a slot you shuffle per opponent.
 * PAID, and it survives — the jeweller cuts it out properly for gold scaled to the tier, so a good stone in
 * the wrong piece is a mistake you can buy your way out of rather than a week of mining thrown away.
 *
 * Which one you get is `keep`, and the button says which before you press it rather than after.
 */
export const EXTRACT_COST = (tier = 1) => 800 * Math.max(1, Number(tier) || 1);

export async function pullGem(buyerId, itemId, idx = 0, keep = false) {
    if (!jewelsEnabled(buyerId)) return { ok: false, error: "not_available" };
    // The old value comes from a FROM subquery, not from RETURNING: RETURNING hands back the row as it is
    // AFTER the update, which for this statement is the NULL we just wrote. The join reads the pre-update
    // snapshot, so `was` is the gem that actually broke.
    const socket = await db.queryOne(
        `UPDATE mkt_item_socket s SET gem_id = NULL, set_at = NULL
           FROM (SELECT gem_id FROM mkt_item_socket
                  WHERE buyer_id = $1 AND item_id = $2 AND idx = $3) o
          WHERE s.buyer_id = $1 AND s.item_id = $2 AND s.idx = $3 AND s.gem_id IS NOT NULL
        RETURNING o.gem_id AS was`,
        [buyerId, itemId, idx]
    ).catch(() => null);
    if (!socket) return { ok: false, error: "empty" };
    const gem = gemById(socket.was);

    // PAID: cut it out intact. Charged conditionally like every other spend; if the charge fails the gem is
    // handed back anyway rather than being destroyed for a payment that never happened.
    if (keep && gem) {
        const cost = EXTRACT_COST(gem.tier);
        const paid = await db.queryOne(
            `UPDATE mkt_buyer SET gold = gold - $2, updated_at = NOW() WHERE id = $1 AND gold >= $2 RETURNING gold`,
            [buyerId, cost]
        ).catch(() => null);
        if (!paid) {
            // Put it back where it was — refusing AFTER emptying the socket would be the worst of both.
            await db.query(`UPDATE mkt_item_socket SET gem_id = $3, set_at = NOW() WHERE buyer_id = $1 AND item_id = $2 AND idx = $4`,
                [buyerId, itemId, gem.id, idx]).catch(() => {});
            return { ok: false, error: "not_enough_gold", cost };
        }
        await logCoin(buyerId, -cost, "gem_extract", { balanceAfter: paid.gold, meta: { itemId, gemId: gem.id } }).catch(() => {});
        await grantGem(buyerId, gem.id, 1, "extracted");
        await db.query(`INSERT INTO mkt_gem_event (buyer_id, kind, gem_id, item_id, meta) VALUES ($1,'gem_extracted',$2,$3,$4::jsonb)`,
            [buyerId, gem.id, itemId, JSON.stringify({ cost })]).catch(() => {});
        return { ok: true, kept: gem, cost };
    }

    await db.query(`INSERT INTO mkt_gem_event (buyer_id, kind, gem_id, item_id) VALUES ($1, 'gem_pulled', $2, $3)`,
        [buyerId, socket.was || null, itemId]).catch(() => {});
    return { ok: true, destroyed: socket.was || null };
}

// ── THE BENCH, AS A SCREEN ───────────────────────────────────────────────────────────────────────────────────
// Everything the Jewelcutter renders from, in one read: what you hold, what you own that could take a socket,
// and what is already set.
export async function getJewellerState(buyerId) {
    if (!buyerId) return { unlocked: false };
    if (!jewelsEnabled(buyerId)) return { unlocked: false };

    const [owned, socketRows, gems, goldRow, equipped, enhRows] = await Promise.all([
        db.query(`SELECT item_id FROM mkt_user_item WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        socketsFor(buyerId),
        getGems(buyerId),
        db.queryOne(`SELECT gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        // What is on your body right now — the pieces you are most likely to want a socket in.
        db.query(`SELECT slot, item_id FROM mkt_user_equipment WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        // And what the Forge has already added to them, so the row shows the piece as it FIGHTS rather than as
        // the catalog describes it. A +6 ring reading as its base stats on this bench would be the one screen
        // in the game that lies about your own gear.
        db.query(`SELECT item_id, level, stat_bonus FROM mkt_item_enhance WHERE buyer_id = $1`, [buyerId]).catch(() => []),
    ]);
    const wearing = new Set(equipped.map((r) => r.item_id));
    const enh = new Map(enhRows.map((r) => [r.item_id, {
        level: Number(r.level) || 0,
        bonus: typeof r.stat_bonus === "string" ? (() => { try { return JSON.parse(r.stat_bonus); } catch { return {}; } })() : (r.stat_bonus || {}),
    }]));

    const pieces = owned
        .map((r) => itemById(r.item_id))
        // Only real gear: a collection piece is not worn and a store perk is not a weapon.
        .filter((it) => it && it.slot)
        .map((it) => {
            const sockets = socketRows[it.id] || [];
            const e = enh.get(it.id) || null;
            // Base + forge enhancement, merged the way the fight merges them.
            const total = { ...(it.stats || {}) };
            for (const [k, v] of Object.entries(e?.bonus || {})) total[k] = (total[k] || 0) + (Number(v) || 0);
            return {
                id: it.id, name: it.name, slot: it.slot, rarity: it.rarity, icon: it.icon,
                cost: socketCost(it.rarity),
                equipped: wearing.has(it.id),
                enhanceLevel: e?.level || 0,
                stats: total,
                statLine: describeStats(total),
                sockets: sockets.map((s) => {
                    const g = s.gemId ? gemById(s.gemId) : null;
                    return { idx: s.idx, gem: g, extractCost: g ? EXTRACT_COST(g.tier) : null };
                }),
                canCut: sockets.length < MAX_SOCKETS,
            };
        })
        // Worn first, then whatever already has a socket, then by name. The piece you are wearing is the piece
        // you came here about.
        .sort((a, z) => Number(z.equipped) - Number(a.equipped)
            || z.sockets.length - a.sockets.length
            || a.name.localeCompare(z.name));

    return {
        unlocked: true,
        gold: Number(goldRow?.gold) || 0,
        gems,
        pieces,
        tiers: GEM_TIERS,
        maxSockets: MAX_SOCKETS,
    };
}
