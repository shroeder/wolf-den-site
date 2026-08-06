import "server-only";

import { db } from "@/lib/db";
import { awardXp } from "@/lib/marketplace/xp.js";
import { levelForXp } from "@/lib/marketplace/xp.js";
import { trackActivity } from "@/lib/marketplace/activity.js";
import { syncEarnedBadges } from "@/lib/marketplace/badges.js";
import { bumpQuestProgress } from "@/lib/marketplace/quests.js";

// Farm LIKES — a positive-only, three-tier "rate a friend's farm" system. Rating is a like, not a score:
// Like 👍 < Love ❤️ < Admire ⭐.
//
// One persistent rating row per (rater → owner), so a farm's tally stays "how many people love this farm" and
// never inflates into "how many clicks".
//
// A rating row holds your CURRENT tier plus a VOTE COUNT. You may rate the same person again each DAY, at most
// once per person per store-local day, so your three have to be spread across three different farms — and every
// visit ADDS to that farm's total, which is the whole reason to come back. Once you have rated someone today
// you are DONE with them until tomorrow: changing your mind is free and does nothing, because a revision was
// never a visit and letting it spend a charge is what allowed all three of the day's ratings to land on one
// farm (Like, Love, Admire, "none left today", two farms never visited).
const DAY = "(NOW() AT TIME ZONE 'America/Chicago')::date";
// THREE A DAY, ONE PER PERSON — so the three have to be SPREAD.
//
// Both halves of that are deliberate. One vote per person per day is what makes this a reason to go and look
// at three different farms instead of clicking the same one three times, and three a day is the ceiling that
// keeps the XP honest: these two awards were already trimmed 35% for being 5.5% of all XP in the game.
//
// This briefly shipped at 20/day with only the first three paying XP. That was a misread — the ask was to keep
// voting for the same farm on later days, which the per-day reset already allowed; it was never for a bigger
// daily budget. Back to three.
const RATES_PER_DAY = 3; // votes a day, at most one per person — so they must be spread across three farms
// What a repeat visit pays, against a first-ever rating of that person. Held under 1 on purpose: these two
// awards were trimmed 35% for being 5.5% of all XP in the game, and making them repeatable every day pushes
// straight back through that ceiling. Set to 1 for full parity — it's the only number that decides this.
const REPEAT_XP_MULT = 0.6;

export const RATE_TIERS = {
    // Trimmed ~35%. Between them these two paid 8,128 XP a week (5.5% of all XP) for visiting a farm and
    // pressing a button, and the OWNER's half is XP for having been visited — the most passive income here.
    // Ratings should still be worth giving and getting; they should not out-earn playing.
    1: { key: "like", label: "Like", icon: "👍", color: "#7ec8ff", raterXp: 8, ownerXp: 12, blurb: "Nice farm!" },
    2: { key: "love", label: "Love", icon: "❤️", color: "#ff6fae", raterXp: 15, ownerXp: 22, blurb: "Love it!" },
    3: { key: "admire", label: "Admire", icon: "⭐", color: "#ffd75e", raterXp: 26, ownerXp: 38, blurb: "Absolutely admire it!" },
};
export const tierMeta = (t) => RATE_TIERS[t] || null;

// Read + lazily day-reset the rater's daily new-rating charge. Idempotent (safe on plain load).
async function rateCharge(buyerId) {
    const b = await db
        .queryOne(
            `UPDATE mkt_buyer
                SET farm_rate_used = CASE WHEN farm_rate_day = ${DAY} THEN farm_rate_used ELSE 0 END,
                    farm_rate_bonus = CASE WHEN farm_rate_day = ${DAY} THEN COALESCE(farm_rate_bonus,0) ELSE 0 END,
                    farm_rate_day = ${DAY}
              WHERE id = $1
              RETURNING farm_rate_used, COALESCE(farm_rate_bonus,0) AS farm_rate_bonus`,
            [buyerId]
        )
        .catch(() => null);
    const used = b?.farm_rate_used || 0;
    const bonus = b?.farm_rate_bonus || 0; // Kindness Token consumable — extra rating charges today
    const allowance = RATES_PER_DAY + bonus;
    return { used, allowance, left: Math.max(0, allowance - used) };
}

// Aggregate counts of a farm's likes, by tier + total, plus the viewer's own current rating.
async function ratingSummary(ownerId, viewerId) {
    // SUM(votes), not COUNT(*). The tally used to count distinct RATERS, so coming back the next day to rate
    // a friend again spent a charge, paid XP to both sides, and moved their number by nothing at all.
    const [rows, mine, supporters] = await Promise.all([
        db.query(`SELECT tier, SUM(votes)::int AS n FROM mkt_farm_rating WHERE owner_id = $1 GROUP BY tier`, [ownerId]).catch(() => []),
        viewerId && String(viewerId) !== String(ownerId)
            ? db.queryOne(`SELECT tier, votes, (last_rated_day = ${DAY}) AS rated_today FROM mkt_farm_rating WHERE owner_id = $1 AND rater_id = $2`, [ownerId, viewerId]).catch(() => null)
            : Promise.resolve(null),
        // Distinct people is still worth showing beside the vote total — "12 votes from 5 friends" says more
        // than either number alone.
        db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_farm_rating WHERE owner_id = $1`, [ownerId]).catch(() => null),
    ]);
    const byTier = { 1: 0, 2: 0, 3: 0 };
    for (const r of rows || []) byTier[r.tier] = r.n;
    const total = byTier[1] + byTier[2] + byTier[3];
    // ratedToday drives the button state: your tier is still shown as yours, but the farm can say "come back
    // tomorrow" rather than looking like a live button that silently does nothing.
    return {
        total, byTier,
        supporters: Number(supporters?.n) || 0,
        myTier: mine?.tier || null,
        myVotes: Number(mine?.votes) || 0,
        ratedToday: Boolean(mine?.rated_today),
    };
}

// ── WHERE YOU PLACE, NOT WHAT YOU SCORED ─────────────────────────────────────────────────────────────────────
// Farm Rank was a ladder of fixed thresholds — 35 points is a "Thriving Farm", 60 is a "Bountiful Estate".
// That is a solo progress bar wearing the word "rank": it says nothing about how your farm compares to anyone
// else's, which is the only question a rank is actually asked. And because the thresholds never move, the
// whole Den eventually tops out at the same title and the ladder stops meaning anything.
//
// It is a standings position now. Same tier-weighted score (like 1 · love 2 · admire 3), but what you are told
// is that you are 2nd of 40 — a number that can only go up by other people liking your farm more than someone
// else's, and one that changes when they do.
//
// Ranked in SQL so it stays one query no matter how big the Den gets. Ties share a place (DENSE_RANK), because
// two farms on identical love are genuinely tied and telling one of them they are 3rd would be a lie.
async function farmStandings(ownerId) {
    const row = await db
        .queryOne(
            `WITH scored AS (
                 SELECT owner_id, SUM(votes * CASE tier WHEN 3 THEN 3 WHEN 2 THEN 2 ELSE 1 END)::int AS score
                   FROM mkt_farm_rating GROUP BY owner_id
             ), placed AS (
                 SELECT owner_id, score, DENSE_RANK() OVER (ORDER BY score DESC) AS place FROM scored
             )
             SELECT
                 (SELECT place FROM placed WHERE owner_id = $1) AS place,
                 (SELECT score FROM placed WHERE owner_id = $1) AS score,
                 (SELECT COUNT(*)::int FROM placed) AS ranked,
                 (SELECT MIN(score) FROM placed p2 WHERE p2.place = (SELECT place FROM placed WHERE owner_id = $1) - 1) AS next_score`,
            [ownerId]
        )
        .catch(() => null);
    const score = Number(row?.score) || 0;
    const place = Number(row?.place) || 0;
    return {
        score,
        // No place at all until someone has rated you — "unranked" is honest, "last of 40" is discouraging for
        // a farm nobody has visited yet.
        place: place || null,
        ranked: Number(row?.ranked) || 0,
        // How many points would draw level with the place above. Null at the top.
        toNext: row?.next_score != null ? Math.max(1, Number(row.next_score) - score) : null,
    };
}

// The rating block attached to a farm view: the summary, whether the viewer can rate, and their charge state.
export async function farmRatingBits(ownerId, viewerId) {
    const own = String(viewerId || "") === String(ownerId);
    const [summary, charge, standings] = await Promise.all([
        ratingSummary(ownerId, viewerId),
        viewerId && !own ? rateCharge(viewerId) : Promise.resolve(null),
        farmStandings(ownerId),
    ]);
    return {
        rating: {
            ...summary,
            canRate: Boolean(viewerId) && !own,
            isOwn: own,
            charge, // { used, allowance, left } or null on your own farm
            standings, // { score, place, ranked, toNext }
        },
    };
}

// Rate (or revise your rating of) another member's farm. First rating of a person spends a daily charge and
// awards XP to BOTH; revising an existing rating is free and re-awards nothing (anti-farm). Returns the fresh
// summary + charge so the client can patch in place.
export async function rateFarm(raterId, ownerId, tier) {
    if (!raterId || !ownerId) return { ok: false, error: "bad_request" };
    if (String(raterId) === String(ownerId)) return { ok: false, error: "cant_rate_own" };
    const t = Number(tier);
    if (!RATE_TIERS[t]) return { ok: false, error: "bad_tier" };
    // Owner must exist (and have a farm — everyone implicitly does once they have an account).
    const owner = await db.queryOne(`SELECT id FROM mkt_buyer WHERE id = $1`, [ownerId]).catch(() => null);
    if (!owner) return { ok: false, error: "no_such_farm" };

    const existing = await db
        .queryOne(`SELECT tier, (last_rated_day = ${DAY}) AS rated_today FROM mkt_farm_rating WHERE rater_id = $1 AND owner_id = $2`, [raterId, ownerId])
        .catch(() => null);
    const meta = RATE_TIERS[t];

    // A REPEAT: you've rated them before, but not today. Spend a charge, pay both sides (at REPEAT_XP_MULT),
    // and clear owner_seen_at so it shows up in their "who rated your farm" recap all over again.
    if (existing && !existing.rated_today) {
        const charge0 = await rateCharge(raterId);
        if (charge0.left <= 0) {
            const summary = await ratingSummary(ownerId, raterId);
            return { ok: false, error: "no_charge_left", myTier: existing.tier, ...summary, charge: charge0 };
        }
        const slot = await db
            .queryOne(
                `UPDATE mkt_buyer SET farm_rate_used = farm_rate_used + 1
                  WHERE id = $1 AND farm_rate_day = ${DAY} AND farm_rate_used < $2 RETURNING farm_rate_used`,
                [raterId, charge0.allowance]
            )
            .catch(() => null);
        if (!slot) {
            const [summary, charge] = await Promise.all([ratingSummary(ownerId, raterId), rateCharge(raterId)]);
            return { ok: false, error: "no_charge_left", myTier: existing.tier, ...summary, charge };
        }
        // Guarded on the day as well as the pair: two taps racing each other can't both bank the XP.
        const bumped = await db
            .queryOne(
                `UPDATE mkt_farm_rating SET tier = $3, votes = votes + 1, updated_at = NOW(), owner_seen_at = NULL, last_rated_day = ${DAY}
                  WHERE rater_id = $1 AND owner_id = $2 AND last_rated_day IS DISTINCT FROM ${DAY} RETURNING tier, votes`,
                [raterId, ownerId, t]
            )
            .catch(() => null);
        if (!bumped) {
            // Lost the race — refund the charge, treat as already-rated-today.
            await db.query(`UPDATE mkt_buyer SET farm_rate_used = GREATEST(0, farm_rate_used - 1) WHERE id = $1 AND farm_rate_day = ${DAY}`, [raterId]).catch(() => {});
            const [summary, charge] = await Promise.all([ratingSummary(ownerId, raterId), rateCharge(raterId)]);
            return { ok: true, changed: false, myTier: t, ...summary, charge, xpGained: 0 };
        }
        const raterXp = Math.max(1, Math.round(meta.raterXp * REPEAT_XP_MULT));
        const ownerXp = Math.max(1, Math.round(meta.ownerXp * REPEAT_XP_MULT));
        // gold: 0 is load-bearing on BOTH — awardXp pays gold 1:1 with points otherwise, and this is now a
        // repeatable daily action rather than a once-per-person one.
        await awardXp(raterId, "farm_rate_give", { points: raterXp, gold: 0 }).catch(() => {});
        await awardXp(ownerId, "farm_rate_get", { points: ownerXp, gold: 0 }).catch(() => {});
        await trackActivity(raterId, "farm_rate", { owner: ownerId, tier: t, repeat: true }).catch(() => {});
        await bumpQuestProgress(raterId, "farm_rate", 1).catch(() => {}); // the daily "rate a friend's farm" quest
        await syncEarnedBadges(ownerId).catch(() => {});
        const [summary, charge] = await Promise.all([ratingSummary(ownerId, raterId), rateCharge(raterId)]);
        return { ok: true, changed: true, repeat: true, myTier: t, xpGained: raterXp, ...summary, charge };
    }

    // ── ONE FARM, ONCE A DAY. FULL STOP. ─────────────────────────────────────────────────────────────────────
    // Only reachable when you have ALREADY rated this person today (the branch above owns every other case).
    //
    // This used to allow a revision: tapping a different tier spent a charge, changed the tier and paid no XP.
    // Which meant the daily three could all be spent on ONE farm — Like, then Love, then Admire on the same
    // person, "none left today", and the other two farms you were meant to go and look at never got visited.
    // Three a day exists to send you to three different farms; a revision is not a visit, so it is not a use
    // of a charge and there is nothing here to spend one on. Come back tomorrow and rate them again — that
    // path is the repeat above, and it both pays and adds to their tally.
    if (existing) {
        const [summary, charge] = await Promise.all([ratingSummary(ownerId, raterId), rateCharge(raterId)]);
        return { ok: true, changed: false, alreadyToday: true, myTier: existing.tier, ...summary, charge, xpGained: 0 };
    }

    // NEW rating — spend one daily charge (atomic guard), then insert + award XP to both.
    const charge0 = await rateCharge(raterId);
    if (charge0.left <= 0) return { ok: false, error: "no_charge_left", charge: charge0 };
    const slot = await db
        .queryOne(
            `UPDATE mkt_buyer SET farm_rate_used = farm_rate_used + 1
              WHERE id = $1 AND farm_rate_day = ${DAY} AND farm_rate_used < $2 RETURNING farm_rate_used`,
            [raterId, charge0.allowance]
        )
        .catch(() => null);
    if (!slot) return { ok: false, error: "no_charge_left", charge: await rateCharge(raterId) };

    const inserted = await db
        .queryOne(
            `INSERT INTO mkt_farm_rating (rater_id, owner_id, tier, owner_seen_at, last_rated_day) VALUES ($1, $2, $3, NULL, ${DAY})
             ON CONFLICT (rater_id, owner_id) DO NOTHING RETURNING tier`,
            [raterId, ownerId, t]
        )
        .catch(() => null);
    if (!inserted) {
        // Raced with another insert (already rated) — refund the charge and treat as a no-op revise.
        await db.query(`UPDATE mkt_buyer SET farm_rate_used = GREATEST(0, farm_rate_used - 1) WHERE id = $1 AND farm_rate_day = ${DAY}`, [raterId]).catch(() => {});
        const [summary, charge] = await Promise.all([ratingSummary(ownerId, raterId), rateCharge(raterId)]);
        return { ok: true, changed: false, myTier: t, ...summary, charge, xpGained: 0 };
    }

    // Green Thumb: a companion turns the courtesy of rating someone's farm into a seed for you. Rating is
    // already daily-capped, so this can't be farmed beyond that ceiling.
    let seedFound = null;
    try {
        const { getPetSystemPerk } = await import("@/lib/marketplace/pet-combat.js");
        const gt = await getPetSystemPerk(raterId, "green_thumb");
        if (gt > 0 && Math.random() < gt / 100) {
            const { dropSeedFrom } = await import("@/lib/marketplace/farm-crops.js");
            seedFound = await dropSeedFrom(raterId, "green_thumb").catch(() => null);
        }
    } catch { /* a seed is a bonus; never fail the rating */ }
    await awardXp(raterId, "farm_rate_give", { points: meta.raterXp, gold: 0 }).catch(() => {});
    await awardXp(ownerId, "farm_rate_get", { points: meta.ownerXp, gold: 0 }).catch(() => {});
    await trackActivity(raterId, "farm_rate", { owner: ownerId, tier: t }).catch(() => {});
    // Earned cosmetic: the "Kindred Spirit" border for a generous rater at 10 distinct farms rated (the row
    // was inserted just above, so this count includes it). Idempotent grant into mkt_cosmetic_unlock.
    const given = await db.queryOne(`SELECT COUNT(*)::int AS n FROM mkt_farm_rating WHERE rater_id = $1`, [raterId]).catch(() => null);
    if ((given?.n || 0) >= 10) await db.query(`INSERT INTO mkt_cosmetic_unlock (buyer_id, category, ref) VALUES ($1, 'border', 'kindred') ON CONFLICT DO NOTHING`, [raterId]).catch(() => {});
    await bumpQuestProgress(raterId, "farm_rate", 1).catch(() => {}); // credit the "rate a friend's farm" quest (new ratings only)
    await syncEarnedBadges(ownerId).catch(() => {}); // Well-Liked / Adored — the OWNER just received a rating

    const [summary, charge] = await Promise.all([ratingSummary(ownerId, raterId), rateCharge(raterId)]);
    return { ok: true, changed: true, isNew: true, myTier: t, xpGained: meta.raterXp, seedFound, ...summary, charge };
}

// "N people rated your farm" welcome-back recap. Returns every unseen (new or revised) rating on your farm, plus
// the all-time totals. Fetching it marks those rows seen so it pops once — same contract as the pet-visit recap.
export async function getUnseenFarmRatings(ownerId) {
    if (!ownerId) return { raters: [], newCount: 0, byTier: { 1: 0, 2: 0, 3: 0 }, total: 0 };
    const rows = await db
        .query(
            `SELECT rater_id, tier, updated_at FROM mkt_farm_rating
              WHERE owner_id = $1 AND owner_seen_at IS NULL ORDER BY updated_at DESC`,
            [ownerId]
        )
        .catch(() => []);
    if (!rows.length) return { raters: [], newCount: 0, byTier: { 1: 0, 2: 0, 3: 0 }, total: 0 };
    const ids = [...new Set(rows.map((r) => r.rater_id))];
    const buyers = await db
        .query(`SELECT id, display_name, alias, COALESCE(xp,0) AS xp, avatar_sprite_url, avatar_sprite_flip, equipped_border FROM mkt_buyer WHERE id = ANY($1)`, [ids])
        .catch(() => []);
    const byId = new Map((buyers || []).map((b) => [b.id, b]));
    const raters = rows.map((r) => {
        const b = byId.get(r.rater_id) || {};
        const meta = RATE_TIERS[r.tier] || RATE_TIERS[1];
        return {
            name: b.display_name || b.alias || "A visitor",
            alias: b.alias || null,
            level: levelForXp(b.xp || 0).level,
            avatarUrl: b.avatar_sprite_url || null,
            avatarFlip: b.avatar_sprite_url ? b.avatar_sprite_flip === true : false,
            border: b.equipped_border && b.equipped_border !== "none" ? b.equipped_border : null,
            tier: r.tier, tierKey: meta.key, tierLabel: meta.label, tierIcon: meta.icon, tierColor: meta.color,
        };
    });
    const summary = await ratingSummary(ownerId, null);
    await db.query(`UPDATE mkt_farm_rating SET owner_seen_at = NOW() WHERE owner_id = $1 AND owner_seen_at IS NULL`, [ownerId]).catch(() => {});
    return { raters, newCount: rows.length, byTier: summary.byTier, total: summary.total };
}
