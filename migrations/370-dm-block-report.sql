-- ── BLOCK AND REPORT FOR DIRECT MESSAGES ─────────────────────────────────────────────────────────────────────
-- Member DMs shipped with no way out of a conversation. text-filter.js guards public text only, so a DM is
-- unfiltered, and the recipient's only options were to ignore it or to tell Luke. That is fine at 18 users and
-- it is not a thing you want to still be true later — so: a block anyone can apply themselves, and a report
-- that puts it in front of the owner.
--
-- A block is DIRECTIONAL as stored (who blocked whom, so it can be undone by the person who set it) and
-- SYMMETRIC as enforced (see dm.js: a block in either direction stops the thread both ways). Storing it
-- directionally is what lets the blocker lift it later without guessing which row was theirs.
CREATE TABLE IF NOT EXISTS mkt_dm_block (
    blocker_id  UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    blocked_id  UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (blocker_id, blocked_id)
);
CREATE INDEX IF NOT EXISTS mkt_dm_block_blocked_idx ON mkt_dm_block (blocked_id);

-- A report names a MESSAGE where possible, not just a person: "this one, here" is what makes it reviewable
-- weeks later, and the message body is immutable so the evidence cannot be edited out from under it.
CREATE TABLE IF NOT EXISTS mkt_dm_report (
    id           BIGSERIAL PRIMARY KEY,
    reporter_id  UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    reported_id  UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    thread_id    BIGINT,
    message_id   BIGINT,
    reason       TEXT NOT NULL,
    note         TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Left NULL until the owner has actually looked. `action` is free text on purpose: what was done about a
    -- report is a sentence, not an enum, and an enum here would be five options that never fit the sixth case.
    resolved_at  TIMESTAMPTZ,
    action       TEXT
);
CREATE INDEX IF NOT EXISTS mkt_dm_report_open_idx ON mkt_dm_report (created_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS mkt_dm_report_reported_idx ON mkt_dm_report (reported_id);
