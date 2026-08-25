-- ── THE VIP LOUNGE ──────────────────────────────────────────────────────────────────────────────────────────
-- Luke: "add a VIP only section that has that little barrier over the front of a door with a VIP sign... only
-- people who are VIPs can go in there... inside, generate a background and let's have it so that anyone else
-- can walk around and see each other back there and chat in the VIP only chat... there's a bar in the back
-- where you can see a bartender and you can interact with them and he tells you secret things that only VIPs
-- get to know about, like mechanics of the game... and you can leave notes with him to give to other VIPs...
-- there's a VIP only vendor next to the bartender... and when you enter the VIP lounge you get a badge that
-- no one else can get."
--
-- ── ALMOST NONE OF THIS NEEDS A TABLE, AND THAT IS THE POINT ─────────────────────────────────────────────────
-- Four of the six things above already exist somewhere in this codebase and are being REUSED rather than
-- rebuilt, which is why this migration is short:
--
--   WHO IS A VIP           roles.js already derives it from lifetime spend (VIP_CENTS), and owners and staff
--                          are VIPs by default. Nothing is stored: a stored entitlement is a stale one the day
--                          somebody stops qualifying. See standingFor.
--   THE VIP CHAT           already exists as the `vip` channel (migration 402), with its own join window so a
--                          new VIP does not walk in to a wall of other people's backlog. The lounge shows THAT
--                          channel rather than inventing a second VIP chat that would split the room in two.
--   WALKING AROUND         `mkt_town_presence.zone` is how the tavern and the casino floor both work. The
--                          lounge is one more zone value; seeing each other comes free with it.
--   THE BADGE              event badges are granted through grantEventBadge and live in the existing badge
--                          tables. It needs no schema, only an id.
--
-- What is genuinely new is the noticeboard, because nothing in the game is a message left for a GROUP rather
-- than for a person: member DMs are addressed, chat is a stream that scrolls away, and a note pinned behind
-- the bar is neither.

-- ── WHAT THE BARTENDER IS HOLDING FOR YOU ───────────────────────────────────────────────────────────────────
-- One note per row, written by a VIP, readable by every VIP. Deliberately NOT addressed to anybody: Luke asked
-- for notes "to give to other VIPs", plural and unnamed, which is a noticeboard rather than a mailbox — and a
-- mailbox is what member DMs already are.
--
-- `body` is capped in code (see vip.js) and run through the shared profanity filter like every other piece of
-- member-authored public text. A room being private is not a reason to skip that: it is a room the owner does
-- not read every message of, which is more reason rather than less.
CREATE TABLE IF NOT EXISTS mkt_vip_note (
    id         BIGSERIAL PRIMARY KEY,
    buyer_id   UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    body       TEXT NOT NULL,
    -- Soft-deleted rather than removed, so a note somebody regrets can be taken down without the row
    -- vanishing from under anybody mid-read, and so the owner can see what was said if it ever matters.
    hidden     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- The board reads the newest handful, always filtered to the visible ones.
CREATE INDEX IF NOT EXISTS idx_mkt_vip_note_recent ON mkt_vip_note (created_at DESC) WHERE hidden = FALSE;
-- One live note per person at a time — the board is a wall of the room's voices, not a feed one person can
-- take over. Enforced here rather than only in code, because "only in code" is how a double-tap gets two.
-- A PARTIAL index, so a hidden note does not block writing a new one.
--
-- NOTE THE WHERE CLAUSE IS PART OF THE CONSTRAINT: anything doing ON CONFLICT against this index has to
-- restate `WHERE hidden = FALSE` or Postgres cannot match it and the upsert silently becomes an insert that
-- fails. That trap has cost this codebase two weeks of lost writes once already.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mkt_vip_note_one_live ON mkt_vip_note (buyer_id) WHERE hidden = FALSE;

-- ── THE BADGE FOR WALKING IN ────────────────────────────────────────────────────────────────────────────────
-- Luke: "when you enter the VIP lounge you actually get a badge that no one else can get unless they get into
-- the VIP lounge."
--
-- Granted by grantEventBadge on the first successful entry rather than by an auto_rule, because there is no
-- metric to count: the qualifying event is opening a door, and the only place that knows it happened is the
-- door. See enterVipLounge.
--
-- SECRET, like the three rare casino badges, and for the same reason those are: a badge board that lists
-- "get into the VIP lounge" as an unticked box turns a room into a checklist item for everybody who cannot
-- get in. The people who can get in do not need to be told it exists — they will be standing in it.
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, secret, auto_rule, auto_threshold, sort_order)
VALUES
    ('casino_vip_room', 'Behind the Rope', 'Walked into the VIP lounge', '❖', '#b45aff', FALSE, TRUE, NULL, NULL, 828)
ON CONFLICT (slug) DO NOTHING;
