import "server-only";

import { db } from "@/lib/db";

// ── WHICH PARTS OF THE GAME CAN WE SEE ───────────────────────────────────────────────────────────────────────
// Luke: "I suspect that we still have a lot of gaps in telemetry. Maybe it can do an audit to see where we're
// missing telemetry."
//
// The audit that answered that was a one-off script, and a one-off audit rots the day it is written. This is
// the same audit as a permanent object: a declared list of every system in the game and the events that prove
// it is alive, joined against what actually landed in mkt_activity_event.
//
// ── THE REGISTRY IS THE CONTRACT, AND A GATE KEEPS IT HONEST ─────────────────────────────────────────────────
// A hand-maintained list drifts: somebody adds a feature, forgets the registry, and the screen reports full
// coverage over a hole. So `npm run check:telemetry` diffs this registry against every trackActivity call in
// the source, both directions — an event fired but not declared fails, and an event declared but not fired
// from anywhere fails too. The screen can therefore be trusted to be about the game rather than about the
// registry.
//
// ── DARK IS DECLARED, NOT DISCOVERED ─────────────────────────────────────────────────────────────────────────
// The systems that emit nothing are listed here BY NAME with what it costs us. A gap you have written down is
// a decision; a gap you have to re-derive with a script every few months is a surprise.

const AREAS = ["Farm", "Town", "Casino", "Combat", "Sea", "Economy", "Crafting", "Social", "Progression"];

// key → { label, area, events }. `events` is every activity key the system emits.
const SYSTEMS = [
    // ── FARM ─────────────────────────────────────────────────────────────────────────────────────────────
    { key: "farm_crops", label: "Crops", area: "Farm", events: ["plant_seed", "harvest_crop", "fertilize_crop"] },
    { key: "farm_deco", label: "Decorations", area: "Farm", events: ["place_deco", "arrange_deco", "deco_unlock"] },
    { key: "farm_pets", label: "Pets on the farm", area: "Farm", events: ["feed_pet", "feed_pet_bulk", "feed_other", "pet_farm", "pet_other", "loot_pig"] },
    { key: "farm_rating", label: "Farm ratings", area: "Farm", events: ["farm_rate"] },
    { key: "farm_encounters", label: "Critter encounters", area: "Farm", events: ["farm_encounter"] },
    { key: "pets", label: "Pet collection", area: "Farm", events: ["buy_pet", "equip_pet", "pet_share_offer", "pet_share_accept"] },
    { key: "pet_drops", label: "Pet drops", area: "Farm", events: ["pet_drop"] },
    { key: "pet_ascension", label: "Enshrinement", area: "Farm", events: ["pet_enshrined", "pet_stone_found"] },
    { key: "pet_level", label: "Pet leveling", area: "Farm", events: ["pet_level_up"] },

    // ── TOWN ─────────────────────────────────────────────────────────────────────────────────────────────
    { key: "town_chat", label: "Chat", area: "Town", events: ["town_chat"] },
    { key: "town_quests", label: "Quartermaster bounties", area: "Town", events: ["town_quest"] },
    { key: "town_shiny", label: "Shiny glint", area: "Town", events: ["shiny_claim"] },
    { key: "town_raids", label: "Plaza raids", area: "Town", events: ["raid_join"] },
    { key: "town_swarm", label: "Swarm fights", area: "Town", events: ["swarm_kill"] },
    { key: "town_tavern", label: "The Tavern", area: "Town", events: ["tavern_gambit_start", "tavern_gambit_reroll", "tavern_gambit", "tavern_pint", "tavern_round"] },
    { key: "stockade", label: "The Stockade", area: "Town", events: ["stockade_act", "stockade_release"] },

    // ── CASINO ───────────────────────────────────────────────────────────────────────────────────────────
    { key: "casino", label: "The floor", area: "Casino", events: ["casino_play", "casino_prize", "casino_buy"] },
    { key: "casino_vip", label: "VIP lounge", area: "Casino", events: ["casino_vip_enter"] },

    // ── COMBAT ───────────────────────────────────────────────────────────────────────────────────────────
    { key: "arena", label: "The Arena", area: "Combat", events: ["arena_start", "arena_win", "arena_loss", "arena_ladder"] },
    { key: "arena_build", label: "Class & skills", area: "Combat", events: ["arena_class", "arena_class_respec", "arena_skill", "arena_skill_node", "arena_respec", "arena_armoury", "purser_exchange"] },
    { key: "boss", label: "Weekly boss", area: "Combat", events: ["boss_attack", "cheer"] },
    { key: "delves", label: "Delves", area: "Combat", events: ["delve_start", "delve_clear", "delve_end", "delve_upgrade"] },

    // ── SEA ──────────────────────────────────────────────────────────────────────────────────────────────
    { key: "sailing", label: "Voyages", area: "Sea", events: ["sail_voyage", "sail_encounter", "sail_wave", "sail_dig", "sail_raid", "sail_merchant", "sail_merchant_buy", "market_day", "gamble_chest", "ship_battle", "ship_battle_end"] },
    { key: "sailing_shop", label: "Shipwright", area: "Sea", events: ["buy_ammo", "buy_digs", "buy_locker", "buy_piece", "buy_upgrade"] },
    { key: "fishing", label: "Fishing", area: "Sea", events: ["fish_caught", "fish_missed", "fish_treasure", "fish_recharge", "fish_monster", "fish_monster_won"] },

    // ── ECONOMY ──────────────────────────────────────────────────────────────────────────────────────────
    { key: "market", label: "The Market", area: "Economy", events: ["market_list", "market_buy"] },
    { key: "auction", label: "The Auction House", area: "Economy", events: ["auction_list", "auction_buy", "auction_sold", "auction_cancel"] },
    { key: "trade", label: "Member trades", area: "Economy", events: ["trade_propose", "trade_accept"] },
    { key: "gear", label: "Gear & inventory", area: "Economy", events: ["buy_gear", "sell_gear", "equip", "unequip"] },
    { key: "cosmetics", label: "Cosmetics", area: "Economy", events: ["buy_cosmetic"] },
    { key: "chests", label: "Chests", area: "Economy", events: ["open_chest"] },
    { key: "spin", label: "The wheel", area: "Economy", events: ["daily_spin", "buy_spin", "spin_bonus_win", "spin_bonus_dupe"] },
    { key: "deals", label: "Daily deals", area: "Economy", events: ["buy_daily_deal", "cooldown_skip"] },
    { key: "checkin", label: "Daily check-in", area: "Economy", events: ["daily_checkin"] },
    { key: "happy_hour", label: "Happy Hour", area: "Economy", events: ["happy_hour_donate"] },
    { key: "consumables", label: "Consumables", area: "Economy", events: ["buy_consumable", "use_consumable"] },

    // ── CRAFTING ─────────────────────────────────────────────────────────────────────────────────────────
    { key: "forge", label: "The Forge", area: "Crafting", events: ["craft_salvage", "craft_enhance"] },
    { key: "cooking", label: "Cooking", area: "Crafting", events: ["cooked", "recipe_learned", "kitchen_upgrade", "buy_recipe"] },
    { key: "jeweller", label: "The Jewelcutter", area: "Crafting", events: ["socket_cut", "gem_set", "gem_fuse"] },
    { key: "element", label: "Elemental reforge", area: "Crafting", events: ["enchant_element", "reforge_element"] },
    { key: "mining", label: "The mine", area: "Crafting", events: ["mine_trip", "mine_trip_bought", "ore_mined", "ore_smelted", "mine_collapse", "mine_surface", "mining_upgrade"] },

    // ── SOCIAL ───────────────────────────────────────────────────────────────────────────────────────────
    { key: "dm", label: "Direct messages", area: "Social", events: ["dm_sent"] },
    { key: "friends", label: "Friends", area: "Social", events: ["friend_request", "friend_accept"] },
    { key: "creations", label: "Creations", area: "Social", events: ["creation_shared", "creation_received"] },
    { key: "petting_stand", label: "Petting stand", area: "Social", events: ["stand_seat"] },
    { key: "profiles", label: "Profiles", area: "Social", events: ["view_profile"] },

    // ── PROGRESSION ──────────────────────────────────────────────────────────────────────────────────────
    { key: "guide", label: "The Pathfinder", area: "Progression", events: ["guide_step", "guide_chapter"] },
    { key: "onboarding", label: "Onboarding", area: "Progression", events: ["onboard_claim"] },
    { key: "badges", label: "Badges", area: "Progression", events: ["badge_milestone", "buy_badge"] },
    { key: "bounties", label: "Member bounties", area: "Progression", events: ["bounty_post", "bounty_claim", "bounty_win", "bounty_complete", "bounty_cancel"] },

    // ── NAVIGATION ───────────────────────────────────────────────────────────────────────────────────────
    // Client-fired page and browse events. Grouped so they don't dominate the per-system volume ranking.
    { key: "navigation", label: "Pages & browsing", area: "Progression", events: ["page_view", "browse_shop", "view_shop", "view_vendor", "view_inventory", "view_boss", "view_leaderboard", "view_bounties", "view_sets", "view_compendium", "view_creations", "shop_search", "shop_filter", "inspect_item", "share_location"] },
];

// ── THE SYSTEMS THAT STILL EMIT NOTHING ──────────────────────────────────────────────────────────────────────
// Written down rather than rediscovered. `cost` is what the blindness actually stops us answering — not a
// severity label, because a severity label is an opinion and this is a question we cannot currently answer.
const DARK = [
    { key: "store_credit", label: "Store credit", area: "Economy", cost: "Buying and spending credit is invisible; the money moves, the behaviour doesn't." },
    { key: "messaging", label: "Vendor threads", area: "Social", cost: "Buyer-to-vendor conversation volume is unknown, so we can't tell a quiet marketplace from a broken one." },
    { key: "town_projects", label: "Town projects", area: "Town", cost: "Who contributes to the shared builds, and whether the wishing well is used at all." },
    { key: "casino_rounds", label: "Casino side bets", area: "Casino", cost: "Bets placed and settled leave no trace outside the chip ledger." },
    { key: "casino_perks", label: "Casino perks", area: "Casino", cost: "Which unlocks people actually buy from the Counter." },
    { key: "ascension_powers", label: "Signature powers", area: "Combat", cost: "120 powers ship, and we can't see which ones get equipped or fired." },
    { key: "boss_buff", label: "Boss damage buffs", area: "Combat", cost: "Timed buffs are a known damage multiplier with no usage record." },
    { key: "farm_consumables", label: "Farm consumables", area: "Farm", cost: "Tonics, fertiliser and luck charges — the farm's own multipliers." },
    { key: "farm_plots", label: "Plot upgrades", area: "Farm", cost: "Which upgrade tracks members invest in." },
    { key: "pet_income", label: "Pet income", area: "Farm", cost: "Passive earnings settle with no event, so idle play looks like no play." },
    { key: "pet_redemption", label: "Pet perks", area: "Farm", cost: "In-store perk redemptions." },
    { key: "feature_dailies", label: "Feature dailies", area: "Progression", cost: "Per-feature daily cards — claim rates would tell us which features pull people back." },
    { key: "referral", label: "Invite a friend", area: "Social", cost: "The whole referral funnel, from link to signup." },
    { key: "polls_surveys", label: "Polls & surveys", area: "Social", cost: "Response rates." },
    { key: "gifts", label: "Gifts", area: "Social", cost: "Member-to-member gifting." },
    { key: "swaps_offers", label: "Swaps, offers, wants", area: "Economy", cost: "Marketplace negotiation — every want, swap and dealer offer." },
    { key: "sell_offers", label: "Sell offers", area: "Economy", cost: "Members offering stock to vendors." },
    { key: "claims", label: "In-store claims", area: "Economy", cost: "Loyalty, donation, trade and charge claims — the bridge between the game and the till." },
    { key: "custom_deco", label: "Custom creations", area: "Social", cost: "The paid AI-art bench: drafts started versus creations finished." },
    { key: "stockade_election", label: "Stockade elections", area: "Town", cost: "Nominations and votes." },
    { key: "events", label: "Store events", area: "Town", cost: "RSVPs and attendance." },
    { key: "gun_ports", label: "Ship loadouts", area: "Sea", cost: "Saved hull and gun-port configurations." },
    { key: "giveaways", label: "Giveaways", area: "Progression", cost: "Owner grants land with no member-side event." },
];

export async function getTelemetryCoverage({ days = 30 } = {}) {
    const d = Math.max(1, Math.min(90, Number(days) || 30));

    const [rows, total] = await Promise.all([
        db.query(
            `SELECT event, COUNT(*)::int AS n, COUNT(DISTINCT buyer_id)::int AS members, MAX(created_at) AS last_at
               FROM mkt_activity_event
              WHERE created_at >= NOW() - ($1 || ' days')::interval
              GROUP BY event`,
            [d],
        ).catch(() => []),
        db.queryOne(
            `SELECT COUNT(*)::int AS n FROM mkt_activity_event WHERE created_at >= NOW() - ($1 || ' days')::interval`,
            [d],
        ).catch(() => null),
    ]);

    const seen = new Map((rows || []).map((r) => [r.event, r]));
    const claimed = new Set();

    const systems = SYSTEMS.map((s) => {
        const events = s.events.map((e) => {
            claimed.add(e);
            const r = seen.get(e);
            return { event: e, n: Number(r?.n) || 0, members: Number(r?.members) || 0, lastAt: r?.last_at || null };
        }).sort((a, b) => b.n - a.n);
        const live = events.filter((e) => e.n > 0).length;
        const n = events.reduce((a, b) => a + b.n, 0);
        // A system is only "live" when every event it declares has actually fired. Partial is the interesting
        // state: the feature is instrumented but one of its branches has never once been reached, which is
        // either a dead code path or a broken call site.
        const status = live === 0 ? "silent" : live === events.length ? "live" : "partial";
        return {
            key: s.key, label: s.label, area: s.area, status,
            n, members: Math.max(0, ...events.map((e) => e.members)),
            declared: events.length, firing: live, events,
        };
    }).sort((a, b) => b.n - a.n);

    // Anything in the table that no system claims. Usually a retired event still sitting in history, but it is
    // also how a new event added without a registry entry shows up before the gate catches it.
    const unregistered = (rows || [])
        .filter((r) => !claimed.has(r.event))
        .map((r) => ({ event: r.event, n: Number(r.n) || 0, members: Number(r.members) || 0, lastAt: r.last_at || null }))
        .sort((a, b) => b.n - a.n);

    const counts = { live: 0, partial: 0, silent: 0, dark: DARK.length };
    for (const s of systems) counts[s.status] += 1;
    const tracked = systems.length + DARK.length;

    const areas = AREAS.map((a) => {
        const mine = systems.filter((s) => s.area === a);
        const dark = DARK.filter((x) => x.area === a);
        return {
            area: a,
            live: mine.filter((s) => s.status === "live").length,
            partial: mine.filter((s) => s.status === "partial").length,
            silent: mine.filter((s) => s.status === "silent").length,
            dark: dark.length,
            n: mine.reduce((x, s) => x + s.n, 0),
        };
    }).filter((a) => a.live + a.partial + a.silent + a.dark > 0);

    return {
        days: d,
        totalEvents: total?.n || 0,
        distinctEvents: (rows || []).length,
        declaredEvents: claimed.size,
        systems,
        areas,
        dark: DARK.map((x) => ({ ...x })),
        unregistered,
        coverage: {
            ...counts,
            tracked,
            pct: tracked ? Math.round((counts.live / tracked) * 100) : 0,
        },
    };
}

// Exported for the gate — it diffs this against every trackActivity call site in the source tree.
export function declaredEventKeys() {
    const out = new Set();
    for (const s of SYSTEMS) for (const e of s.events) out.add(e);
    return out;
}

export { SYSTEMS, DARK };
