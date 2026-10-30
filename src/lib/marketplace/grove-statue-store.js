import "server-only";

import { db } from "@/lib/db";
import {
    STATUE_STAT_IDS, STATUE_RARITIES, rarityMeta, statueLevel, statueBonus, lineColour, vendorTier,
} from "@/lib/marketplace/grove-statues.js";

/**
 * ── THE STATUE SHELF ─────────────────────────────────────────────────────────────────────────────────────────
 * Holding, pouring in, and reading back. The arithmetic lives in grove-statues.js (pure, so the panel can do
 * the same sums); this is only the part that talks to the database.
 */

/** Drops from one settle, folded into what they are already holding. */
export async function grantStatues(buyerId, statues = []) {
    if (!buyerId || !statues.length) return 0;
    let n = 0;
    for (const st of statues) {
        if (!STATUE_STAT_IDS.includes(st?.stat)) continue;
        if (!STATUE_RARITIES.some((r) => r.id === st?.rarity)) continue;
        await db.query(
            `INSERT INTO mkt_grove_statue (buyer_id, stat, rarity, qty) VALUES ($1, $2, $3, 1)
             ON CONFLICT (buyer_id, stat, rarity) DO UPDATE SET qty = mkt_grove_statue.qty + 1`,
            [buyerId, st.stat, st.rarity]
        ).catch(() => {});
        n += 1;
    }
    return n;
}

/** Everything the statue panel draws: what is held, and where each line stands. */
export async function statueState(buyerId, deepestMap = 0) {
    if (!buyerId) return null;
    const tier = vendorTier(deepestMap);
    const [held, lines] = await Promise.all([
        db.query(`SELECT stat, rarity, qty FROM mkt_grove_statue WHERE buyer_id = $1 AND qty > 0`, [buyerId]).catch(() => []),
        db.query(`SELECT stat, points, first_crystal_at, first_prismatic_at FROM mkt_grove_statue_line WHERE buyer_id = $1`, [buyerId]).catch(() => []),
    ]);

    const byStat = new Map();
    for (const l of lines || []) byStat.set(l.stat, l);

    return {
        tier,
        lines: STATUE_STAT_IDS.map((stat) => {
            const l = byStat.get(stat) || {};
            const crystalSeen = Boolean(l.first_crystal_at);
            const prismaticSeen = Boolean(l.first_prismatic_at);
            const points = Number(l.points) || 0;
            return {
                stat,
                points,
                ...statueLevel(points),
                crystalSeen,
                prismaticSeen,
                colour: lineColour({ crystalSeen, prismaticSeen }),
                bonus: statueBonus({ points, crystalSeen, prismaticSeen }),
                held: Object.fromEntries(
                    (held || []).filter((h) => h.stat === stat).map((h) => [h.rarity, Number(h.qty) || 0])
                ),
            };
        }),
    };
}

/**
 * Pour one statue into its line.
 *
 * ⚠️ ONE AT A TIME, ON PURPOSE. Luke: "you can turn them in by clicking the associated statue. It fills a
 * bar." The doubling moment — the first crystal, the first prismatic — is the whole reward of this system, and
 * a "turn in all" that silently crossed it would spend the best moment in the feature on a progress toast.
 *
 * ⚠️ THE DECREMENT IS THE LOCK. A conditional UPDATE that requires qty > 0 and returns the row is the only
 * thing standing between a double-tap and a free statue, because this driver has no transactions
 * (see postgres-landmines). If it returns nothing, the player did not have one and nothing else runs.
 */
export async function turnInStatue(buyerId, stat, rarity) {
    if (!buyerId || !STATUE_STAT_IDS.includes(stat)) return { ok: false, error: "bad_stat" };
    const meta = STATUE_RARITIES.find((r) => r.id === rarity);
    if (!meta) return { ok: false, error: "bad_rarity" };

    const spent = await db.queryOne(
        `UPDATE mkt_grove_statue SET qty = qty - 1
          WHERE buyer_id = $1 AND stat = $2 AND rarity = $3 AND qty > 0
          RETURNING qty`,
        [buyerId, stat, rarity]
    ).catch(() => null);
    if (!spent) return { ok: false, error: "none_held" };

    const before = await db.queryOne(
        `SELECT points, first_crystal_at, first_prismatic_at FROM mkt_grove_statue_line
          WHERE buyer_id = $1 AND stat = $2`,
        [buyerId, stat]
    ).catch(() => null);

    const hadCrystal = Boolean(before?.first_crystal_at);
    const hadPrismatic = Boolean(before?.first_prismatic_at);
    // The two moments worth announcing. Computed BEFORE the write so the write can be idempotent-ish and the
    // caller still knows which one just happened.
    const firstCrystal = rarity === "crystal" && !hadCrystal;
    const firstPrismatic = rarity === "prismatic" && !hadPrismatic;

    const row = await db.queryOne(
        `INSERT INTO mkt_grove_statue_line (buyer_id, stat, points, first_crystal_at, first_prismatic_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (buyer_id, stat) DO UPDATE SET
            points = mkt_grove_statue_line.points + $3,
            -- COALESCE keeps the FIRST one. A later crystal must not move the date and must not re-double.
            first_crystal_at = COALESCE(mkt_grove_statue_line.first_crystal_at, EXCLUDED.first_crystal_at),
            first_prismatic_at = COALESCE(mkt_grove_statue_line.first_prismatic_at, EXCLUDED.first_prismatic_at),
            updated_at = NOW()
         RETURNING points, first_crystal_at, first_prismatic_at`,
        [buyerId, stat, meta.worth, firstCrystal ? new Date() : null, firstPrismatic ? new Date() : null]
    ).catch(() => null);
    if (!row) return { ok: false, error: "write_failed" };

    const crystalSeen = Boolean(row.first_crystal_at);
    const prismaticSeen = Boolean(row.first_prismatic_at);
    const points = Number(row.points) || 0;
    const wasLevel = statueLevel(Number(before?.points) || 0).level;
    const now = statueLevel(points);

    return {
        ok: true,
        stat,
        rarity,
        worth: meta.worth,
        points,
        ...now,
        levelledUp: now.level > wasLevel,
        firstCrystal,
        firstPrismatic,
        crystalSeen,
        prismaticSeen,
        colour: lineColour({ crystalSeen, prismaticSeen }),
        bonus: statueBonus({ points, crystalSeen, prismaticSeen }),
    };
}

/**
 * What the statues are worth in a fight, for the kit.
 *
 * ⚠️ READ FROM THE LINE, NEVER FROM WHAT IS HELD. An unspent statue does nothing — that is the entire point
 * of a turn-in — and a version of this that counted the shelf would pay people for hoarding.
 */
export async function statueStats(buyerId) {
    if (!buyerId) return {};
    const rows = await db.query(
        `SELECT stat, points, first_crystal_at, first_prismatic_at FROM mkt_grove_statue_line WHERE buyer_id = $1`,
        [buyerId]
    ).catch(() => []);
    const out = {};
    for (const r of rows || []) {
        if (!STATUE_STAT_IDS.includes(r.stat)) continue;
        const v = statueBonus({
            points: Number(r.points) || 0,
            crystalSeen: Boolean(r.first_crystal_at),
            prismaticSeen: Boolean(r.first_prismatic_at),
        });
        if (v) out[r.stat] = (out[r.stat] || 0) + v;
    }
    return out;
}
