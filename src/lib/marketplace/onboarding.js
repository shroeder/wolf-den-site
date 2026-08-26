import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";
import { trackActivity } from "@/lib/marketplace/activity.js";

// ── "Getting started" — a first-week ramp through every system ─────────────────────────────────────────────
// This used to be two entries: allow push, allow location. That is a permissions prompt with a gold reward, not
// onboarding — a new member could finish it in ten seconds and still not know the farm, the boat, the kitchen,
// the forge, the town or the boss existed.
//
// Two kinds of task now:
//
//   PERMISSION tasks stay client-claimed. There is no server-side way to know the browser granted push or
//   location, and the reward is small enough that trusting the client is the right trade.
//
//   DOING tasks are VERIFIED from real activity and pay themselves out the moment they're true. Nothing to
//   click and nothing to trust: play the game and the list ticks. `events` are matched against
//   mkt_activity_event; `verify` runs its own query for the things activity doesn't record.
//
// The last group deliberately ties the real shop to the game — checking in, buying something, telling us what
// you're hunting for. That is the first taste of being rewarded for being a good customer, which is the whole
// point of the thing.

export const ONBOARDING_TASKS = [
    // Setup — client-claimed.
    { key: "notifications", icon: "🔔", label: "Turn on notifications", desc: "Get pinged for boss fights, trades & rewards.", gold: 125, claim: "client" },
    { key: "location", icon: "📍", label: "Enable location", desc: "Your farm & sailing match your real weather.", gold: 125, claim: "client" },

    // Learn the systems — each is the single action that makes the feature click.
    { key: "first_plant", icon: "🌱", label: "Plant your first crop", desc: "The farm grows ingredients while you're away.", gold: 100, events: ["plant_seed"] },
    { key: "first_harvest", icon: "🌾", label: "Harvest something", desc: "Ripe crops feed your kitchen and your pets.", gold: 100, events: ["harvest_crop"] },
    { key: "first_cast", icon: "🎣", label: "Land a fish", desc: "The sea pays in gear, chests and the odd pet.", gold: 100, events: ["fish_caught"] },
    { key: "first_voyage", icon: "⛵", label: "Take the boat out", desc: "Voyages dig up treasure you can't get ashore.", gold: 125, events: ["sail_voyage"] },
    { key: "first_pet", icon: "🐾", label: "Equip a pet", desc: "Your companion fights beside you and earns while idle.", gold: 100, events: ["equip_pet"] },
    { key: "first_boss", icon: "⚔️", label: "Strike the weekly boss", desc: "Everyone fights the same boss. Damage earns raffle tickets.", gold: 150, events: ["boss_attack"] },
    { key: "first_forge", icon: "🔨", label: "Use the forge", desc: "Salvage gear into parts, hammer parts into better gear.", gold: 125, events: ["craft_salvage", "craft_enhance"] },
    { key: "first_chest", icon: "🧰", label: "Open a chest", desc: "Chests are where most of your early gear comes from.", gold: 75, events: ["open_chest"] },
    { key: "first_town", icon: "🏘️", label: "Visit the town", desc: "The plaza has a merchant, a tavern and other members' pets.", gold: 75, events: ["pet_other", "town_merchant", "tavern_barkeep", "stockade_act"] },

    // The real shop.
    { key: "first_checkin", icon: "📅", label: "Check in for the day", desc: "A daily streak pays more the longer you keep it.", gold: 100, events: ["daily_checkin"] },
    { key: "wishlist", icon: "🔎", label: "Add a card to Looking For", desc: "We'll tell you when it lands in the case.", gold: 125, verify: "wishlist" },
    { key: "in_store", icon: "🛒", label: "Buy something in store", desc: "Real purchases earn XP and gold here too.", gold: 250, verify: "purchase" },
];

const TASK_BY_KEY = new Map(ONBOARDING_TASKS.map((t) => [t.key, t]));

const parseDone = (raw) => { try { const p = typeof raw === "string" ? JSON.parse(raw) : (raw || []); return Array.isArray(p) ? p : []; } catch { return []; } };

// Which DOING tasks are already true for this member. One pass over their distinct activity events plus two
// small existence checks — not one query per task, which would be a dozen round trips on every page load.
async function completedByActivity(buyerId, pending) {
    if (!pending.length) return new Set();
    const wanted = [...new Set(pending.flatMap((t) => t.events || []))];
    const [events, wish, purchase] = await Promise.all([
        wanted.length
            ? db.query(`SELECT DISTINCT event FROM mkt_activity_event WHERE buyer_id = $1 AND event = ANY($2)`, [buyerId, wanted]).catch(() => [])
            : [],
        pending.some((t) => t.verify === "wishlist")
            ? db.queryOne(`SELECT 1 AS x FROM mkt_want WHERE buyer_id = $1 LIMIT 1`, [buyerId]).catch(() => null)
            : null,
        pending.some((t) => t.verify === "purchase")
            // purchase_spend/purchase_flat/first_purchase are how an in-store sale reaches a member's account.
            ? db.queryOne(`SELECT 1 AS x FROM mkt_xp_event WHERE buyer_id = $1 AND action IN ('purchase_spend','purchase_flat','first_purchase') LIMIT 1`, [buyerId]).catch(() => null)
            : null,
    ]);
    const seen = new Set(events.map((r) => r.event));
    const out = new Set();
    for (const t of pending) {
        if (t.events?.some((e) => seen.has(e))) out.add(t.key);
        else if (t.verify === "wishlist" && wish) out.add(t.key);
        else if (t.verify === "purchase" && purchase) out.add(t.key);
    }
    return out;
}

export async function getOnboarding(buyerId) {
    if (!buyerId) return { tasks: [], allDone: true };
    const row = await db.queryOne(`SELECT onboarding_done FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const done = new Set(parseDone(row?.onboarding_done));

    // DOING tasks pay themselves out the moment they're true — the member never clicks "claim" on something
    // they already did. Only unclaimed ones are checked, so a finished list costs nothing to read.
    const pending = ONBOARDING_TASKS.filter((t) => t.claim !== "client" && !done.has(t.key));
    const earned = await completedByActivity(buyerId, pending);
    if (earned.size) {
        const gold = ONBOARDING_TASKS.filter((t) => earned.has(t.key)).reduce((n, t) => n + t.gold, 0);
        for (const k of earned) done.add(k);
        // Conditional on the key still being absent, so two concurrent reads can't both pay for the same task.
        const paid = await db.queryOne(
            `UPDATE mkt_buyer SET onboarding_done = $2::jsonb, gold = gold + $3
              WHERE id = $1 AND NOT (onboarding_done @> $4::jsonb) RETURNING gold`,
            [buyerId, JSON.stringify([...done]), gold, JSON.stringify([...earned])]
        ).catch(() => null);
        if (paid) await logCoin(buyerId, gold, "onboarding", { balanceAfter: paid.gold, meta: { keys: [...earned], auto: true } }).catch(() => {});
    }

    const tasks = ONBOARDING_TASKS.map((t) => ({
        key: t.key, icon: t.icon, label: t.label, desc: t.desc, gold: t.gold,
        claimed: done.has(t.key), auto: t.claim !== "client",
    }));
    return { tasks, allDone: tasks.every((t) => t.claimed), justEarned: [...earned] };
}

// Grant a task's gold once. Trusts the client only claims after the real permission grant (low-stakes reward).
export async function claimOnboarding(buyerId, key) {
    const task = TASK_BY_KEY.get(key);
    if (!buyerId || !task) return { ok: false, error: "bad_task" };
    // Only the permission tasks are claimable. Everything else is verified from real activity and paid by
    // getOnboarding — otherwise a member could POST their way through the whole ramp without playing it.
    if (task.claim !== "client") return { ok: false, error: "not_claimable", ...(await getOnboarding(buyerId)) };
    const row = await db.queryOne(`SELECT onboarding_done FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const done = new Set(parseDone(row?.onboarding_done));
    if (done.has(key)) return { ok: false, error: "claimed", ...(await getOnboarding(buyerId)) };
    done.add(key);
    const paid = await db.queryOne(`UPDATE mkt_buyer SET onboarding_done = $2::jsonb, gold = gold + $3 WHERE id = $1 RETURNING gold`, [buyerId, JSON.stringify([...done]), task.gold]).catch(() => null);
    if (!paid) return { ok: false, error: "db" };
    await logCoin(buyerId, task.gold, "onboarding", { balanceAfter: paid.gold, meta: { key } }).catch(() => {});
    await trackActivity(buyerId, "onboard_claim", { key, gold: task.gold }).catch(() => {});
    return { ok: true, gold: task.gold, ...(await getOnboarding(buyerId)) };
}
