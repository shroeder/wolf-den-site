-- ─────────────────────────────────────────────────────────────────────────
-- CROSS-DOMAIN SIGN-IN FOR DEN QUEST
--
-- The session cookie is host-only to the Wolf Den domain, so a client
-- served from denquestonline.com cannot read it -- browsers do not send
-- cookies across registrable domains, and no amount of CORS changes that.
--
-- The handoff is the standard answer: the domain that HAS the session mints
-- a single-use code, the browser carries it to the new domain, and that
-- domain exchanges it for a session of its own.
--
-- ⚠️ THE TABLE EXISTS BECAUSE SINGLE-USE CANNOT BE DONE IN MEMORY HERE.
--    The realtime server tracks spent ticket ids in a Map because it is one
--    long-lived process. Next.js on Vercel is not: every request may be a
--    different instance, so "have I seen this code" has nowhere to live but
--    the database. Without it the code in the URL is replayable for its
--    whole lifetime out of browser history, a shared link, or a referrer.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mkt_denquest_handoff (
    jti          uuid PRIMARY KEY,
    buyer_id     uuid NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    created_at   timestamptz NOT NULL DEFAULT now(),
    expires_at   timestamptz NOT NULL,
    redeemed_at  timestamptz
);

-- Sweeping expired rows is cheap and keeps the table from growing forever;
-- the redeem path deletes as it goes, so this only catches codes nobody used.
CREATE INDEX IF NOT EXISTS mkt_denquest_handoff_expires_idx
    ON mkt_denquest_handoff (expires_at);
