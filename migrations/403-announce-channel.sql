-- ── THE ANNOUNCEMENTS CHANNEL, AND PER-CHANNEL UNREAD ───────────────────────────────────────────────────────
-- Luke: "let's make an announcements channel and have arena messages and arbiter messages go there. Also
-- ensure badges work for each tab, and the global badge on the chat bubble should reflect messages from all
-- unread tabs combined."

-- Every post the Arbiter has ever made moves to its own room. Two kinds live in here and both belong: the
-- automated milestones (first to a rung, an arena record) and the hand-written announcements. They are the
-- same thing from a reader's point of view — the house talking — and in the plaza they were a wall of
-- unbroken text between people trying to have a conversation.
UPDATE mkt_town_chat SET channel = 'announce'
 WHERE channel = 'global'
   AND buyer_id IN (SELECT id FROM mkt_buyer WHERE alias = 'arbiter');

-- WHEN each member last looked at each room. `global_chat_seen_at` on mkt_buyer already did this for the
-- plaza and cannot grow a column per room; this is the same idea with the room as data rather than as schema.
--
-- It rides on the membership table rather than a new one because the two facts are the same shape and are
-- always read together: which rooms you are in, and how much of each you have missed. A row is created on
-- first contact either way (see joinedAt).
ALTER TABLE mkt_channel_member ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ;

-- Global and announce have no membership gate, so nobody has a row for them yet — but they still need a
-- seen mark for their badges. Seeded from the plaza mark members already have, so nobody opens the hub to
-- a badge counting a month of history they have in fact already read.
INSERT INTO mkt_channel_member (buyer_id, channel, joined_at, seen_at)
SELECT id, 'global', COALESCE(global_chat_seen_at, NOW() - INTERVAL '7 days'),
       COALESCE(global_chat_seen_at, NOW() - INTERVAL '7 days')
  FROM mkt_buyer
ON CONFLICT (buyer_id, channel) DO NOTHING;

INSERT INTO mkt_channel_member (buyer_id, channel, joined_at, seen_at)
SELECT id, 'announce', COALESCE(global_chat_seen_at, NOW() - INTERVAL '7 days'),
       COALESCE(global_chat_seen_at, NOW() - INTERVAL '7 days')
  FROM mkt_buyer
ON CONFLICT (buyer_id, channel) DO NOTHING;
