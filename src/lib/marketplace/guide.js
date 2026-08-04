import "server-only";

import { db } from "@/lib/db";
import { logCoin } from "@/lib/marketplace/coins.js";
import { addChests } from "@/lib/marketplace/chests.js";
import { levelForXp } from "@/lib/marketplace/xp.js";
import { GUIDE_CHAPTERS, DONE_CHAPTER, DONE_STEP, SEEDED, chapterById } from "@/lib/marketplace/guide-chapters.js";

// ── THE PATHFINDER: PROGRESS ─────────────────────────────────────────────────────────────────────────────────
// Steps are VERIFIED, never claimed. One pass over the member's distinct activity events plus three small
// existence checks answers every step in the book — not one query per step, which would be thirty round trips
// on a page load.
//
// SEEDING, and why it matters. Every step is derived from activity a member may have generated months ago, so
// the first time an existing member opens the guide, most of it is already true. Paying all of that out at once
// would hand a veteran several thousand gold for work they were already paid for when they did it. The first
// read therefore SEEDS: everything already true is marked done silently, chapters already finished are marked
// as claimed, and a `g:seeded` marker goes in. From then on the guide pays normally. A veteran opens it to an
// honest picture of what they know and no windfall; a new member is paid for every step as they take it.

const parseDone = (raw) => { try { const p = typeof raw === "string" ? JSON.parse(raw) : (raw || []); return Array.isArray(p) ? p : []; } catch { return []; } };

// Which steps are TRUE right now, from what the member has actually done.
async function trueSteps(buyerId, steps) {
    if (!steps.length) return new Set();
    const wanted = [...new Set(steps.flatMap((s) => s.events || []))];
    const needs = (v) => steps.some((s) => s.verify === v);
    const [events, avatar, wish, push, purchase] = await Promise.all([
        wanted.length
            ? db.query(`SELECT DISTINCT event FROM mkt_activity_event WHERE buyer_id = $1 AND event = ANY($2)`, [buyerId, wanted]).catch(() => [])
            : [],
        // avatar_updated_at, NOT avatar_config. A config row is written at signup — 83 of 84 members have one
        // and only 43 have ever touched it — so keying off it made "make the hero look like you" a step that
        // ticked itself before you had done anything. setAvatarConfig is what stamps avatar_updated_at.
        needs("avatar")
            ? db.queryOne(`SELECT 1 AS x FROM mkt_buyer WHERE id = $1 AND avatar_updated_at IS NOT NULL`, [buyerId]).catch(() => null)
            : null,
        needs("wishlist")
            ? db.queryOne(`SELECT 1 AS x FROM mkt_want WHERE buyer_id = $1 LIMIT 1`, [buyerId]).catch(() => null)
            : null,
        // A LIVE browser push subscription. This step used to be client-claimed — the only one in the book you
        // were trusted on — which meant 25 members who already had notifications on were asked to turn them on
        // forever, and the strip cheerfully told them they were "in the right place" on a page with no toggle.
        // The subscription is right there in mkt_web_push and can just be looked at.
        //
        // created_at is load-bearing: the VAPID keypair rotated on 2026-07-25 and every subscription older than
        // that is signed for the old key, so the push service 403s it. Four members are in exactly that state —
        // they believe notifications are on and nothing can reach them. Counting a dead subscription as done
        // would quietly bless that; this way the guide walks them back to re-enable it.
        needs("push")
            ? db.queryOne(`SELECT 1 AS x FROM mkt_web_push WHERE buyer_id = $1 AND created_at >= '2026-07-25' LIMIT 1`, [buyerId]).catch(() => null)
            : null,
        // purchase_spend / purchase_flat / first_purchase are how an in-store sale reaches a member's account.
        needs("purchase")
            ? db.queryOne(`SELECT 1 AS x FROM mkt_xp_event WHERE buyer_id = $1 AND action IN ('purchase_spend','purchase_flat','first_purchase') LIMIT 1`, [buyerId]).catch(() => null)
            : null,
    ]);
    const seen = new Set(events.map((r) => r.event));
    const out = new Set();
    for (const s of steps) {
        if (s.events?.some((e) => seen.has(e))) out.add(s.key);
        else if (s.verify === "avatar" && avatar) out.add(s.key);
        else if (s.verify === "wishlist" && wish) out.add(s.key);
        else if (s.verify === "push" && push) out.add(s.key);
        else if (s.verify === "purchase" && purchase) out.add(s.key);
    }
    return out;
}

const saveDone = (buyerId, done) =>
    db.query(`UPDATE mkt_buyer SET onboarding_done = $2::jsonb WHERE id = $1`, [buyerId, JSON.stringify([...done])]).catch(() => {});

export async function getGuide(buyerId) {
    if (!buyerId) return { signedIn: false, chapters: [] };
    const row = await db.queryOne(`SELECT COALESCE(xp,0) AS xp, onboarding_done FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const level = levelForXp(Number(row?.xp) || 0).level;
    const done = new Set(parseDone(row?.onboarding_done));
    const seeded = done.has(SEEDED);

    // Only steps that aren't already recorded need checking — a finished guide costs one cheap query.
    const pending = GUIDE_CHAPTERS.flatMap((c) => c.steps).filter((s) => s.claim !== "client" && !done.has(DONE_STEP(s.key)));
    const nowTrue = await trueSteps(buyerId, pending);

    let paid = 0;
    if (nowTrue.size) {
        const fresh = [...nowTrue].map(DONE_STEP);
        if (!seeded) {
            // FIRST READ — record, don't pay. See the note at the top of the file.
            for (const k of fresh) done.add(k);
            done.add(SEEDED);
            // A chapter already finished at seed time has had its reward "claimed" by history, not by a tap.
            for (const c of GUIDE_CHAPTERS) {
                if (c.steps.every((s) => done.has(DONE_STEP(s.key)))) done.add(DONE_CHAPTER(c.id));
            }
            await saveDone(buyerId, done);
        } else {
            const gold = pending.filter((s) => nowTrue.has(s.key)).reduce((n, s) => n + (s.gold || 0), 0);
            for (const k of fresh) done.add(k);
            // Conditional on the keys still being absent, so two concurrent reads can't both pay for the same step.
            const res = await db.queryOne(
                `UPDATE mkt_buyer SET onboarding_done = $2::jsonb, gold = gold + $3
                  WHERE id = $1 AND NOT (onboarding_done @> $4::jsonb) RETURNING gold`,
                [buyerId, JSON.stringify([...done]), gold, JSON.stringify(fresh)]
            ).catch(() => null);
            if (res && gold > 0) {
                paid = gold;
                await logCoin(buyerId, gold, "guide_step", { balanceAfter: res.gold, meta: { steps: [...nowTrue] } }).catch(() => {});
            }
        }
    } else if (!seeded) {
        // Nothing was true, but the marker still has to go down or a brand-new member's first real step would
        // be treated as seeding and pay nothing.
        done.add(SEEDED);
        await saveDone(buyerId, done);
    }

    const chapters = GUIDE_CHAPTERS.map((c) => {
        const locked = level < c.minLevel;
        const steps = c.steps.map((s) => ({
            key: s.key, label: s.label, why: s.why, href: s.href, cta: s.cta, gold: s.gold,
            manual: s.claim === "client",
            done: done.has(DONE_STEP(s.key)),
        }));
        const complete = steps.every((s) => s.done);
        return {
            id: c.id, name: c.name, blurb: c.blurb, tint: c.tint, icon: c.icon, minLevel: c.minLevel,
            locked, steps, complete,
            doneCount: steps.filter((s) => s.done).length,
            reward: c.reward,
            rewardClaimed: done.has(DONE_CHAPTER(c.id)),
        };
    });

    // WHERE YOU ARE. The first unlocked chapter with something left in it, and the first thing left in that
    // chapter. This one pair is the entire anti-overwhelm design: the screen leads with it, the play page shows
    // it, and everything else is collapsed behind it.
    const current = chapters.find((c) => !c.locked && !c.complete) || null;
    const step = current ? current.steps.find((s) => !s.done) || null : null;
    const unlocked = chapters.filter((c) => !c.locked);
    const nextLocked = chapters.find((c) => c.locked) || null;

    return {
        signedIn: true, level, chapters, paid,
        current: current ? { chapter: current.id, name: current.name, tint: current.tint, icon: current.icon, index: chapters.indexOf(current) + 1, step, stepIndex: current.steps.findIndex((s) => !s.done) + 1, stepCount: current.steps.length } : null,
        nextLocked: nextLocked ? { name: nextLocked.name, minLevel: nextLocked.minLevel } : null,
        totals: {
            steps: chapters.flatMap((c) => c.steps).length,
            doneSteps: chapters.flatMap((c) => c.steps).filter((s) => s.done).length,
            chapters: chapters.length,
            doneChapters: chapters.filter((c) => c.complete).length,
        },
        // "Done" means done with what's OPEN to you. There is always another chapter above your level, which is
        // the point — the guide is never finished with you, it just runs out of things you're ready for.
        allOpenDone: unlocked.every((c) => c.complete),
    };
}

// A step the server cannot observe — browser permissions, and nothing else. Everything with an `events` or
// `verify` is deliberately not claimable here, or a member could POST their way through the book.
export async function claimGuideStep(buyerId, key) {
    const step = GUIDE_CHAPTERS.flatMap((c) => c.steps).find((s) => s.key === key);
    if (!buyerId || !step) return { ok: false, error: "bad_step" };
    if (step.claim !== "client") return { ok: false, error: "not_claimable", ...(await getGuide(buyerId)) };
    const row = await db.queryOne(`SELECT onboarding_done FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const done = new Set(parseDone(row?.onboarding_done));
    if (done.has(DONE_STEP(key))) return { ok: false, error: "claimed", ...(await getGuide(buyerId)) };
    done.add(DONE_STEP(key));
    const paid = await db.queryOne(
        `UPDATE mkt_buyer SET onboarding_done = $2::jsonb, gold = gold + $3 WHERE id = $1 RETURNING gold`,
        [buyerId, JSON.stringify([...done]), step.gold]
    ).catch(() => null);
    if (!paid) return { ok: false, error: "db" };
    await logCoin(buyerId, step.gold, "guide_step", { balanceAfter: paid.gold, meta: { key } }).catch(() => {});
    return { ok: true, gold: step.gold, ...(await getGuide(buyerId)) };
}

// The chapter purse. Finishing a whole system is worth more than the sum of its steps, and it is the one thing
// in here you tap for — a reward you have to collect is a reward you notice.
export async function claimGuideChapter(buyerId, id) {
    const ch = chapterById(id);
    if (!buyerId || !ch) return { ok: false, error: "bad_chapter" };
    const row = await db.queryOne(`SELECT onboarding_done FROM mkt_buyer WHERE id = $1`, [buyerId]).catch(() => null);
    const done = new Set(parseDone(row?.onboarding_done));
    if (done.has(DONE_CHAPTER(id))) return { ok: false, error: "claimed", ...(await getGuide(buyerId)) };
    if (!ch.steps.every((s) => done.has(DONE_STEP(s.key)))) return { ok: false, error: "not_ready", ...(await getGuide(buyerId)) };
    done.add(DONE_CHAPTER(id));
    // Guarded on the key still being absent so a double-tap cannot pay the purse twice.
    const paid = await db.queryOne(
        `UPDATE mkt_buyer SET onboarding_done = $2::jsonb, gold = gold + $3
          WHERE id = $1 AND NOT (onboarding_done @> $4::jsonb) RETURNING gold`,
        [buyerId, JSON.stringify([...done]), ch.reward.gold, JSON.stringify([DONE_CHAPTER(id)])]
    ).catch(() => null);
    if (!paid) return { ok: false, error: "claimed", ...(await getGuide(buyerId)) };
    await logCoin(buyerId, ch.reward.gold, "guide_chapter", { balanceAfter: paid.gold, meta: { chapter: id } }).catch(() => {});
    if (ch.reward.chest) await addChests(buyerId, { [ch.reward.chest]: 1 }, { source: "guide" }).catch(() => {});
    return { ok: true, gold: ch.reward.gold, chest: ch.reward.chest, ...(await getGuide(buyerId)) };
}
