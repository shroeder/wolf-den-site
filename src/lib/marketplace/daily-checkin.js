import "server-only";

import { db } from "@/lib/db";
import { getActiveBoss } from "@/lib/marketplace/boss.js";
import { getDailyQuests } from "@/lib/marketplace/quests.js";
import { petLevelInfo } from "@/lib/marketplace/pet-level.js";
import { collectibleById } from "@/lib/marketplace/collectibles.js";
import { addChests, CHEST_TIERS } from "@/lib/marketplace/chests.js";
import { grantConsumable, CONSUMABLES } from "@/lib/marketplace/consumables.js";
import { getEquippedIds } from "@/lib/marketplace/inventory.js";
import { rollLoginProcs, COUPON_PCT, COUPON_MAX } from "@/lib/marketplace/signatures.js";
import { COLLECTIBLES } from "@/lib/marketplace/collectibles.js";
import { trackActivity } from "@/lib/marketplace/activity.js";

// DAILY CHECK-IN — a login-streak reward + a "while you were away" summary, shown once per day. The streak
// is consecutive days claimed; miss a day and it resets. Rewards escalate over a 7-day cycle, with a big
// payoff on day 7 (then the cycle repeats — so every 7th day is a jackpot).

const STREAK_REWARDS = [
    { gold: 75, label: "75 gold", emoji: "🪙" },
    { gold: 150, label: "150 gold", emoji: "🪙" },
    { treat: "treat_snack", label: "a Hearty Snack (pet XP)", emoji: "🍖" },
    { gold: 250, label: "250 gold", emoji: "🪙" },
    { chest: "iron", label: "an Iron loot chest", emoji: "⚙️" },
    { gold: 400, treat: "treat_toy", label: "400 gold + a Chew Toy", emoji: "🎁" },
    { gold: 500, chest: "gold", label: "500 gold + a GOLD chest", emoji: "🏆" }, // day-7 jackpot
];
const rewardForStreak = (streak) => STREAK_REWARDS[((Math.max(1, streak) - 1) % 7)];

// Store-timezone day helpers (America/Chicago), as "YYYY-MM-DD" strings.
const dayStr = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
function storeToday() { return dayStr(new Date()); }
function storeYesterday() { return dayStr(new Date(Date.now() - 86400000)); }
// IMPORTANT: streak_claimed_day is a SQL DATE. node-postgres parses it into a JS Date at the PROCESS's
// local-midnight, so on Vercel (UTC) reformatting it in America/Chicago rolls it back a day and "claimed
// today" never registers. So we always SELECT `streak_claimed_day::text` (already "YYYY-MM-DD" in the DB)
// and compare strings — never build a JS Date from it. asDay just normalizes an already-"YYYY-MM-DD" value.
const asDay = (v) => (v ? String(v).slice(0, 10) : null);

// A short "while you were away" summary — all truthful, computed live.
async function awaySummary(buyerId) {
    const [boss, buyer, quests] = await Promise.all([
        getActiveBoss().catch(() => null),
        db.queryOne(`SELECT featured_collectible FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        getDailyQuests(buyerId).catch(() => ({ quests: [] })),
    ]);
    let bossName = null;
    let packDamage24h = 0;
    if (boss) {
        bossName = boss.name;
        const r = await db.queryOne(`SELECT COALESCE(SUM(damage), 0)::bigint AS d FROM boss_hit WHERE boss_id = $1 AND kind = 'auto' AND created_at > NOW() - interval '24 hours'`, [boss.id]).catch(() => null);
        packDamage24h = Number(r?.d || 0);
    }
    let pet = null;
    if (buyer?.featured_collectible) {
        const xpRow = await db.queryOne(`SELECT xp FROM mkt_pet_level WHERE buyer_id = $1 AND pet_id = $2`, [buyerId, buyer.featured_collectible]).catch(() => null);
        const info = petLevelInfo(xpRow?.xp || 0);
        pet = { name: collectibleById(buyer.featured_collectible)?.name || "your pet", level: info.level, into: info.into, span: info.span, maxed: info.maxed };
    }
    const questsReady = (quests.quests || []).filter((q) => q.done && !q.claimed).length;
    return { bossName, packDamage24h, pet, questsReady };
}

// GET — the member's check-in state: streak, today's claimable reward, and the away summary.
export async function getDailyCheckin(buyerId) {
    if (!buyerId) return { signedIn: false, show: false };
    const row = await db.queryOne(`SELECT COALESCE(login_streak, 0) AS streak, streak_claimed_day::text AS streak_claimed_day FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const today = storeToday();
    const lastDay = asDay(row?.streak_claimed_day);
    const claimedToday = lastDay === today;
    // What the streak becomes if they claim now: +1 if they claimed yesterday, else it restarts at 1.
    const nextStreak = claimedToday ? row.streak : lastDay === storeYesterday() ? (row?.streak || 0) + 1 : 1;
    const reward = rewardForStreak(nextStreak);
    // Only run the (few) summary queries when the modal will actually show — most loads it's already claimed.
    return {
        signedIn: true,
        show: !claimedToday, // pop the modal once per day, until claimed
        claimedToday,
        currentStreak: row?.streak || 0,
        nextStreak,
        reward: { label: reward.label, emoji: reward.emoji },
        summary: claimedToday ? null : await awaySummary(buyerId),
    };
}

// Roll the member's equipped LOGIN-proc items (once, at check-in) and apply what fired. Returns display rows.
async function resolveLoginProcs(buyerId) {
    const equipped = await getEquippedIds(buyerId).catch(() => ({}));
    const procs = rollLoginProcs(equipped);
    const out = [];
    for (const p of procs) {
        if (p.kind === "gold") {
            await db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [buyerId, p.amount]).catch(() => {});
            out.push({ emoji: "🪙", text: `${p.label} found ${p.amount} gold!` });
        } else if (p.kind === "potion") {
            const pool = Object.entries(CONSUMABLES).filter(([, c]) => c.price != null);
            const [pid, c] = pool[Math.floor(Math.random() * pool.length)];
            await grantConsumable(buyerId, pid, 1).catch(() => {});
            out.push({ emoji: c.emoji || "🧪", text: `${p.label} conjured ${c.name}!` });
        } else if (p.kind === "spinToken") {
            await db.query(`UPDATE mkt_buyer SET spin_tokens = spin_tokens + $2 WHERE id = $1`, [buyerId, p.amount || 1]).catch(() => {});
            out.push({ emoji: "🎟️", text: `${p.label} — +${p.amount || 1} wheel spin` });
        } else if (p.kind === "coupon") {
            await db.query(`UPDATE mkt_buyer SET shop_coupon_pct = $2, shop_coupon_max = $3, shop_coupon_at = NOW() WHERE id = $1`, [buyerId, COUPON_PCT, COUPON_MAX]).catch(() => {});
            out.push({ emoji: "🎟️", text: `${p.label} — a ${COUPON_PCT}% shop coupon!` });
        } else if (p.kind === "petGamble") {
            // Win a random pet you couldn't just get by leveling — but the item is destroyed.
            const ownedRows = await db.query(`SELECT ref FROM mkt_cosmetic_unlock WHERE buyer_id = $1 AND category = 'pet'`, [buyerId]).catch(() => []);
            const owned = new Set(ownedRows.map((r) => r.ref));
            const pool = COLLECTIBLES.filter((pt) => pt.source !== "level" && !owned.has(pt.id));
            if (!pool.length) continue; // nothing to win → don't destroy the item
            const won = pool[Math.floor(Math.random() * pool.length)];
            await db.query(`INSERT INTO mkt_cosmetic_unlock (buyer_id, category, ref) VALUES ($1, 'pet', $2) ON CONFLICT DO NOTHING`, [buyerId, won.id]).catch(() => {});
            await db.query(`DELETE FROM mkt_user_equipment WHERE buyer_id = $1 AND item_id = $2`, [buyerId, p.id]).catch(() => {});
            await db.query(`DELETE FROM mkt_user_item WHERE buyer_id = $1 AND item_id = $2`, [buyerId, p.id]).catch(() => {});
            out.push({ emoji: "🎲", text: `${p.label} shattered → unlocked ${won.name}!` });
        }
    }
    return out;
}

// POST — claim today's streak reward (advances/resets the streak, grants the reward). Idempotent per day.
export async function claimDailyCheckin(buyerId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const row = await db.queryOne(`SELECT COALESCE(login_streak, 0) AS streak, streak_claimed_day::text AS streak_claimed_day FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const today = storeToday();
    if (asDay(row?.streak_claimed_day) === today) return { ok: false, error: "already_claimed", streak: row.streak };
    const nextStreak = asDay(row?.streak_claimed_day) === storeYesterday() ? (row?.streak || 0) + 1 : 1;
    // Atomic guard: only the first claim of the day wins (streak_claimed_day flips off today's value).
    const won = await db
        .queryOne(
            `UPDATE mkt_buyer SET login_streak = $2, streak_claimed_day = $3::date
              WHERE id = $1 AND (streak_claimed_day IS DISTINCT FROM $3::date) RETURNING id`,
            [buyerId, nextStreak, today]
        )
        .catch(() => null);
    if (!won) return { ok: false, error: "already_claimed" };

    const reward = rewardForStreak(nextStreak);
    if (reward.gold) await db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [buyerId, reward.gold]).catch(() => {});
    if (reward.treat && CONSUMABLES[reward.treat]) await grantConsumable(buyerId, reward.treat, 1).catch(() => {});
    if (reward.chest && CHEST_TIERS[reward.chest]) await addChests(buyerId, { [reward.chest]: 1 }).catch(() => {});
    await trackActivity(buyerId, "daily_checkin", { streak: nextStreak }).catch(() => {});
    // Every 7-day streak milestone also grants a spin-wheel token.
    if (nextStreak % 7 === 0) await db.query(`UPDATE mkt_buyer SET spin_tokens = spin_tokens + 1 WHERE id = $1`, [buyerId]).catch(() => {});
    // Equipped login-proc items get their once-a-day roll here too.
    const logins = await resolveLoginProcs(buyerId).catch(() => []);

    return { ok: true, streak: nextStreak, reward: { label: reward.label, emoji: reward.emoji }, jackpot: nextStreak % 7 === 0, logins };
}
