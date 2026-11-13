import "server-only";

import { Resend } from "resend";

import { db } from "@/lib/db";
import { createServerLogger } from "@/lib/server-logger";

import { aiRank } from "./ai-match.js";
import { renderOutreachEmail } from "./email.js";
import { loadPool, pickFor, PICK_COUNT } from "./picks.js";
import { profilesFor } from "./profile.js";
import { unsubscribeToken } from "./unsubscribe.js";

const logger = createServerLogger({ source: "job", subsystem: "outreach" });

const FROM = "The Wolf Den <portal@wolfdengamingmn.com>";

/**
 * ⚠️ THE CAMPAIGN NAME IS NOT THE ONCE-EVER KEY. `mkt_outreach_send` carries a UNIQUE index on buyer_id
 * ALONE, so changing this string does not start a second wave at the same people — it collides and refuses.
 * That is deliberate. Luke, 2026-11-13: "we only want to bug them once." A genuine second campaign is a
 * decision somebody makes by dropping that index on purpose, not something a renamed constant does quietly.
 */
export const CAMPAIGN = "lapsed_v1";

/** Real money, not game activity. Somebody logging in daily without buying still counts as lapsed. */
export const LAPSED_DAYS = 14;

/**
 * Who is eligible, today.
 *
 * ⚠️ `purchase_spend` IS THE CLOCK AND `mkt_activity_event` IS NOT. Luke was explicit: "I only want to
 * trigger if they haven't made a store purchase in the last 2 weeks. If they haven't spent real money in the
 * last 2 weeks, that's when we want to bug them." Those are different populations — somebody can be in the
 * Grove every evening and not have been in the shop since October, and that person is exactly the target.
 */
export async function selectCohort({ limit = 500 } = {}) {
    return db.query(
        `WITH spend AS (
             SELECT buyer_id, MAX(created_at) AS last_bought, COUNT(*)::int AS orders
               FROM mkt_xp_event WHERE action = 'purchase_spend' GROUP BY buyer_id)
         SELECT b.id, b.email,
                -- ⚠️ ONLY first_name, DELIBERATELY. Coalescing display_name in greeted a member whose
                -- display name is "Ice Cream Collectibles" as "Hi Ice,". A shop that gets your name wrong
                -- in the first two words has already told you it does not really know you.
                NULLIF(b.first_name,'') AS name,
                spend.last_bought, spend.orders,
                EXTRACT(DAY FROM NOW() - spend.last_bought)::int AS days_since
           FROM spend
           JOIN mkt_buyer b ON b.id = spend.buyer_id
          WHERE spend.last_bought < NOW() - ($1 || ' days')::interval
            AND b.email IS NOT NULL AND b.email <> ''
            AND COALESCE((b.notify_prefs ->> 'email:announce')::boolean, TRUE) IS NOT FALSE
            AND b.email NOT LIKE '%.invalid'
            AND b.email NOT LIKE '%@example.%'
            AND b.email NOT ILIKE '%harness%'
            AND NOT EXISTS (SELECT 1 FROM mkt_outreach_send s WHERE s.buyer_id = b.id)
          ORDER BY spend.last_bought ASC
          LIMIT $2`,
        [String(LAPSED_DAYS), limit]
    ).catch(() => []);
}

/**
 * Build the email for every eligible member without sending anything.
 *
 * Skips anybody for whom the shelf has nothing to say — an email carrying one weak item is the kind that
 * gets reported, and a thin match is exactly when this should stay quiet.
 */
export async function buildCohort({ limit = 500 } = {}) {
    const members = await selectCohort({ limit });
    if (!members.length) return [];

    const [pool, profiles] = await Promise.all([
        loadPool(),
        profilesFor(members.map((m) => m.id)),
    ]);

    const base = process.env.NEXT_PUBLIC_BASE_URL || "https://wolfdengamingmn.com";
    // Spent down as the cohort is built, so no two members are promised the same physical card. Members are
    // ordered by how long they have been away, so the people who have been gone longest are offered from the
    // fullest shelf — which is the right way round if anybody is going to be offered a near miss.
    const claimed = new Map();
    const out = [];
    for (const member of members) {
        const profile = profiles.get(member.id);
        if (!profile) continue;
        // ⚠️ NO SIGNAL MEANS NO EMAIL, AND THAT IS THE WHOLE POINT OF ONCE-EVER. Every member can be written
        // to exactly one time, so a guess does not cost a weak email — it spends the only email this person
        // will ever get on a coin flip. Somebody whose history says neither which game nor what kind of
        // thing they buy is better left alone than written to badly.
        if (!profile.game && !profile.kind) continue;

        // The scorer produces a shortlist; the model re-ranks it and names the pattern. That is the right
        // division of labour: the scorer is good at "in stock, right game, right money, one of them left",
        // which is arithmetic, and hopeless at "these three are all Eeveelutions".
        const shortlist = pickFor(profile, pool, null, 24);
        if (shortlist.length < PICK_COUNT) continue;
        const { picks: ranked, pattern } = await aiRank({
            profile,
            boughtNames: profile.allNames || [],
            candidates: shortlist,
            max: PICK_COUNT,
        });

        // ⚠️ STOCK IS CLAIMED AFTER THE MODEL HAS CHOSEN, NOT BEFORE. The shortlist is deliberately built
        // unclaimed, or the model would be re-ranking a list already thinned by whoever came earlier in the
        // loop — it would be choosing the best of somebody else's leftovers and calling it a match. What
        // gets reserved is what actually goes in the email.
        const picks = [];
        const claim = (item) => {
            const stock = Math.max(1, Math.floor(Number(item.quantity) || 1));
            if ((claimed.get(item.variation_id) || 0) >= stock) return false;
            claimed.set(item.variation_id, (claimed.get(item.variation_id) || 0) + 1);
            picks.push(item);
            return true;
        };
        for (const item of ranked) { if (picks.length >= PICK_COUNT) break; claim(item); }
        // ⚠️ AND FALL THROUGH THE REST OF THE SHORTLIST WHEN STOCK WAS TAKEN. Without this the members
        // processed last lose every pick to the members processed first and drop out of the run entirely —
        // measured, that was 10 of 74 silently getting no email at all, and they are by construction the
        // people who have been away LONGEST. Their fourth-best match is a perfectly good email; no email is
        // not. [[rewards-must-be-scoped]]
        for (const item of shortlist) { if (picks.length >= PICK_COUNT) break; if (!picks.includes(item)) claim(item); }
        if (!picks.length) continue;

        // ── ⚠️ THE DISCOUNT RIDES ON THE HERO ALONE ────────────────────────────────────────────────────
        // Luke: "just focus on landing that one item we know they want." Discounting all three spends three
        // times the margin to make one sale, and it dilutes the hero — three gold badges down the page is a
        // clearance email, and the one card this was all built around stops standing out.
        //
        // The pool objects are SHARED between members, so this copies rather than nulling `offer` in place.
        // Mutating would strip the discount from that item for everyone processed afterwards, and the item
        // would read full-price in their emails for no reason anyone could trace.
        const shown = picks.map((item, i) => (i === 0 ? item : { ...item, offer: null }));

        const unsubscribeUrl = `${base}/api/outreach/unsubscribe?t=${encodeURIComponent(unsubscribeToken(member.id))}`;
        const rendered = renderOutreachEmail({ name: member.name, profile, picks: shown, pattern, unsubscribeUrl });
        if (!rendered) continue;
        out.push({ member, profile, picks: shown, pattern, ...rendered });
    }
    return out;
}

/**
 * Send. `apply` defaults to false, so calling this by accident does nothing.
 *
 * ⚠️ THE MARKER IS WRITTEN BEFORE THE SEND AND THAT IS THE RIGHT WAY ROUND HERE. Marking afterwards is the
 * usual advice and the November blast follows it, because there the cost of a failed send is somebody missing
 * the email. Here the costs are not symmetrical: a person missing an email they never knew about costs
 * nothing, and a retry delivering a second copy costs a spam report. The INSERT is the lock.
 */
export async function runOutreach({ apply = false, limit = 500, onlyTo = null } = {}) {
    const built = await buildCohort({ limit });
    if (!apply) return { built: built.length, sent: 0, dryRun: true };

    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY is not set");
    const resend = new Resend(key);

    let sent = 0;
    for (const row of built) {
        const claimed = await db.query(
            `INSERT INTO mkt_outreach_send (buyer_id, campaign, meta)
             VALUES ($1, $2, $3::jsonb) ON CONFLICT DO NOTHING RETURNING buyer_id`,
            [row.member.id, CAMPAIGN, JSON.stringify({
                daysSince: row.member.days_since,
                game: row.profile.game,
                format: row.profile.format,
                picks: row.picks.map((p) => ({ id: p.variation_id, pct: p.offer?.pct ?? 0 })),
            })]
        ).catch(() => []);
        if (!claimed.length) continue;

        const res = await resend.emails.send({
            from: FROM,
            to: onlyTo || row.member.email,
            subject: row.subject,
            html: row.html,
            text: row.text,
        });
        if (res?.error) { logger.warn("outreach send failed", { error: res.error }); continue; }
        sent += 1;
    }
    logger.info("outreach run", { built: built.length, sent });
    return { built: built.length, sent, dryRun: false };
}
