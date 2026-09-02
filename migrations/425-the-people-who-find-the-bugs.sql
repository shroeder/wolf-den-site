-- ── A LADDER FOR THE PEOPLE WHO FIND THE BUGS ────────────────────────────────────────────────────────────────
-- Luke: "I think we should make a badge for bug reporters... and a role for bug finder if you reach 10 bugs
-- rewarded. backfilled."
--
-- WHAT COUNTS AS A BUG YOU FOUND. There is no bug-report table and there should not be one: a report is a chat
-- message, and most chat messages are not reports. The thing that IS a record is the PAYMENT — a bounty is only
-- ever paid when a report turned into a fix, which is the exact thing being celebrated. The rate is flat (500 a
-- bug, to the first reporter) so the ledger divides cleanly, and the one row that paid 1,000 counts correctly
-- as the two separate defects it was paid for. See BUG_BOUNTY_GOLD in badges.js, which is the only place the
-- rate is written down.
--
-- ── WHY 1 / 5 / 10 / 25 AND NOT 10 / 25 / 50 / 100 ───────────────────────────────────────────────────────────
-- Those were the numbers first proposed, and against the real board they award nothing at all: the busiest bug
-- hunter in the Den has EIGHT, three members have three, and everybody else has two. A backfill of that ladder
-- inserts zero rows, and the first badge would appear only once somebody found two more.
--
-- This is the same correction VIP already went through in roles.js — a thousand dollars qualified exactly one
-- member, "which is not a room, it is somebody talking to themselves", and it became seven hundred once Luke
-- saw where people actually sat. Same call here, on his say-so: the first rung goes to everyone who has ever
-- had a report fixed (seven members), the second to the one person past five, and the third sits two bugs off
-- the leader's reach so there is something to chase.
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, auto_rule, auto_threshold, sort_order)
VALUES
    ('bug_spotter',      'Bug Spotter',  'Reported something broken and it got fixed.',        '🐛', '#8fe39a', FALSE, 'bugs_rewarded',  1, 55),
    ('bug_hunter',       'Bug Hunter',   'Five of your reports turned into fixes.',            '🔦', '#7fe0ff', FALSE, 'bugs_rewarded',  5, 56),
    ('bug_finder',       'Bug Finder',   'Ten of your reports turned into fixes.',             '🪲', '#ffd75e', FALSE, 'bugs_rewarded', 10, 57),
    ('bug_exterminator', 'Exterminator', 'Twenty-five of your reports turned into fixes.',     '🏆', '#ff5cc8', FALSE, 'bugs_rewarded', 25, 58)
ON CONFLICT (slug) DO NOTHING;

-- ── AND THE PEOPLE WHO ALREADY EARNED THEM: NO SQL BACKFILL, DELIBERATELY ────────────────────────────────────
-- Luke asked for this backfilled, and it is — by the grant path rather than by this file, which is the better
-- of the two and worth saying why.
--
-- An INSERT here would hand over the row and nothing else. Earning a badge also pays XP and gold
-- (rewardBadgeEarned), keys that payment off the slug so it can never double-pay, and pops the badge on screen
-- for the member who earned it. A SQL grant skips all three: the badge would simply be there one day, unpaid
-- and unannounced, on somebody who had earned it the hard way.
--
-- syncEarnedBadges already runs from /api/marketplace/auth/me on every session check, so each of the seven
-- members owed one of these collects it — with the gold, the XP and the pop — the next time they open the Den.
-- Nobody who has earned it can miss it, and anybody who reaches a rung later gets there by the same road.
--
-- ── AND THEY CARRY NO STAT BONUS ─────────────────────────────────────────────────────────────────────────────
-- Every other badge grants something in the vocabulary of the system it belongs to, and these four grant
-- nothing — no entry in BADGE_BONUSES. That is the point. Badges already out-weigh gear in a fight, and a
-- ladder that pays combat power for reporting bugs would make helpfulness a way to buy strength. What these
-- are worth is the bounty, which is already paid in gold, and the name on the card.
