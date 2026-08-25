-- ── ROLES AND PRIVATE CHANNELS ──────────────────────────────────────────────────────────────────────────────
-- Luke: "I'd like the ability to set my role in my profile... each role has its own color. Roles are something
-- you can earn... otherwise people's role can default to their rank in levels." And: "two new channels, one for
-- VIPs and one for staff and owners... the chats are exclusive so non-members can't see into them, and once you
-- join that chat you are only able to see messages from after your join date."

-- WHICH role a member chooses to WEAR. What they have EARNED is never stored — it is derived on every read
-- from the owner list, the staff list, lifetime spend and level (see roles.js), because a stored entitlement
-- is a stale entitlement the day somebody stops qualifying. This column only ever holds a preference, and it
-- is validated against the live list before it is honoured.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS role TEXT;

-- The chat table has carried one shared stream since the plaza opened. A channel column keeps that stream
-- exactly as it was — everything already in the table is 'global' — while giving the two private rooms
-- somewhere to live that is not a second table with a second set of queries to keep in step.
ALTER TABLE mkt_town_chat ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'global';
-- The plaza reads the newest N of one channel; without the channel in the index that becomes a scan the day
-- the private rooms have any volume at all.
CREATE INDEX IF NOT EXISTS idx_mkt_town_chat_channel ON mkt_town_chat (channel, created_at DESC);

-- WHEN somebody first qualified for a private room, which is the line their history starts at. Written on the
-- first read that finds them eligible rather than by anything watching for the moment they cross the
-- threshold: there is no such watcher, and a room you can see into before the row exists is the leak this
-- table is here to stop.
CREATE TABLE IF NOT EXISTS mkt_channel_member (
    buyer_id   UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    channel    TEXT NOT NULL,
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, channel)
);
