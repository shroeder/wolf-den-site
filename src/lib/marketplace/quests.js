import "server-only";

import { db } from "@/lib/db";
import { addChests, CHEST_TIERS } from "@/lib/marketplace/chests.js";

// Daily quests — 3 rotating bounties per member per day. Progress is bumped from action hooks (attack,
// crit, open chest, equip, buy); completing one grants gold (and sometimes a loot chest). The day's 3
// quests are a DETERMINISTIC pick per (buyer, day) so rows can be lazily inserted anywhere.

// `area` is the deep-link where the member actually completes the quest, so each row can be a call-to-action.
export const QUEST_TEMPLATES = [
    { key: "strike_boss", label: "Attack the boss", metric: "boss_attack", target: 1, gold: 120, area: "/marketplace/boss", cta: "Fight the boss" },
    { key: "land_crit", label: "Land a critical hit on the boss", metric: "crit", target: 1, gold: 150, area: "/marketplace/boss", cta: "Fight the boss" },
    { key: "deal_damage", label: "Deal 5,000 damage to the boss", metric: "boss_damage", target: 5000, gold: 220, area: "/marketplace/boss", cta: "Fight the boss" },
    { key: "open_chest", label: "Open a loot chest", metric: "chest_open", target: 1, gold: 150, area: "/marketplace/inventory", cta: "Open chests" },
    { key: "open_two_chests", label: "Open 2 loot chests", metric: "chest_open", target: 2, gold: 260, chest: "wooden", area: "/marketplace/inventory", cta: "Open chests" },
    { key: "equip_gear", label: "Equip or swap a piece of gear", metric: "equip", target: 1, gold: 110, area: "/marketplace/inventory", cta: "Go to gear" },
    { key: "gold_shop", label: "Buy anything from the gold shop", metric: "buy", target: 1, gold: 120, area: "/marketplace/inventory", cta: "Open the shop" },
    { key: "post_bounty", label: "Post a bounty on the board", metric: "bounty_post", target: 1, gold: 130, area: "/marketplace/bounties/new", cta: "Post a bounty" },
    { key: "take_bounty", label: "Take on a community bounty", metric: "bounty_claim", target: 1, gold: 120, area: "/marketplace/bounties", cta: "Browse bounties" },
];

const TEMPLATE_BY_KEY = Object.fromEntries(QUEST_TEMPLATES.map((t) => [t.key, t]));
const KEYS_BY_METRIC = QUEST_TEMPLATES.reduce((m, t) => ((m[t.metric] ||= []).push(t.key), m), {});

// Store-local day (America/Chicago) as YYYY-MM-DD, so quests reset at local midnight.
function storeDay() {
    return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

// Tiny stable string hash → non-negative int (for the deterministic daily pick).
function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

// The 3 templates assigned to this member today (stable for the whole day).
function pickDaily(buyerId, day) {
    return QUEST_TEMPLATES
        .map((t) => ({ t, h: hashStr(`${buyerId}:${day}:${t.key}`) }))
        .sort((a, b) => a.h - b.h)
        .slice(0, 3)
        .map((x) => x.t);
}

// Idempotently ensure today's 3 quest rows exist (safe to call from any hook).
export async function ensureDailyQuests(buyerId) {
    if (!buyerId) return storeDay();
    const day = storeDay();
    for (const t of pickDaily(buyerId, day)) {
        await db.query(
            `INSERT INTO mkt_daily_quest (buyer_id, day, quest_key, target, reward_gold, reward_chest)
             VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (buyer_id, day, quest_key) DO NOTHING`,
            [buyerId, day, t.key, t.target, t.gold || 0, t.chest || null]
        ).catch(() => {});
    }
    return day;
}

// Bump progress on any of today's unclaimed quests matching a metric (e.g. "boss_damage", "chest_open").
export async function bumpQuestProgress(buyerId, metric, amount = 1) {
    const keys = KEYS_BY_METRIC[metric];
    if (!buyerId || !keys?.length || amount <= 0) return;
    const day = await ensureDailyQuests(buyerId);
    await db.query(
        `UPDATE mkt_daily_quest SET progress = LEAST(target, progress + $4)
          WHERE buyer_id = $1 AND day = $2 AND quest_key = ANY($3) AND claimed_at IS NULL AND progress < target`,
        [buyerId, day, keys, amount]
    ).catch(() => {});
}

// Today's quests for the member (assigns first). Shaped for the UI.
export async function getDailyQuests(buyerId) {
    if (!buyerId) return { quests: [], day: storeDay() };
    const day = await ensureDailyQuests(buyerId);
    const rows = await db
        .query(`SELECT quest_key, progress, target, reward_gold, reward_chest, claimed_at FROM mkt_daily_quest WHERE buyer_id = $1 AND day = $2`, [buyerId, day])
        .catch(() => []);
    // Keep the deterministic order (matches pickDaily) for a stable list.
    const order = pickDaily(buyerId, day).map((t) => t.key);
    const quests = rows
        .map((r) => {
            const t = TEMPLATE_BY_KEY[r.quest_key];
            if (!t) return null;
            const chest = r.reward_chest ? CHEST_TIERS[r.reward_chest] : null;
            return {
                key: r.quest_key,
                label: t.label,
                progress: r.progress,
                target: r.target,
                done: r.progress >= r.target,
                claimed: Boolean(r.claimed_at),
                rewardGold: r.reward_gold,
                rewardChest: chest ? { tier: r.reward_chest, label: chest.label, emoji: chest.emoji } : null,
                area: t.area || null,
                cta: t.cta || null,
            };
        })
        .filter(Boolean)
        .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    return { quests, day };
}

// Claim a completed, unclaimed quest → grant its reward. Atomic (the UPDATE guards double-claims).
export async function claimQuest(buyerId, questKey) {
    if (!buyerId || !questKey) return { ok: false, error: "invalid" };
    const day = storeDay();
    const row = await db
        .queryOne(
            `UPDATE mkt_daily_quest SET claimed_at = NOW()
              WHERE buyer_id = $1 AND day = $2 AND quest_key = $3 AND claimed_at IS NULL AND progress >= target
              RETURNING reward_gold, reward_chest`,
            [buyerId, day, questKey]
        )
        .catch(() => null);
    if (!row) return { ok: false, error: "not_claimable" };
    if (row.reward_gold > 0) await db.query(`UPDATE mkt_buyer SET gold = gold + $2 WHERE id = $1`, [buyerId, row.reward_gold]).catch(() => {});
    if (row.reward_chest) await addChests(buyerId, { [row.reward_chest]: 1 }).catch(() => {});
    return { ok: true, gold: row.reward_gold, chest: row.reward_chest };
}
