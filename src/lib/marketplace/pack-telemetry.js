import "server-only";

import { db } from "@/lib/db";
import { packPrice } from "@/lib/marketplace/packs.js";
import { PACK_TIERS, tierForCents } from "@/lib/marketplace/pack-rarity.js";
import { poolByKey } from "@/lib/marketplace/pack-pools.js";

// ── WHAT THE PACKS ARE DOING ─────────────────────────────────────────────────────────────────────────────────
// Design doc §8. One read, because this is a screen somebody opens to check a number, not a dashboard anybody
// leaves running.
//
// ⚠️ PREVIEW OPENS ARE EXCLUDED FROM ENGAGEMENT AND INCLUDED IN THE BOOKS, and those really are different
// questions. The owner plays the floor to test it — there is precedent for this in casino-report.js, where one
// owner with a test panel outweighs the whole membership. But the bag genuinely left the shelf and the credit
// genuinely moved, so the money is real. Conflating the two would either hide real money or pollute real
// averages, and the `preview` flag on the row is what keeps them apart.

const money = (v) => Math.round(Number(v) || 0);

export async function getPackTelemetry({ days = 30 } = {}) {
    const [price, headline, byDay, tierSplit, members, pool, tasks, vault, basis, byPool, modelled,
        creditTotals, creditRecent] = await Promise.all([
        packPrice(),

        // Money. Revenue and tax are stamped per open; COGS carries the basis it was resolved on.
        db.queryOne(
            `SELECT COUNT(*)::int AS opens,
                    COALESCE(SUM(price_cents), 0)::bigint AS credit_spent,
                    COALESCE(SUM(revenue_cents), 0)::bigint AS revenue,
                    COALESCE(SUM(tax_cents), 0)::bigint AS tax,
                    COALESCE(SUM(cogs_cents), 0)::bigint AS cogs,
                    COALESCE(SUM(card_value_cents), 0)::bigint AS pulled_value,
                    COUNT(*) FILTER (WHERE outcome = 'sold_back')::int AS sold_back,
                    COUNT(*) FILTER (WHERE outcome = 'vaulted')::int AS vaulted,
                    COUNT(*) FILTER (WHERE outcome = 'pending')::int AS pending
             FROM mkt_pack_open
             WHERE preview = FALSE AND created_at >= NOW() - ($1 || ' days')::interval`,
            [String(days)]
        ),

        db.query(
            `SELECT DATE_TRUNC('day', created_at AT TIME ZONE 'America/Chicago')::date AS day,
                    COUNT(*)::int AS opens,
                    COALESCE(SUM(revenue_cents), 0)::bigint AS revenue,
                    COALESCE(SUM(cogs_cents), 0)::bigint AS cogs
             FROM mkt_pack_open
             WHERE preview = FALSE AND created_at >= NOW() - ($1 || ' days')::interval
             GROUP BY 1 ORDER BY 1 DESC LIMIT 30`,
            [String(days)]
        ),

        db.query(
            `SELECT tier, COUNT(*)::int AS n, COALESCE(SUM(card_value_cents), 0)::bigint AS value
             FROM mkt_pack_open
             WHERE preview = FALSE AND created_at >= NOW() - ($1 || ' days')::interval
             GROUP BY 1`,
            [String(days)]
        ),

        // ⚠️ NET POSITION IS THE ABUSE-DETECTION NUMBER. Alt farming has happened here before. A member who is
        //    consistently net-positive across many opens is either very lucky or telling us the pool is
        //    mispriced, and either answer is worth knowing early.
        db.query(
            `SELECT o.buyer_id,
                    b.display_name,
                    COUNT(*)::int AS opens,
                    COALESCE(SUM(o.price_cents), 0)::bigint AS spent,
                    COALESCE(SUM(o.card_value_cents), 0)::bigint AS pulled,
                    COALESCE(SUM(o.card_value_cents) - SUM(o.price_cents), 0)::bigint AS net,
                    COUNT(*) FILTER (WHERE o.outcome = 'sold_back')::int AS sold_back
             FROM mkt_pack_open o
             JOIN mkt_buyer b ON b.id = o.buyer_id
             WHERE o.preview = FALSE AND o.created_at >= NOW() - ($1 || ' days')::interval
             GROUP BY o.buyer_id, b.display_name
             ORDER BY net DESC
             LIMIT 50`,
            [String(days)]
        ),

        db.query(
            `SELECT market_value, cost_cents, cost_basis FROM mystery_bag_cards WHERE status = 'active'`
        ),

        db.queryOne(
            `SELECT COUNT(*) FILTER (WHERE status = 'open')::int AS open_tasks,
                    COUNT(*) FILTER (WHERE status = 'open' AND promoted)::int AS promoted,
                    COUNT(*) FILTER (WHERE status = 'open' AND kind = 'refile')::int AS refile,
                    MIN(created_at) FILTER (WHERE status = 'open') AS oldest
             FROM mkt_pack_pull_task`
        ),

        // The vault is a LIABILITY: cards members own that are sitting in our building.
        db.queryOne(
            `SELECT COUNT(*) FILTER (WHERE status = 'held')::int AS held,
                    COALESCE(SUM(current_value_cents) FILTER (WHERE status = 'held'), 0)::bigint AS held_value,
                    COUNT(*) FILTER (WHERE status = 'on_order')::int AS on_order
             FROM mkt_vault_card`
        ),

        db.query(
            `SELECT COALESCE(cogs_basis, 'unknown') AS basis, COUNT(*)::int AS n
             FROM mkt_pack_open
             WHERE preview = FALSE AND created_at >= NOW() - ($1 || ' days')::interval
             GROUP BY 1 ORDER BY 2 DESC`,
            [String(days)]
        ),
        // ── ⚠️ MONEY, SPLIT BY POOL, BECAUSE AVERAGING THEM IS A LIE ───────────────────────────────────
        // Every figure above is `FROM mkt_pack_open` with no pool filter, which was exactly right while
        // there was one pool. A $15 Pokémon pack and a $20 bag have different prices, different costs and
        // different margins, and one blended margin across both is a number that describes neither — it
        // moves when the MIX moves, so a good week of bag sales reads as the category packs improving.
        //
        // migration 486 added (pool, created_at) for this and nothing used it until now.
        db.query(
            `SELECT pool,
                    COUNT(*)::int AS opens,
                    COALESCE(SUM(price_cents), 0)::bigint AS credit_spent,
                    COALESCE(SUM(revenue_cents), 0)::bigint AS revenue,
                    COALESCE(SUM(cogs_cents), 0)::bigint AS cogs,
                    COALESCE(SUM(card_value_cents), 0)::bigint AS pulled_value,
                    COUNT(*) FILTER (WHERE outcome = 'sold_back')::int AS sold_back,
                    COUNT(*) FILTER (WHERE outcome = 'vaulted')::int AS vaulted,
                    -- ⚠️ WHAT WE ACTUALLY PAID OUT, not what the card was worth. At 100% sell-back these
                    --    are nearly the same figure, but not identical: the quarter round-up and the $1
                    --    floor in buyback.js both run in the member's favour, and on a $0.75 margin that
                    --    difference is a material slice of the whole business.
                    COALESCE(SUM(buy_back_cents) FILTER (WHERE outcome = 'sold_back'), 0)::bigint AS paid_out
             FROM mkt_pack_open
             WHERE preview = FALSE AND created_at >= NOW() - ($1 || ' days')::interval
             GROUP BY pool
             ORDER BY opens DESC`,
            [String(days)]
        ),
        // ── ⚠️ WHAT WE *MODELLED*, SO THE SCREEN CAN COMPARE IT TO WHAT HAPPENED ────────────────────────
        // At 100% sell-back the entire business is one inequality: price > EV. The margin is no longer
        // something that merely gets reported — it is the only thing standing between this feature and a
        // loss, and it is a PREDICTION made by recomputePools solving an alpha. A screen that shows the
        // realised number without the modelled one cannot answer the only question worth asking, which is
        // whether the model is holding.
        db.query(
            `SELECT pool, price_cents, ev_cents, uniform_ev_cents, alpha,
                    first_open_floor_cents, units, open, closed_reason, computed_at
               FROM mkt_pack_pool_state`,
            []
        ),
        // ── ⚠️ CARDS BOUGHT OUTRIGHT WITH STORE CREDIT ──────────────────────────────────────────────────
        // These never create a Square order, so NOTHING in the normal sales reporting can see them — the
        // business report's scope is Square + Plaid + cash by design. A card leaves the building and the
        // member is charged; without this they are invisible everywhere.
        //
        // ⚠️ AND THEY ARE REPORTED SEPARATELY FROM PACK OPENS, never summed into them. A pack open is a
        // gamble with a modelled margin; a direct buy is a straight sale at the shelf price. One blended
        // "online margin" across both is a number that describes neither and moves when the MIX moves.
        db.queryOne(
            `SELECT COUNT(*)::int AS sales,
                    COALESCE(SUM(price_cents), 0)::bigint AS revenue,
                    COALESCE(SUM(cogs_cents), 0)::bigint AS cogs,
                    COUNT(*) FILTER (WHERE cogs_basis = 'captured')::int AS real_cost
               FROM mkt_credit_sale
              WHERE created_at >= NOW() - ($1 || ' days')::interval`,
            [String(days)]
        ),
        db.query(
            `SELECT item_name, price_cents, cogs_cents, cogs_basis, created_at
               FROM mkt_credit_sale
              WHERE created_at >= NOW() - ($1 || ' days')::interval
              ORDER BY created_at DESC
              LIMIT 20`,
            [String(days)]
        ),
    ]);

    // ── The pool guardrail ──────────────────────────────────────────────────────────────────────────────────
    // EV vs price, with the composition behind it. Luke sets the EV when he builds the bags; this only has to
    // SHOW it, so it is a number to check rather than a lever to pull. It still goes red when EV >= price,
    // because a pool in that state loses money on every pack sold.
    const poolValue = pool.reduce((sum, r) => sum + money(Number(r.market_value) * 100), 0);
    const evCents = pool.length ? Math.round(poolValue / pool.length) : 0;
    const poolTiers = {};
    let costed = 0;
    for (const row of pool) {
        const key = tierForCents(money(Number(row.market_value) * 100)).key;
        poolTiers[key] = (poolTiers[key] || 0) + 1;
        // ⚠️ ANY estimate_* BASIS IS NOT A REAL COST. This read `!== "estimate_65"` and would have counted
        //    the new shelf estimate as a captured figure the moment one existed — a guess promoted to a fact
        //    by a string comparison that was exhaustive when it was written and stopped being so.
        if (row.cost_cents !== null && row.cost_basis && !String(row.cost_basis).startsWith("estimate_")) costed += 1;
    }

    const revenue = Number(headline?.revenue || 0);
    const cogs = Number(headline?.cogs || 0);

    return {
        days,
        priceCents: price.cents,
        priceTrusted: price.source !== "fallback_default",

        // ⚠️ THE BLENDED HEADLINE IS KEPT AS WELL AS SPLIT, NOT REPLACED BY IT. "What did this feature take
        // this week" is a real question with one answer; "is the Pokémon pack priced right" is a different
        // one, and conflating them is what this split exists to stop.
        // ── ⚠️ MODELLED VS REALISED, WHICH IS THE ONLY QUESTION AT 100% SELL-BACK ──────────────────────
        // While sell-back paid 60% the pack had two margins and the reported one was a summary. At 100%
        // there is one — price minus EV — and it is a PREDICTION, made nightly by recomputePools solving
        // an alpha per tier. Reporting what happened without what was predicted cannot answer whether the
        // model is holding, which is the thing that decides if this feature makes money at all.
        //
        // ⚠️ AND A SMALL SAMPLE IS NOT A VERDICT. The payout distribution is heavy-tailed: one $279 card
        // erases fifty good pulls, and the house measured a 17.7% chance of being DOWN after a hundred
        // Pokémon opens while still being correctly priced. So the trustworthy flag gates the comparison rather
        // than letting a red number three opens in read as a broken model.
        byPool: byPool.map((r) => {
            const rev = Number(r.revenue || 0);
            const cost = Number(r.cogs || 0);
            const opens = r.opens || 0;
            const m = (modelled || []).find((x) => x.pool === r.pool) || null;
            const paidOut = Number(r.paid_out || 0);
            const creditIn = Number(r.credit_spent || 0);
            // Realised margin on the SELL-BACK path specifically: credit taken in against credit handed
            // back. A keep is a different kind of event (we gave up a card, not credit) and blending the
            // two is how a good week of keeps hides a sell-back pool that is underwater.
            const soldBack = r.sold_back || 0;
            const soldCredit = soldBack > 0 && opens > 0 ? Math.round((creditIn / opens) * soldBack) : 0;
            const modelledMarginCents = m ? Number(m.price_cents) - Number(m.ev_cents) : null;
            return {
                pool: r.pool,
                brand: poolByKey(r.pool)?.brand || r.pool,
                opens,
                creditSpentCents: creditIn,
                revenueCents: rev,
                cogsCents: cost,
                marginCents: rev - cost,
                marginPercent: rev > 0 ? Math.round(((rev - cost) / rev) * 1000) / 10 : null,
                pulledValueCents: Number(r.pulled_value || 0),
                soldBack,
                vaulted: r.vaulted || 0,

                // The model.
                priceCents: m ? Number(m.price_cents) : null,
                modelledEvCents: m ? Number(m.ev_cents) : null,
                uniformEvCents: m ? Number(m.uniform_ev_cents) : null,
                alpha: m ? Number(m.alpha) : null,
                modelledMarginCents,
                modelledMarginPercent: m && Number(m.price_cents) > 0
                    ? Math.round((modelledMarginCents / Number(m.price_cents)) * 1000) / 10
                    : null,

                // What actually happened on the sell-back path.
                paidOutCents: paidOut,
                sellBackMarginCents: soldBack > 0 ? soldCredit - paidOut : null,
                sellBackMarginPerOpenCents: soldBack > 0 ? Math.round((soldCredit - paidOut) / soldBack) : null,
                // ⚠️ 30 opens is not a real confidence interval, it is a line in the sand that stops a
                //    three-open sample being read as a trend. Treat it as "worth looking at", not "proven".
                trustworthy: soldBack >= 30,
            };
        }),

        // ⚠️ A 'sold_back' ROW WITH NO RECORDED PAYOUT IS A BOOKKEEPING HOLE, AND IT IS SURFACED RATHER
        // THAN PATCHED OVER. It means the stamp after the guarded outcome update did not land (see
        // choosePackOutcome). The number is missing, not zero, and the screen should say so.
        missingPayouts: byPool.reduce((n, r) => n + Math.max(0, (r.sold_back || 0)
            - (Number(r.paid_out) > 0 ? (r.sold_back || 0) : 0)), 0),

        headline: {
            opens: headline?.opens || 0,
            creditSpentCents: Number(headline?.credit_spent || 0),
            revenueCents: revenue,
            taxCents: Number(headline?.tax || 0),
            cogsCents: cogs,
            marginCents: revenue - cogs,
            marginPercent: revenue > 0 ? Math.round(((revenue - cogs) / revenue) * 1000) / 10 : null,
            pulledValueCents: Number(headline?.pulled_value || 0),
            soldBack: headline?.sold_back || 0,
            vaulted: headline?.vaulted || 0,
            pending: headline?.pending || 0,
            sellBackRate: headline?.opens
                ? Math.round((headline.sold_back / headline.opens) * 1000) / 10
                : null,
        },

        guardrail: {
            evCents,
            priceCents: price.cents,
            // The one that matters: at or above 100%, every pack sold loses money.
            evPercentOfPrice: price.cents ? Math.round((evCents / price.cents) * 1000) / 10 : null,
            losing: price.cents > 0 && evCents >= price.cents,
            remaining: pool.length,
            poolValueCents: poolValue,
            tiers: PACK_TIERS.map((t) => ({ key: t.key, label: t.label, glow: t.glow, n: poolTiers[t.key] || 0 })),
            // ⚠️ Measured 2026-10-26: only 37% of the pool had a known cost. A margin built mostly on the 65%
            //    estimate is a guess wearing a number's clothes, so the screen says what share is real.
            costedCount: costed,
            costedPercent: pool.length ? Math.round((costed / pool.length) * 1000) / 10 : null,
        },

        tierSplit: PACK_TIERS.map((t) => {
            const row = tierSplit.find((r) => r.tier === t.key);
            return {
                key: t.key,
                label: t.label,
                glow: t.glow,
                n: row?.n || 0,
                valueCents: Number(row?.value || 0),
                share: headline?.opens ? Math.round(((row?.n || 0) / headline.opens) * 1000) / 10 : 0,
            };
        }),

        byDay: byDay.map((d) => ({
            day: d.day,
            opens: d.opens,
            revenueCents: Number(d.revenue || 0),
            cogsCents: Number(d.cogs || 0),
        })),

        members: members.map((m) => ({
            buyerId: m.buyer_id,
            name: m.display_name || "—",
            opens: m.opens,
            spentCents: Number(m.spent || 0),
            pulledCents: Number(m.pulled || 0),
            netCents: Number(m.net || 0),
            soldBack: m.sold_back,
        })),

        cogsBasis: basis.map((b) => ({ basis: b.basis, n: b.n })),

        // Cards bought outright with store credit (Discover's Buy-with-credit). Separate line, never
        // folded into the pack figures — see the note on the query.
        creditSales: {
            sales: creditTotals?.sales || 0,
            revenueCents: Number(creditTotals?.revenue || 0),
            cogsCents: Number(creditTotals?.cogs || 0),
            marginCents: Number(creditTotals?.revenue || 0) - Number(creditTotals?.cogs || 0),
            marginPercent: Number(creditTotals?.revenue || 0) > 0
                ? Math.round(((Number(creditTotals.revenue) - Number(creditTotals.cogs)) / Number(creditTotals.revenue)) * 1000) / 10
                : null,
            // ⚠️ HOW MUCH OF THAT MARGIN IS REAL. cogs_basis 'captured' means we had a recorded cost;
            //    anything else was estimated at 46% of shelf. A margin built on a mix is only as good as
            //    the mix, and a screen that hides the mix quotes a confident number that is partly invented.
            realCostCount: creditTotals?.real_cost || 0,
            recent: (creditRecent || []).map((r) => ({
                name: r.item_name,
                priceCents: Number(r.price_cents || 0),
                cogsCents: Number(r.cogs_cents || 0),
                estimated: r.cogs_basis !== "captured",
                at: r.created_at,
            })),
        },

        queue: {
            open: tasks?.open_tasks || 0,
            promoted: tasks?.promoted || 0,
            refile: tasks?.refile || 0,
            oldest: tasks?.oldest || null,
        },

        vault: {
            heldCount: vault?.held || 0,
            heldValueCents: Number(vault?.held_value || 0),
            onOrder: vault?.on_order || 0,
        },
    };
}

/** The staff pull queue — admin AND employee, because the employee is the one who can walk to the tub. */
export async function getPullQueue({ limit = 60 } = {}) {
    const rows = await db.query(
        `SELECT t.id, t.bag_sku, t.kind, t.promoted, t.created_at, t.note,
                c.card_name, c.market_value,
                b.display_name AS member
         FROM mkt_pack_pull_task t
         JOIN mystery_bag_cards c ON c.id = t.mystery_card_id
         JOIN mkt_pack_open o ON o.id = t.pack_open_id
         JOIN mkt_buyer b ON b.id = o.buyer_id
         WHERE t.status = 'open'
         ORDER BY t.promoted DESC, t.created_at ASC
         LIMIT $1`,
        [limit]
    );
    return rows.map((r) => ({
        id: r.id,
        bagSku: r.bag_sku,
        kind: r.kind,
        promoted: r.promoted,
        cardName: r.card_name,
        valueCents: money(Number(r.market_value) * 100),
        member: r.member || "—",
        note: r.note || null,
        createdAt: r.created_at,
    }));
}

/**
 * Close a pull task.
 *
 * `notFound` is the "can't find the bag" action from §1.3 — it refunds the member in full, no questions, and
 * is the ONLY detector that the tub has drifted from the table. The refund itself is the caller's job; this
 * records the outcome.
 */
export async function closePullTask({ taskId, by, notFound = false, note = null }) {
    return db.queryOne(
        `UPDATE mkt_pack_pull_task
         SET status = $2, done_at = NOW(), done_by = $3, note = COALESCE($4, note)
         WHERE id = $1 AND status = 'open'
         RETURNING id, mystery_card_id, pack_open_id, status`,
        [taskId, notFound ? "not_found" : "done", by || "staff", note]
    );
}
