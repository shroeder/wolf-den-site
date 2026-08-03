-- Client-side crashes had nowhere to go. A React render error happens in the member's browser, so nothing in
-- the server logs ever knew it happened — the Store page was down for an hour and we only found out because
-- Luke opened it himself.
--
-- The crash screen posts every one of these here now, so a pattern across members is visible at a glance
-- rather than something you'd have to scroll a log to notice.
CREATE TABLE IF NOT EXISTS mkt_client_error (
    id         BIGSERIAL PRIMARY KEY,
    buyer_id   UUID,
    path       TEXT NOT NULL,
    message    TEXT,
    digest     TEXT,
    stack      TEXT,
    ua         TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- "What has been breaking lately", which is the only question this table exists to answer.
CREATE INDEX IF NOT EXISTS mkt_client_error_recent ON mkt_client_error (created_at DESC);
