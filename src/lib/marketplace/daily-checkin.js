import "server-only";

import { db } from "@/lib/db";
import { voidPendingTradesForItem } from "@/lib/marketplace/trade.js";
import { getActiveBoss } from "@/lib/marketplace/boss.js";
import { getDailyQuests } from "@/lib/marketplace/quests.js";
import { petLevelInfo } from "@/lib/marketplace/pet-level.js";
import { collectibleById } from "@/lib/marketplace/collectibles.js";
import { addChests, getChests, CHEST_TIERS } from "@/lib/marketplace/chests.js";
import { getSpinState } from "@/lib/marketplace/spin.js";
import { grantConsumable, CONSUMABLES } from "@/lib/marketplace/consumables.js";
import { getEquippedIds } from "@/lib/marketplace/inventory.js";
import { rollLoginProcs, COUPON_PCT, COUPON_MAX } from "@/lib/marketplace/signatures.js";
import { PUBLIC_COLLECTIBLES } from "@/lib/marketplace/collectibles.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { grantMissingBadge } from "@/lib/marketplace/badges.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { equippedPowers, claimPowerUsePeriod } from "@/lib/marketplace/ascension-powers.js";
import { mint } from "@/lib/marketplace/gold-rate.js";

// DAILY CHECK-IN — a login-streak reward + a "while you were away" summary, shown once per day. The streak
// is consecutive days claimed; miss a day and it resets. Rewards escalate over a 7-day cycle, with a big
// payoff on day 7 (then the cycle repeats — so every 7th day is a jackpot).

// HALVED IN THE TABLE, not at the credit, and deliberately so. Every row here carries a LABEL with the figure
// written into it, and this is an authored table rather than a computed reward — so running it through mint()
// would pay 30 while the screen promised 60. The same rule the paytables follow: a static table is tuned where
// it is written. Figures below are the pre-nerf ones halved (60/120/200/260/320/900).
const STREAK_REWARDS = [
    { gold: 30, label: "30 gold", emoji: "🪙" },
    { gold: 60, label: "60 gold", emoji: "🪙" },
    { treat: "treat_snack", label: "a Hearty Snack (pet XP)", emoji: "🍖" },
    { gold: 100, label: "100 gold", emoji: "🪙" },
    { gold: 130, label: "130 gold", emoji: "🪙" },   // was an Iron chest — a check-in is a claim
    { gold: 160, treat: "treat_toy", label: "160 gold + a Chew Toy", emoji: "🎁" },
    { gold: 450, label: "450 gold", emoji: "🏆" }, // day-7. Was 480 + an Iron chest; a streak is a claim, so it pays coin.
];
const rewardForStreak = (streak) => STREAK_REWARDS[((Math.max(1, streak) - 1) % 7)];

// The Counting House (ascension power): what a purse pays at check-in, and the ceiling on it. Two percent a
// day is a real reason to hold gold; the cap is what stops a hoard becoming a wage — past it the rate stops
// mattering and the right move is to go and spend, which is the behaviour the Den wants anyway.
const COUNTING_HOUSE_RATE = 0.02;
const COUNTING_HOUSE_CAP = 2000;

// Store-timezone day helpers (America/Chicago), as "YYYY-MM-DD" strings.
const dayStr = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
function storeToday() { return dayStr(new Date()); }
function storeYesterday() { return dayStr(new Date(Date.now() - 86400000)); }
// IMPORTANT: streak_claimed_day is a SQL DATE. node-postgres parses it into a JS Date at the PROCESS's
// local-midnight, so on Vercel (UTC) reformatting it in America/Chicago rolls it back a day and "claimed
// today" never registers. So we always SELECT `streak_claimed_day::text` (already "YYYY-MM-DD" in the DB)
// and compare strings — never build a JS Date from it. asDay just normalizes an already-"YYYY-MM-DD" value.
const asDay = (v) => (v ? String(v).slice(0, 10) : null);

/**
 * What the streak becomes if they check in now.
 *
 * ── IT COUNTS DAYS YOU TURNED UP, NOT DAYS YOU PRESSED THE BUTTON ────────────────────────────────────────
 * It used to key entirely off `streak_claimed_day`: miss the CLAIM and the streak reset, even if you had
 * played all day. @Kaishiern reported this and was exactly right — fourteen consecutive days on the site,
 * every one of them with real activity, and a streak of 3, while everybody who happens to tap the modal sat
 * at 23. From the member's side "I haven't missed a day" was simply true and the game disagreed with them.
 *
 * So a day counts if you were HERE. `last_seen_at` is already maintained on every visit (the presence
 * heartbeat), so the continuation test is: did you claim yesterday, OR were you seen yesterday. The reward is
 * still once a day and still has to be claimed — this only decides whether the run is broken.
 *
 * `seenDay` is the store-local date of last_seen_at, resolved by the caller in SQL. Never build a JS Date from
 * a Postgres DATE to compare it: read through JS it is a day behind on Vercel.
 */
function nextStreakFor(row, today, yesterday) {
    const lastClaim = asDay(row?.streak_claimed_day);
    if (lastClaim === today) return Number(row?.streak) || 0;   // already claimed; nothing moves
    const seen = asDay(row?.seen_day);
    const continued = lastClaim === yesterday || seen === yesterday || seen === today;
    return continued ? (Number(row?.streak) || 0) + 1 : 1;
}

// A short "while you were away" summary — all truthful, computed live.
async function awaySummary(buyerId) {
    const [boss, buyer, quests, chests, spin] = await Promise.all([
        getActiveBoss().catch(() => null),
        db.queryOne(`SELECT featured_collectible FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null),
        getDailyQuests(buyerId).catch(() => ({ quests: [] })),
        getChests(buyerId).catch(() => []),
        getSpinState(buyerId).catch(() => null),
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
        const info = petLevelInfo(xpRow?.xp || 0, collectibleById(buyer.featured_collectible)?.rarity);
        pet = { name: collectibleById(buyer.featured_collectible)?.name || "your pet", level: info.level, into: info.into, span: info.span, maxed: info.maxed };
    }
    const questsReady = (quests.quests || []).filter((q) => q.done && !q.claimed).length;
    // Nudge members sitting on unopened chests / an unused spin — engagement they often forget about.
    const chestsToOpen = (chests || []).reduce((n, c) => n + (c.count || 0), 0);
    const spinReady = Boolean(spin?.canSpin);
    return { bossName, packDamage24h, pet, questsReady, chestsToOpen, spinReady };
}

// GET — the member's check-in state: streak, today's claimable reward, and the away summary.
export async function getDailyCheckin(buyerId) {
    if (!buyerId) return { signedIn: false, show: false };
    const row = await db.queryOne(
        `SELECT COALESCE(login_streak, 0) AS streak, streak_claimed_day::text AS streak_claimed_day,
                (last_seen_at AT TIME ZONE 'America/Chicago')::date::text AS seen_day
           FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const today = storeToday();
    const lastDay = asDay(row?.streak_claimed_day);
    const claimedToday = lastDay === today;
    const nextStreak = nextStreakFor(row, today, storeYesterday());
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
            p.amount = mint(p.amount, "checkin"); // written back so the line the member reads matches the credit
            await db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [buyerId, p.amount]).catch(() => {});
            await logCoin(buyerId, p.amount, "checkin", { meta: { proc: p.label } }).catch(() => {});
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
            out.push({ emoji: "🎟️", text: `${p.label} — ${COUPON_PCT}% off an in-game 🪙 gold-shop item!` });
        } else if (p.kind === "petGamble") {
            // Win a random pet you couldn't just get by leveling — but the item is destroyed.
            const ownedRows = await db.query(`SELECT ref FROM mkt_cosmetic_unlock WHERE buyer_id = $1 AND category = 'pet'`, [buyerId]).catch(() => []);
            const owned = new Set(ownedRows.map((r) => r.ref));
            // PUBLIC_ so a mystery pet can never hand out content from an unlaunched feature.
            const pool = PUBLIC_COLLECTIBLES.filter((pt) => pt.source !== "level" && !owned.has(pt.id));
            if (!pool.length) continue; // nothing to win → don't destroy the item
            const won = pool[Math.floor(Math.random() * pool.length)];
            await db.query(`INSERT INTO mkt_cosmetic_unlock (buyer_id, category, ref) VALUES ($1, 'pet', $2) ON CONFLICT DO NOTHING`, [buyerId, won.id]).catch(() => {});
            await db.query(`DELETE FROM mkt_user_equipment WHERE buyer_id = $1 AND item_id = $2`, [buyerId, p.id]).catch(() => {});
            await db.query(`DELETE FROM mkt_user_item WHERE buyer_id = $1 AND item_id = $2`, [buyerId, p.id]).catch(() => {});
            await voidPendingTradesForItem(buyerId, p.id).catch(() => {}); // shattered item can't back a pending trade
            out.push({ emoji: "🎲", text: `${p.label} shattered → unlocked ${won.name}!` });
        }
    }
    return out;
}

// POST — claim today's streak reward (advances/resets the streak, grants the reward). Idempotent per day.
export async function claimDailyCheckin(buyerId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const row = await db.queryOne(
        `SELECT COALESCE(login_streak, 0) AS streak, streak_claimed_day::text AS streak_claimed_day,
                (last_seen_at AT TIME ZONE 'America/Chicago')::date::text AS seen_day
           FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const today = storeToday();
    if (asDay(row?.streak_claimed_day) === today) return { ok: false, error: "already_claimed", streak: row.streak };
    // ── ASCENSION POWERS ON A CHECK-IN ───────────────────────────────────────────────────────────────────
    // The Standing Streak never breaks — a missed day carries on rather than restarting at 1 — and it counts
    // DOUBLE toward the reward ladder, so it climbs at twice the pace as well as never falling.
    const dailyPowers = await equippedPowers(buyerId);
    const kept = dailyPowers.has("standing_streak");
    // The SAME rule the screen showed you a moment ago (nextStreakFor) — turning up is what continues a run,
    // not tapping. The Standing Streak sits on top: it never breaks, and it counts double.
    const base = nextStreakFor(row, today, storeYesterday());
    const nextStreak = kept ? Math.max(base, (Number(row?.streak) || 0) + 1) + 1 : base;
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
    // Day's Double pays the whole check-in twice.
    const payMult = dailyPowers.has("day_s_double") ? 2 : 1;
    // Day's Double is part of the payout, so it has to be part of the LEDGER ROW too. This used to credit
    // `reward.gold * payMult` and log `reward.gold`, which under-reported every doubled check-in in the
    // coin economy screen. One number now, computed once and used by both.
    //
    // A LOCAL, not a write-back: rewardForStreak returns an element of the shared STREAK_REWARDS table.
    // NOT run through mint() — that table is already halved at source, and doing both would pay a quarter.
    const paidGold = (reward.gold || 0) * payMult;
    if (paidGold) await db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [buyerId, paidGold]).catch(() => {});
    if (paidGold) await logCoin(buyerId, paidGold, "checkin", { meta: { streak: nextStreak, doubled: payMult > 1 } }).catch(() => {});
    if (reward.treat && CONSUMABLES[reward.treat]) await grantConsumable(buyerId, reward.treat, 1).catch(() => {});
    if (reward.chest && CHEST_TIERS[reward.chest]) await addChests(buyerId, { [reward.chest]: 1 }, { source: "daily_checkin", meta: { streak: nextStreak } }).catch(() => {});
    // ── THE COUNTING HOUSE ───────────────────────────────────────────────────────────────────────────────
    // The gold sitting in your purse earns interest, paid here. Read AFTER the streak reward so today's
    // check-in is in the balance it is paid on, and capped — a member with a seven-figure purse would
    // otherwise out-earn every other power on the list by simply not spending.
    //
    // The cap is what makes this a savings account rather than a printing press: past the ceiling the rate
    // stops mattering and the right move is to go and spend it, which is the behaviour the Den wants anyway.
    let interest = 0;
    if (dailyPowers.has("counting_house")) {
        const purse = await db.queryOne(`SELECT COALESCE(gold,0) AS gold FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
        interest = Math.min(COUNTING_HOUSE_CAP, Math.floor((Number(purse?.gold) || 0) * COUNTING_HOUSE_RATE));
        if (interest > 0) {
            const after = await db.queryOne(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1 RETURNING gold`, [buyerId, interest]).catch(() => null);
            await logCoin(buyerId, interest, "checkin_interest", { balanceAfter: after?.gold, meta: { rate: COUNTING_HOUSE_RATE } }).catch(() => {});
        }
    }
    // ── THE HERALD'S LICENCE AND THE FOUNDER'S PLATE ─────────────────────────────────────────────────────
    // A badge a month and a collection piece a week, delivered. Both land at the check-in because it is the
    // one thing every member does exactly once a day: a cron would need a table of who is owed what, and a
    // page load would need a guard against firing on every render. The claim itself is what makes it periodic
    // — mkt_power_use stores the first of the month / the Monday, and the primary key does the rest.
    //
    // "Chosen from what you are missing" is the whole promise, so both pools are the UNOWNED ones. When there
    // is nothing left to give, the claim is not spent: the row is only written after a successful grant.
    const delivered = [];
    if (dailyPowers.has("herald_s_licence") && (await claimPowerUsePeriod(buyerId, "herald_s_licence", "month"))) {
        const got = await grantMissingBadge(buyerId).catch(() => null);
        if (got) delivered.push({ kind: "badge", name: got.name });
    }
    if (dailyPowers.has("founder_s_plate") && (await claimPowerUsePeriod(buyerId, "founder_s_plate", "week"))) {
        const { grantMissingPiece } = await import("@/lib/marketplace/collection-owned.js");
        const got = await grantMissingPiece(buyerId, "founder_s_plate").catch(() => null);
        if (got) delivered.push({ kind: "piece", name: got.name });
    }
    await trackActivity(buyerId, "daily_checkin", { streak: nextStreak }).catch(() => {});
    // Every 7-day streak milestone also grants a spin-wheel token.
    if (nextStreak % 7 === 0) await db.query(`UPDATE mkt_buyer SET spin_tokens = spin_tokens + 1 WHERE id = $1`, [buyerId]).catch(() => {});
    // Equipped login-proc items get their once-a-day roll here too.
    const logins = await resolveLoginProcs(buyerId).catch(() => []);

    return { ok: true, streak: nextStreak, reward: { label: reward.label, emoji: reward.emoji }, jackpot: nextStreak % 7 === 0, logins, interest, delivered };
}
