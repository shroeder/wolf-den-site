-- ── A ROOM FOR THE PEOPLE WHO PLAY THE UNFINISHED THING ──────────────────────────────────────────────────────
-- Luke: "lets make a testing channel. and users with the tester role will automatically be in it along with
-- owners and staff."
--
-- ⚠️ THE ROLE HAS TO COME FROM SOMETHING THE SERVER ALREADY HOLDS. roles.js is explicit about this: "a role you
-- can assert is a role that means nothing" — every role there is computed from the owner list, the staff list,
-- lifetime spend, or a badge. Three of those are not a thing you can hand to somebody, so this is a BADGE, the
-- same mechanism the `owner` and `staff` designations already use (migration 090) and the same one Luke can
-- grant from the admin app today without a deploy. Nothing new had to be invented to give somebody the role.
--
-- admin_only, and no auto_rule: there is no counter that says "this person tests things". It is given.
--
-- ⚠️ NO CHANNEL TABLE, AND NONE NEEDED. mkt_town_chat.channel is a plain TEXT column with no CHECK on it
-- (migration 402), so a room exists as soon as the server agrees somebody may write to it. What decides that is
-- channelsFor in roles.js; this file only creates the thing that lets a person qualify.
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, auto_rule, auto_threshold, sort_order)
VALUES
    ('tester', 'Tester', 'Plays it before it is finished, and says what broke.', '🧪', '#5fd8e8', TRUE, NULL, NULL, 59)
ON CONFLICT (slug) DO NOTHING;

-- ── NOBODY IS BACKFILLED INTO IT ─────────────────────────────────────────────────────────────────────────────
-- Deliberately, and it is the opposite call to the bug ladder in migration 425 — that one backfilled because
-- the members had already DONE the thing it celebrates and the badge was late. This one names a job somebody
-- has agreed to do. Handing it out to a guess at who might want it would put people in a private room they
-- never asked to be in, and the room's whole value is that everybody in it is there on purpose.
--
-- The house is already in: owners and staff get the room from their own lists, not from this badge — see
-- channelsFor. So the room is never empty while it waits for its first tester.
