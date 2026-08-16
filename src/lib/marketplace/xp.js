import "server-only";

import { db } from "@/lib/db";
import { sendWebPush } from "@/lib/push/web-push.js";
import { unlocksAtLevel } from "@/lib/marketplace/unlocks.js";
import { creditEquippedPetXp } from "@/lib/marketplace/pet-level.js";
import { activeXpMultiplier } from "@/lib/marketplace/happy-hour-core.js";
import { levelForXp } from "@/lib/marketplace/xp-curve.js";
import { logCoin } from "@/lib/marketplace/coins.js";
import { getTownBonuses } from "@/lib/marketplace/town-projects.js";
import { storeStatus } from "@/lib/marketplace/store-hours.js";

// Loyalty XP + levels. Meaningful actions award XP; a user's level is derived from their total.
// awardXp is best-effort and never throws into the action that triggered it.
export const MARKET_DAY_XP_BONUS = 0.10; // +10% XP for everyone while the physical store is open ("Market Day")

// Point values per action. Tune freely — they're only read here.
// Anti-farm: dollars spent are uncapped (real money), everything else is capped via dedupe keys
// (once-per-entity) and per-action daily caps at the call sites. Spending is still the fastest track, but
// the daily boss swing is now a meaningful engagement reward (50 XP + the matching gold) so showing up
// and fighting actually progresses you.
// Which rewards milestones a member has completed — drives the "How you earn" checklist. Repeatable
// ones (spend, event, daily) report whether they've been earned (daily = earned today).
export async function getRewardsProgress(buyerId) {
    if (!buyerId) return {};
    const rows = await db.query(`SELECT DISTINCT action FROM mkt_xp_event WHERE buyer_id = $1`, [buyerId]).catch(() => []);
    const actions = new Set(rows.map((r) => r.action));
    const todayActive = await db
        .queryOne(
            `SELECT 1 FROM mkt_xp_event
              WHERE buyer_id = $1 AND action = 'daily_active'
                AND (created_at AT TIME ZONE 'America/Chicago')::date = (NOW() AT TIME ZONE 'America/Chicago')::date
              LIMIT 1`,
            [buyerId]
        )
        .catch(() => null);
    return {
        spend: actions.has("purchase_spend"),
        first_purchase: actions.has("first_purchase"),
        event_checkin: actions.has("event_checkin"),
        discord_link: actions.has("discord_link"),
        profile_complete: actions.has("profile_complete"),
        daily_active: Boolean(todayActive),
        // Onboarding milestones — one-time nudges to try the social/community features.
        first_message: actions.has("first_message"),
        first_friend: actions.has("first_friend"),
        first_wishlist: actions.has("first_wishlist"),
        first_equip: actions.has("first_equip"),
    };
}

export const XP_ACTIONS = {
    message: 5, // sending a message — dedupe once/thread/day, plus a 3/day cap
    wishlist_add: 10, // adding a card to a wishlist — dedupe once/card, plus a 3/day cap
    daily_active: 3, // first app open of the day (dedupe once/day)
    profile_complete: 25, // name + handle + avatar all set (once, ever)
    purchase_flat: 20, // flat per-purchase bonus, capped 1/day (wired in the POS phase)
    first_purchase: 100, // first-ever purchase (once, ever) (wired in the POS phase)
    event_checkin: 50, // checking in at an event (once/event)
    discord_link: 50, // linking your Discord account while in the server (once, ever)
    // Onboarding milestones (each once, ever) — reward trying a feature for the first time.
    first_message: 40, // send your first message (store or a friend)
    first_friend: 40, // make your first friend
    first_wishlist: 30, // add your first card to your Looking For list
    first_equip: 20, // customize your look — equip a border or background
    boss_attack: 30, // one swing at the boss — every swing earns XP (bounded by your daily strike cap)
    boss_participated: 30, // your avatar took part in a boss that the pack slayed (once per boss)
    boss_won: 150, // won the boss-fight raffle prize (once per boss)
    // Bounty board (each deduped once per bounty — see bounties.js).
    bounty_post: 15, // posting a bounty on the board
    bounty_win: 40, // fulfilling a bounty for the community (per win)
    bounty_complete: 20, // marking your own bounty complete (creator)
};

// Award a one-time onboarding milestone. dedupe on (action, buyerId) so it can only ever fire once.
// Best-effort; returns the points granted or null if already earned / skipped.
export async function awardOnce(buyerId, action, meta = null) {
    if (!buyerId) return null;
    return awardXp(buyerId, action, { dedupeKey: `${action}:${buyerId}`, meta });
}

// Dollars spent → XP (uncapped). Used by the purchase/POS hook.
export const SPEND_XP_PER_DOLLAR = 5;

// The curve itself now lives in xp-curve.js — a pure module, so unlocks.js/track.js/the HUD route can
// import the SAME table instead of re-deriving it. Re-exported here because half the codebase already reaches
// for these through xp.js.
export { levelForXp, xpForLevel, MAX_LEVEL } from "@/lib/marketplace/xp-curve.js";

// Award XP to a user for an action. Returns the points granted, or null if skipped (deduped / capped /
// no user / zero points / any error).
//   dedupeKey — enforces once-per-entity via the unique index (e.g. once/card, once/day).
//   dailyCap  — at most this many awards of this action per user per (UTC) day.
// The active Town HANGOUT buff multiplier for a member (1 = none). Stored in the shared mkt_user_boost table as
// kind='town_hangout' (magnitude 1.05, 2h expiry) — granted after 3 min in the plaza (see town.js).
export async function memberHangoutMult(buyerId) {
    if (!buyerId) return 1;
    const rows = await db.query(`SELECT magnitude FROM mkt_user_boost WHERE buyer_id = $1 AND kind = 'town_hangout' AND expires_at > NOW()`, [buyerId]).catch(() => []);
    return rows.reduce((m, r) => m * (Number(r.magnitude) || 1), 1);
}

// `flat` — pay exactly the number on the tin, ignoring every earn-rate buff.
//
// The buffs above exist to reward PLAYING: swing at the boss during Happy Hour and the swing is worth more.
// That logic breaks for anything you BUY at a fixed price, because the price does not move with the buff. XP
// scrolls are sold for a fixed amount of gold and grant a fixed amount of XP, so riding the multiplier turned
// the shop into a gold→XP arbitrage: 27,500 gold bought ~12,000 XP normally and 48,048 XP during a 4x, with no
// cap or cooldown on how many you could buy back-to-back. The scroll IS the reward; it should not compound with
// a buff meant for effort.
export async function awardXp(buyerId, action, { points = null, gold = undefined, dedupeKey = null, dailyCap = null, meta = null, flat = false } = {}) {
    if (!buyerId) return null;
    const base = points != null ? Math.round(points) : XP_ACTIONS[action] || 0;
    if (base <= 0) return null;
    // Happy Hour multiplies all XP (which cascades to the gold + the equipped pet's 25% share below).
    const mult = flat ? 1 : await activeXpMultiplier().catch(() => 1);
    // The shared Town's prosperity gives EVERY member a standing % boost to XP & gold earned (Town Development).
    const town = flat ? { xpPct: 0, goldPct: 0 } : await getTownBonuses(Date.now()).catch(() => ({ xpPct: 0, goldPct: 0 }));
    const xpMult = 1 + (town.xpPct || 0) / 100;
    const goldMult = 1 + (town.goldPct || 0) / 100;
    // MARKET DAY — while the PHYSICAL Wolf Den store is open, every member earns bonus XP. Ties the game to real
    // store hours (and quietly rewards playing when you could pop in). Pure function of the clock — no DB cost.
    const marketMult = flat ? 1 : 1 + (storeStatus().open ? MARKET_DAY_XP_BONUS : 0);
    // Town HANGOUT buff — a personal +5% to XP & gold you earn after chilling in the plaza for 3 min (2h timer).
    const hangout = flat ? 1 : await memberHangoutMult(buyerId).catch(() => 1);
    // The Stockade used to take a flat -10% off everything earned while serving, applied here on both XP and
    // gold. It is gone. The pillory is a joke the town plays on you and the whole feature is meant to be fun;
    // docking someone's earnings for a day turns being laughed at into being punished for it. The locked Mark
    // of Shame badge stays — that IS the shaming, and it costs nothing. Also removes a DB round-trip that ran
    // on every single XP award in the game to answer "no" for almost everybody, almost every time.
    const pts = Math.round(base * mult * xpMult * marketMult * hangout);
    // Gold is UNLINKED from XP: by default it still tracks XP 1:1 (purchases, donations, boss, quests…), but a
    // caller can pass an explicit `gold` amount — e.g. TRADES award XP only (gold: 0), so we don't hand out
    // spendable currency for a payout we already paid the customer for. Town gold-boost rides on top of gold only.
    const goldBase = (gold === undefined ? base * mult : Number(gold) * mult) * hangout;
    const goldDelta = Math.max(0, Math.round(goldBase * goldMult));

    // Per-action daily cap — enforced ATOMICALLY in the insert so rapid/concurrent awards can't slip past it
    // (a plain COUNT-then-insert is racy: burst clicks all read "under cap" before any row commits). When a
    // cap is set the row only inserts if today's count is still under it; no row back = capped, so we bail.
    try {
        if (dailyCap != null && dailyCap > 0) {
            const inserted = await db.queryOne(
                `INSERT INTO mkt_xp_event (buyer_id, action, points, dedupe_key, meta)
                 SELECT $1, $2, $3, $4, $5
                  WHERE (SELECT COUNT(*) FROM mkt_xp_event
                           WHERE buyer_id = $1 AND action = $2 AND created_at::date = (NOW() AT TIME ZONE 'utc')::date) < $6
                 RETURNING id`,
                [buyerId, action, pts, dedupeKey, meta ? JSON.stringify(meta) : null, dailyCap]
            );
            if (!inserted) return null; // hit today's cap (or deduped) — skip the increment
        } else {
            // The unique index on dedupe_key makes a duplicate insert throw; we then skip the increment.
            await db.query(
                `INSERT INTO mkt_xp_event (buyer_id, action, points, dedupe_key, meta)
                 VALUES ($1, $2, $3, $4, $5)`,
                [buyerId, action, pts, dedupeKey, meta ? JSON.stringify(meta) : null]
            );
        }
    } catch {
        return null; // deduped (or a transient error) — never break the caller
    }
    // What the DB actually credited once the curator's bonus was applied. Declared out here because the pet's
    // share and this function's return value both have to be the REAL number — a pet earning 25% of the
    // pre-bonus figure would quietly drift from its owner the fuller their trophy room got.
    let ptsApplied = pts;
    try {
        // XP always advances the level; gold accrues separately (goldDelta) so payouts can give none.
        // ── THE CURATOR'S BONUS, APPLIED IN THE STATEMENT ────────────────────────────────────────────────
        // How full your Trophy Room is pays a standing % on everything you earn. It is multiplied HERE, in
        // SQL, rather than read first and applied in JS, because this function runs on every XP award in the
        // game — the comment above celebrates removing a round-trip from this path and adding one back to
        // fetch a percentage would undo that.
        //
        // The applied amounts come back out of RETURNING and are used for the level-up maths and the coin
        // ledger below. Recomputing them in JS would be two expressions that have to agree forever, and the
        // one that decides your level would eventually disagree with the one that moved your XP.
        const CUR = "(1 + COALESCE(trophy_pct, 0) / 100.0)";
        const row = flat
            ? await db.queryOne(`UPDATE mkt_buyer SET xp = xp + $2, gold = gold + $3, updated_at = NOW() WHERE id = $1 RETURNING xp, $2::int AS pts_got, $3::int AS gold_got`, [buyerId, pts, goldDelta])
            : await db.queryOne(
                `UPDATE mkt_buyer
                    SET xp = xp + GREATEST(0, ROUND($2 * ${CUR}))::int,
                        gold = gold + GREATEST(0, ROUND($3 * ${CUR}))::int,
                        updated_at = NOW()
                  WHERE id = $1
              RETURNING xp,
                        GREATEST(0, ROUND($2 * ${CUR}))::int AS pts_got,
                        GREATEST(0, ROUND($3 * ${CUR}))::int AS gold_got`,
                [buyerId, pts, goldDelta]
            );
        // If this award crossed a level boundary, celebrate it with a browser push (once, at the crossing).
        if (row) {
            // What ACTUALLY landed, not what was asked for — the two differ by the curator's bonus.
            const ptsGot = Number(row.pts_got) || 0;
            ptsApplied = ptsGot;
            const goldGot = Number(row.gold_got) || 0;
            if (goldGot !== 0) await logCoin(buyerId, goldGot, "xp_accrual", { meta: { action } }).catch(() => {});
            const newXp = Number(row.xp) || 0;
            const newLevel = levelForXp(newXp).level;
            const oldLevel = levelForXp(newXp - ptsGot).level;
            if (newLevel > oldLevel) {
                const unlocks = unlocksAtLevel(newLevel);
                // Don't push someone who is looking at the screen. They earned this two seconds ago by tapping
                // something, and the celebration modal is already on its way — a phone notification for it is
                // noise, and it costs a push send. Only notify if they've gone quiet.
                const active = await db.queryOne(
                    `SELECT 1 FROM mkt_visitor WHERE buyer_id = $1 AND last_seen > NOW() - INTERVAL '90 seconds' LIMIT 1`,
                    [buyerId],
                ).catch(() => null);
                if (active) return row;
                await sendWebPush(buyerId, {
                    kind: "levelup",
                    title: unlocks.length ? "🎁 New reward unlocked!" : "⬆️ Level up!",
                    body: unlocks.length
                        ? `Level ${newLevel} — you unlocked ${unlocks.slice(0, 2).join(" · ")}${unlocks.length > 2 ? ` +${unlocks.length - 2} more` : ""}!`
                        : `You reached level ${newLevel}. Tap to see what's next.`,
                    url: "/marketplace/track",
                    tag: "level-up",
                    data: { type: "level_up", level: newLevel },
                }).catch(() => {});
            }
        }
    } catch {
        // Ledger row exists; total will self-heal on the next recompute if we ever add one.
    }
    // The member's EQUIPPED pet earns a share of this XP (25%); no-op if nothing's equipped.
    await creditEquippedPetXp(buyerId, ptsApplied).catch(() => {});
    return ptsApplied;
}

// Convenience: a per-day dedupe key so an action only earns XP once per user per day.
export function dailyKey(action, buyerId, scope = "") {
    const day = new Date().toISOString().slice(0, 10);
    return `${action}:${buyerId}:${scope}:${day}`;
}

// Credit loyalty XP for a completed purchase to the matching marketplace account (found by email, or a
// known buyerId). Best-effort. Awards: $1 spent = 1 XP (uncapped, once/order) + a flat purchase bonus
// (once/order, capped 1/day) + a one-time first-purchase bonus. Also links the account to its Square
// customer for in-store loyalty later. Dollars are computed from the merchandise subtotal the caller
// passes (not tax/shipping). Deduped by order id so re-processing an order never double-credits.
// Resolve a marketplace account from a Square sale's identifiers: prefer the linked Square customer, then
// a matching email, then phone. Returns a buyer id or null. Shared by loyalty XP and mystery-bag big-hit
// attribution so both use the exact same matching rules.
export async function resolveBuyerId({ squareCustomerId = null, email = null, phone = null } = {}) {
    if (squareCustomerId) {
        const row = await db.queryOne(`SELECT id FROM mkt_buyer WHERE square_customer_id = $1`, [squareCustomerId]).catch(() => null);
        if (row?.id) return row.id;
    }
    if (email) {
        const row = await db.queryOne(`SELECT id FROM mkt_buyer WHERE email_normalized = $1`, [String(email).trim().toLowerCase()]).catch(() => null);
        if (row?.id) return row.id;
    }
    if (phone) {
        const row = await db.queryOne(`SELECT id FROM mkt_buyer WHERE phone = $1`, [phone]).catch(() => null);
        if (row?.id) return row.id;
    }
    return null;
}

export async function awardPurchaseXp({ email = null, phone = null, buyerId = null, amountCents = 0, orderId, squareCustomerId = null } = {}) {
    let id = buyerId || (await resolveBuyerId({ squareCustomerId, email, phone }));
    if (!id) {
        // No marketplace account yet — park the credit by email so it's waiting the moment they register.
        await parkPendingPurchase({ email, amountCents, orderId, squareCustomerId });
        return null;
    }

    const oid = String(orderId || "").trim();
    const dollars = Math.max(0, Math.round((Number(amountCents) || 0) / 100));

    // A RESTOCK buyout (orderId "restock-…") is a PAYOUT — the store bought cards FROM the customer, not a
    // sale. Reward it modestly like a trade: ~1/5 the value in XP, NO gold, and none of the purchase-only
    // bonuses/badges (first-purchase, flat, big-spender). Real Square purchases (oid "sq:…") keep full rewards.
    if (oid.startsWith("restock-")) {
        if (dollars > 0) await awardXp(id, "restock", { points: Math.round(dollars / 5), gold: 0, dedupeKey: `restock:${oid}`, meta: { orderId: oid } });
        return id;
    }

    // Stamp the real merchandise amount into the event meta so the admin purchase history reads exact dollars
    // (older events without it fall back to reconstructing from points ÷ SPEND_XP_PER_DOLLAR).
    const amt = Math.max(0, Number(amountCents) || 0);
    if (dollars > 0 && oid) {
        await awardXp(id, "purchase_spend", { points: dollars * SPEND_XP_PER_DOLLAR, dedupeKey: `spend:${oid}`, meta: { orderId: oid, amountCents: amt } });
    }
    if (oid) {
        await awardXp(id, "purchase_flat", { dedupeKey: `purchase_flat:${oid}`, dailyCap: 1, meta: { orderId: oid, amountCents: amt } });
    }
    await awardXp(id, "first_purchase", { dedupeKey: `first_purchase:${id}`, meta: { orderId: oid } });

    if (squareCustomerId) {
        await db
            .query(
                `UPDATE mkt_buyer SET square_customer_id = $2 WHERE id = $1 AND (square_customer_id IS NULL OR square_customer_id = '')`,
                [id, squareCustomerId]
            )
            .catch(() => {});
    }
    return id;
}

// Park a purchase that has no marketplace account yet, keyed by email. Redeemed into real XP when the
// buyer registers with that email (see claimPendingPurchases). Deduped by (email, order). Best-effort.
async function parkPendingPurchase({ email, amountCents = 0, orderId, squareCustomerId = null }) {
    const normalized = email ? String(email).trim().toLowerCase() : null;
    const oid = String(orderId || "").trim();
    if (!normalized || !oid) return;
    await db
        .query(
            `INSERT INTO mkt_pending_purchase (email_normalized, order_id, amount_cents, square_customer_id)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (email_normalized, order_id) DO NOTHING`,
            [normalized, oid, Math.max(0, Number(amountCents) || 0), squareCustomerId || null]
        )
        .catch(() => {});
}

// Redeem any purchases parked for this buyer's email into real XP, and link their Square customer. Called
// when an account is created/opened. Best-effort and idempotent — awardPurchaseXp is deduped by order id,
// and each pending row is marked redeemed so it never replays. Safe to call often.
export async function claimPendingPurchases(buyerId, email) {
    const normalized = email ? String(email).trim().toLowerCase() : null;
    if (!buyerId || !normalized) return 0;
    const rows = await db
        .query(
            `SELECT id, order_id, amount_cents, square_customer_id
               FROM mkt_pending_purchase
              WHERE email_normalized = $1 AND redeemed_at IS NULL
              ORDER BY created_at ASC`,
            [normalized]
        )
        .then((r) => r?.rows || r || [])
        .catch(() => []);
    if (!rows.length) return 0;

    let claimed = 0;
    for (const row of rows) {
        await awardPurchaseXp({
            buyerId,
            amountCents: row.amount_cents,
            orderId: row.order_id,
            squareCustomerId: row.square_customer_id || null,
        });
        await db
            .query(`UPDATE mkt_pending_purchase SET redeemed_at = NOW(), redeemed_buyer_id = $2 WHERE id = $1`, [row.id, buyerId])
            .catch(() => {});
        claimed += 1;
    }
    return claimed;
}

// Is there a level-up the user hasn't been shown yet? Compares current level to celebrated_level so the
// celebration fires exactly once per level, tracked server-side (same on every device, never on login).
export async function getPendingLevelUp(buyerId) {
    if (!buyerId) return { pending: false };
    const row = await db.queryOne(`SELECT xp, celebrated_level FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    if (!row) return { pending: false };
    const level = levelForXp(row.xp || 0).level;
    const celebrated = Math.max(1, Number(row.celebrated_level || 1));
    return level > celebrated ? { pending: true, level, from: celebrated } : { pending: false, level };
}

// Mark that the user has seen the celebration up through [level] — so it never replays for that level.
export async function acknowledgeLevel(buyerId, level) {
    if (!buyerId) return;
    const lvl = Math.max(1, Math.floor(Number(level) || 1));
    await db.query(`UPDATE mkt_buyer SET celebrated_level = GREATEST(celebrated_level, $2) WHERE id = $1`, [buyerId, lvl]).catch(() => {});
}
