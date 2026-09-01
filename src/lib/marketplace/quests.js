import "server-only";

import { db } from "@/lib/db";
import { isOwner } from "@/lib/marketplace/owner.js";
import { addChests, CHEST_TIERS } from "@/lib/marketplace/chests.js";
import { awardXp } from "@/lib/marketplace/xp.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { bumpFeatureDaily } from "@/lib/marketplace/feature-dailies.js";
import { equippedPowers } from "@/lib/marketplace/ascension-powers.js";
import { mint } from "@/lib/marketplace/gold-rate.js";

// Bonus XP for clearing all THREE daily quests in a day (on top of the bonus spin token).
const ALL_QUESTS_XP = 300;

// Daily quests — 3 rotating bounties per member per day. Progress is bumped from action hooks (attack,
// crit, open chest, equip, buy); completing one grants gold (and sometimes a loot chest). The day's 3
// quests are a DETERMINISTIC pick per (buyer, day) so rows can be lazily inserted anywhere.

// `area` is the deep-link where the member actually completes the quest, so each row can be a call-to-action.
export const QUEST_TEMPLATES = [
    { key: "strike_boss", label: "Attack the boss", metric: "boss_attack", target: 1, gold: 120, area: "/marketplace/boss", cta: "Fight the boss" },
    { key: "land_crit", label: "Land a critical hit on the boss", metric: "crit", target: 1, gold: 150, area: "/marketplace/boss", cta: "Fight the boss" },
    { key: "deal_damage", label: "Deal 5,000 damage to the boss", metric: "boss_damage", target: 5000, gold: 220, area: "/marketplace/boss", cta: "Fight the boss" },
    { key: "open_chest", label: "Open a loot chest", metric: "chest_open", target: 1, gold: 150, area: "/marketplace/inventory", cta: "Open chests" },
    { key: "open_two_chests", label: "Open 2 loot chests", metric: "chest_open", target: 2, gold: 260, area: "/marketplace/inventory", cta: "Open chests" },
    { key: "equip_gear", label: "Equip or swap a piece of gear", metric: "equip", target: 1, gold: 110, area: "/marketplace/inventory", cta: "Go to gear" },
    // /marketplace/inventory is the GEAR view; the gold shop is its own route. Sending people to the wrong one
    // and telling them to buy something is why this quest read as broken — there was nothing to buy on it.
    { key: "gold_shop", label: "Buy anything from the gold shop", metric: "buy", target: 1, gold: 120, area: "/marketplace/store", cta: "Open the shop" },
    { key: "post_bounty", label: "Post a bounty on the board", metric: "bounty_post", target: 1, gold: 130, area: "/marketplace/bounties/new", cta: "Post a bounty" },
    { key: "take_bounty", label: "Take on a community bounty", metric: "bounty_claim", target: 1, gold: 120, area: "/marketplace/bounties", cta: "Browse bounties" },
    { key: "donate_event", label: "Donate 1,000 gold to the pack (Happy Hour / rally)", metric: "donate_event", target: 1000, gold: 200, area: "/marketplace/boss", cta: "Donate gold" },
    { key: "spin_wheel", label: "Spin the daily wheel", metric: "spin", target: 1, gold: 100, area: "/marketplace/spin", cta: "Spin the wheel" },
    { key: "cheer_once", label: "Cheer a teammate in the boss fight", metric: "cheer", target: 1, gold: 90, area: "/marketplace/boss", cta: "Cheer a hero" },
    { key: "cheer_thrice", label: "Cheer 3 times today", metric: "cheer", target: 3, gold: 180, area: "/marketplace/boss", cta: "Cheer a hero" },
    // ── Sailing quests (gated: only appear for members who can actually sail — see eligibleTemplates) ──
    { key: "sail_voyage", label: "Set sail on a voyage", metric: "voyage_start", target: 1, gold: 100, area: "/marketplace/sailing", cta: "Set sail", gate: "sailing" },
    { key: "sail_wave", label: "Greet a passing sailor at sea", metric: "wave", target: 1, gold: 90, area: "/marketplace/sailing", cta: "Go sailing", gate: "sailing" },
    // "Sink a ship from the fleet" was a promise the game stopped being able to keep: you cannot choose the
    // fleet (one Battle button, the server matches you) and the metric ticks when the fight STARTS, not when
    // anything sinks. Both of these now describe the one thing you actually press. Keys are kept so rows
    // assigned today are not orphaned.
    { key: "sail_raid", label: "Fight a ship battle", metric: "ship_battle", target: 1, gold: 150, area: "/marketplace/sailing", cta: "Beat to quarters", gate: "sailing" },
    { key: "ship_battle", label: "Fight two ship battles", metric: "ship_battle", target: 2, gold: 170, area: "/marketplace/sailing", cta: "Beat to quarters", gate: "sailing" },
    { key: "sail_dig", label: "Dig up buried treasure", metric: "dig_done", target: 1, gold: 160, area: "/marketplace/sailing", cta: "Go digging", gate: "sailing" },
    // ── Farm quests (gated: only appear for members who can access the Farm — see eligibleTemplates) ──
    { key: "harvest_crop", label: "Harvest a crop from your farm", metric: "harvest_crop", target: 1, gold: 150, area: "/marketplace/farm", cta: "Tend your farm", gate: "farm" },
    { key: "plant_seed", label: "Plant a seed", metric: "plant_seed", target: 1, gold: 90, area: "/marketplace/farm", cta: "Plant a crop", gate: "farm" },
    { key: "pet_a_pet", label: "Pet a pet on the farm", metric: "pet_animal", target: 1, gold: 100, area: "/marketplace/farm", cta: "Visit the farm", gate: "farm" },
    { key: "pet_three", label: "Pet 3 pets today", metric: "pet_animal", target: 3, gold: 190, area: "/marketplace/farm", cta: "Visit the farm", gate: "farm" },
    { key: "fertilize_crop", label: "Fertilize a growing crop", metric: "fertilize_crop", target: 1, gold: 110, area: "/marketplace/farm", cta: "Tend your farm", gate: "farm" },
    { key: "harvest_rare", label: "Harvest an epic-or-better crop", metric: "harvest_rare", target: 1, gold: 190, area: "/marketplace/farm", cta: "Tend your farm", gate: "farm" },
    { key: "feed_treat", label: "Feed a pet a treat", metric: "feed_pet", target: 1, gold: 120, area: "/marketplace/farm", cta: "Visit the farm", gate: "farm" },
    { key: "place_deco", label: "Place a decoration on your farm", metric: "place_deco", target: 1, gold: 120, area: "/marketplace/farm", cta: "Decorate your farm", gate: "farm" },
    { key: "arrange_deco", label: "Move or resize a decoration", metric: "arrange_deco", target: 1, gold: 90, area: "/marketplace/farm", cta: "Decorate your farm", gate: "farm" },
    { key: "rate_friend", label: "Rate a friend's farm", metric: "farm_rate", target: 1, gold: 110, area: "/marketplace/farm", cta: "Visit a friend's farm", gate: "farm" },
    // ── Kitchen ──────────────────────────────────────────────────────────────────────────────────────────
    // The daily pool was boss- and chest-heavy: the same handful of fights every day regardless of what the
    // member actually plays. These send you to the systems that shipped after the pool was written.
    //
    // These four were `ownerOnly` for nine days after the Kitchen opened. They were gated on 2026-07-31 by
    // "Close the Kitchen again", the Kitchen reopened on 2026-08-01, and nobody came back for them — so four
    // of the bounties written to point at the newest feature pointed at nobody. Ungated 2026-08-09.
    { key: "cook_a_dish", label: "Cook a dish", metric: "cook_dish", target: 1, gold: 130, area: "/marketplace/cooking", cta: "Get cooking" },
    { key: "cook_three", label: "Cook 3 dishes", metric: "cook_dish", target: 3, gold: 240, area: "/marketplace/cooking", cta: "Get cooking" },
    { key: "cook_a_prep", label: "Prep an ingredient", metric: "cook_prep", target: 1, gold: 110, area: "/marketplace/cooking", cta: "Get cooking" },
    { key: "cook_clean_run", label: "Cook a dish with a clean run", metric: "cook_clean", target: 1, gold: 200, area: "/marketplace/cooking", cta: "Get cooking" },
    // ── Fishing ──────────────────────────────────────────────────────────────────────────────────────────
    { key: "fish_one", label: "Land a fish", metric: "fish", target: 1, gold: 100, area: "/marketplace/sailing", cta: "Cast a line" },
    { key: "fish_five", label: "Land 5 fish", metric: "fish", target: 5, gold: 220, area: "/marketplace/sailing", cta: "Cast a line" },

    // ── Mine quests. One per verb,
    // because the three halves of the mine are genuinely different activities and a player who only likes the
    // descent should still be able to clear a mine quest.
    { key: "mine_descend", label: "Take 5 steps down the mine tunnel", metric: "mine_depth", target: 5, gold: 140, area: "/marketplace/mining", cta: "Head down" },
    { key: "mine_deep_dive", label: "Take 10 steps down the mine tunnel", metric: "mine_depth", target: 10, gold: 260, area: "/marketplace/mining", cta: "Head down" },
    { key: "mine_crack", label: "Crack open a seam", metric: "seam_crack", target: 1, gold: 120, area: "/marketplace/mining", cta: "Go swing a pick" },
    { key: "mine_crack_three", label: "Crack open 3 seams", metric: "seam_crack", target: 3, gold: 240, area: "/marketplace/mining", cta: "Go swing a pick" },
    { key: "mine_smelt", label: "Pour a smelt at the furnace", metric: "ore_smelt", target: 1, gold: 130, area: "/marketplace/mining", cta: "Work the heat" },
    { key: "mine_smelt_three", label: "Pour 3 smelts", metric: "ore_smelt", target: 3, gold: 250, area: "/marketplace/mining", cta: "Work the heat" },

    // ── Dungeon quests. Public since the dungeons launched (2026-08-04). eligibleTemplates still filters out
    // for everyone else, so they can never be rolled for a member who cannot open the page.
    { key: "delve_floors", label: "Clear 5 dungeon floors", metric: "delve_floor", target: 5, gold: 150, area: "/marketplace/dungeons", cta: "Enter a dungeon" },
    { key: "delve_floors_ten", label: "Clear 10 dungeon floors", metric: "delve_floor", target: 10, gold: 280, area: "/marketplace/dungeons", cta: "Enter a dungeon" },
    { key: "delve_boss", label: "Fell a dungeon boss", metric: "delve_clear", target: 1, gold: 320, area: "/marketplace/dungeons", cta: "Enter a dungeon" },

    // ── The Casino. UNGATED 2026-08-31, and late. ────────────────────────────────────────────────────────
    // These four were ownerOnly while the floor was closed, with a comment directly above them saying the
    // flag "comes off IN THE SAME CHANGE" when the casino opened — written specifically so this would not
    // repeat the Kitchen, whose four bounties sat gated for nine days after it opened because nobody came
    // back for them.
    //
    // It repeated anyway. The floor opened to every member, five of them cleared its bounties on the day,
    // and `eligibleTemplates` still handed these four to nobody but the owner — one row, `casino_sit 0/1`,
    // on the owner's account, for weeks. Reported as "casino quests not working", which is exactly what it
    // looked like from the board.
    //
    // The lesson the comment already contained and did not enforce: a launch flag is not documentation, it
    // is a dated obligation, and prose is a terrible place to keep one. Check `ownerOnly` against what is
    // actually open whenever a feature ships.

    // Paid low on purpose: the floor is a gold sink, and a bounty that pays more than the house keeps turns
    // the machines into a way of farming the bounty.
    { key: "casino_sit", label: "Play a machine in the Casino", metric: "casino_play", target: 1, gold: 110, area: "/marketplace/casino", cta: "Hit the floor" },
    { key: "casino_ten", label: "Play 10 times in the Casino", metric: "casino_play", target: 10, gold: 250, area: "/marketplace/casino", cta: "Hit the floor" },
    { key: "casino_win", label: "Win on any Casino machine", metric: "casino_win", target: 1, gold: 160, area: "/marketplace/casino", cta: "Hit the floor" },
    { key: "casino_ticket", label: "Play a Keno ticket", metric: "casino_keno", target: 1, gold: 120, area: "/marketplace/casino", cta: "Buy a ticket" },
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

// Which templates this member is eligible for. Every system the pool points at is public as of 2026-08-09, so
// nothing is currently flagged — the filter stays for the NEXT unreleased feature, because a daily bounty
// pointing at a page the member can't open is worse than one fewer bounty.
//
// `gate` is deliberately NOT used for this: it's set on the sailing and farm templates and read nowhere, so
// trusting it would silently do nothing. And a flag set at launch has to be taken OFF at launch — four Kitchen
// bounties sat gated for nine days after the Kitchen opened because nobody came back for them.
function eligibleTemplates(buyerId) {
    return QUEST_TEMPLATES.filter((t) => !t.ownerOnly || isOwner(buyerId));
}

// The 3 templates assigned to this member today (stable for the whole day). `reset` salts the seed so a
// paid re-roll produces a different set.
function pickDaily(buyerId, day, reset = false, count = 3, exclude = null) {
    const salt = reset ? ":r" : "";
    const skip = exclude instanceof Set ? exclude : new Set(exclude || []);
    return eligibleTemplates(buyerId)
        // ── A REROLL MUST NOT HAND BACK WHAT YOU HAVE ALREADY DONE ───────────────────────────────────────
        // ValkyrieSylve: "sometimes I'll get the same quest back to back after rerolling. Some quests can only
        // be completed once a day. Can we exclude any previously completed quests done that day on the
        // reroll." Without this the draw is over the whole pool every time, so a bounty you finished this
        // morning can come back as a card with no way to clear it — you have paid 1,500 gold for a dead slot.
        .filter((t) => !skip.has(t.key))
        .map((t) => ({ t, h: hashStr(`${buyerId}:${day}${salt}:${t.key}`) }))
        .sort((a, b) => a.h - b.h)
        .slice(0, count)
        .map((x) => x.t);
}

// `headStart` is The Quartermaster's Round: every bounty is issued with one step already done. Written as
// PROGRESS on the row rather than as a smaller target, so the card still reads "0 of 5" honestly — it reads
// "1 of 5" the moment it appears, which is the whole point of the power.
async function insertQuests(buyerId, day, templates, headStart = false) {
    for (const t of templates) {
        await db.query(
            `INSERT INTO mkt_daily_quest (buyer_id, day, quest_key, target, reward_gold, reward_chest, progress)
             VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (buyer_id, day, quest_key) DO NOTHING`,
            // Minted HERE, at issue, not at claim: the row is what the card shows the member, so the stored
            // figure has to be the one that gets paid. Minting at claim would promise N and hand over N/2.
            [buyerId, day, t.key, t.target, mint(t.gold || 0, "quest_reward"), t.chest || null, headStart ? 1 : 0]
        ).catch(() => {});
    }
}

// Idempotently ensure today's 3 quest rows exist (safe to call from any hook). Gated on existing rows so it
// never re-adds the default trio over a paid re-roll's replacement quests.
export async function ensureDailyQuests(buyerId) {
    if (!buyerId) return storeDay();
    const day = storeDay();
    const have = await db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_daily_quest WHERE buyer_id = $1 AND day = $2`, [buyerId, day]).catch(() => null);
    if ((have?.n || 0) >= 1) return day; // already assigned (or re-rolled) today
    // Bounty Board Rights buys a fourth bounty; The Quartermaster's Round starts every one of them a step in.
    const questPowers = await equippedPowers(buyerId);
    await insertQuests(buyerId, day, pickDaily(buyerId, day, false, questPowers.has("bounty_board_rights") ? 4 : 3),
        questPowers.has("quartermaster_s_round"));
    return day;
}

// Pay 1500 gold to re-roll today's quests — once per store-day. Atomic charge + once-a-day guard.
const QUEST_RESET_COST = 1500;
export async function resetDailyQuests(buyerId) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    const day = storeDay();
    const paid = await db
        .queryOne(
            `UPDATE mkt_buyer SET gold = gold - $3, quest_reset_day = $2::date
              WHERE id = $1 AND gold >= $3 AND (quest_reset_day IS DISTINCT FROM $2::date)
              RETURNING gold`,
            [buyerId, day, QUEST_RESET_COST]
        )
        .catch(() => null);
    if (!paid) {
        const b = await db.queryOne(`SELECT quest_reset_day::text AS d FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
        return { ok: false, error: b?.d === day ? "already_reset" : "not_enough_gold" };
    }
    await logCoin(buyerId, -QUEST_RESET_COST, "cooldown_skip", { meta: { kind: "quest_reroll" }, balanceAfter: paid.gold }).catch(() => {});
    await trackActivity(buyerId, "cooldown_skip", { kind: "quest_reroll", cost: QUEST_RESET_COST }).catch(() => {});
    // ── WHAT YOU FINISHED TODAY STAYS FINISHED ───────────────────────────────────────────────────────────
    // This deleted every row for the day, claimed ones included, and then drew from the whole pool again. Two
    // things went wrong with that: a completed bounty could be handed straight back (and several of them can
    // only be done once a day, so the card was unclearable), and wiping a claimed row throws away the record
    // that it was ever claimed.
    //
    // So the finished ones are READ FIRST, kept on the board, and excluded from the draw. Only the unfinished
    // slots are replaced — which is what a reroll means.
    const doneRows = await db.query(
        `SELECT quest_key FROM mkt_daily_quest
          WHERE buyer_id = $1 AND day = $2 AND (claimed_at IS NOT NULL OR progress >= target)`,
        [buyerId, day],
    ).catch(() => []);
    const done = new Set((doneRows || []).map((r) => r.quest_key));
    await db.query(
        `DELETE FROM mkt_daily_quest
          WHERE buyer_id = $1 AND day = $2 AND claimed_at IS NULL AND progress < target`,
        [buyerId, day],
    ).catch(() => {});
    const rerollPowers = await equippedPowers(buyerId);
    // Draw enough to refill only the empty slots, and never draw something already sitting on the board.
    const want = (rerollPowers.has("bounty_board_rights") ? 4 : 3) - done.size;
    if (want > 0) {
        await insertQuests(buyerId, day, pickDaily(buyerId, day, true, want, done),
            rerollPowers.has("quartermaster_s_round"));
    }
    return { ok: true, gold: paid.gold, ...(await getDailyQuests(buyerId)) };
}

// Bump progress on any of today's unclaimed quests matching a metric (e.g. "boss_damage", "chest_open").
export async function bumpQuestProgress(buyerId, metric, amount = 1) {
    // Feature dailies ride the same metric pump — free tracking, no scattered hooks.
    //
    // AWAITED. This was fire-and-forget, and on Vercel an un-awaited promise is killed the moment the handler
    // returns — the same way raid pushes once went out to nobody. A daily that ticks only when the request
    // happens to outlive it is worse than one that doesn't exist, because it looks like it works.
    await bumpFeatureDaily(buyerId, metric, amount).catch(() => {});
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
    // Paid re-roll availability (once per store-day).
    const meta = await db.queryOne(`SELECT COALESCE(gold,0) AS gold, quest_reset_day::text AS d FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const resetUsed = meta?.d === day;
    return { quests, day, gold: meta?.gold || 0, resetCost: QUEST_RESET_COST, resetUsed, canReset: !resetUsed && (meta?.gold || 0) >= QUEST_RESET_COST };
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
    if (row.reward_gold > 0) await logCoin(buyerId, row.reward_gold, "quest_reward", { meta: { quest: questKey } }).catch(() => {});
    if (row.reward_chest) await addChests(buyerId, { [row.reward_chest]: 1 }, { source: "quest", meta: { quest: row.key } }).catch(() => {});
    // Clearing ALL of today's quests earns a bonus spin token + a chunk of bonus XP (deduped per day).
    let bonusSpin = false;
    let bonusXp = 0;
    const left = await db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_daily_quest WHERE buyer_id = $1 AND day = $2 AND claimed_at IS NULL`, [buyerId, day]).catch(() => null);
    if (left && left.n === 0) {
        await db.query(`UPDATE mkt_buyer SET spin_tokens = spin_tokens + 1 WHERE id = $1`, [buyerId]).catch(() => {});
        bonusSpin = true;
        await awardXp(buyerId, "quests_cleared", { points: ALL_QUESTS_XP, dedupeKey: `quests_cleared:${day}` }).catch(() => {});
        bonusXp = ALL_QUESTS_XP;
    }
    return { ok: true, gold: row.reward_gold, chest: row.reward_chest, bonusSpin, bonusXp };
}
