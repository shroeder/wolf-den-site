-- ── FIX THE REPORT TABLE'S KEY TYPES ─────────────────────────────────────────────────────────────────────────
-- 370 declared `thread_id` and `message_id` as BIGINT. Both of the things they point at are UUIDs:
--
--     mkt_dm_thread.id    uuid
--     mkt_dm_message.id   uuid
--
-- Nothing complained at CREATE TABLE — an unconstrained bigint column is valid on its own — so the migration
-- ran green and the break only surfaced the first time something JOINED on it: the admin message log 500'd
-- with `operator does not exist: bigint = uuid` the moment it counted reports per thread.
--
-- The lesson is one already written down and not followed: a migration is not verified by running, it is
-- verified by running the QUERIES that will use it. `SELECT to_regclass(...)` said the table existed, which
-- told me nothing.
--
-- Safe as a straight ALTER: the table has never held a row. USING NULL rather than a cast, because there is
-- nothing to preserve and a bigint cannot be cast to a uuid anyway.
--
-- ── AND IT IS IDEMPOTENT, DELIBERATELY ───────────────────────────────────────────────────────────────────────
-- These statements were applied directly to production the moment the 500 was diagnosed, rather than waiting
-- a deploy cycle with the owner's new screen broken. So this file has to be a no-op against a database where
-- it has already happened — otherwise the ADD CONSTRAINT throws, and migrations run under `set -e` inside the
-- Vercel build, which would take the whole deploy down.
ALTER TABLE mkt_dm_report
    ALTER COLUMN thread_id TYPE UUID USING NULL,
    ALTER COLUMN message_id TYPE UUID USING NULL;

-- ADD CONSTRAINT has no IF NOT EXISTS, so it is guarded by hand.
-- ON DELETE SET NULL rather than CASCADE: if a thread is ever removed the REPORT must survive it — the whole
-- point of a report is that it outlives the thing it is about.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mkt_dm_report_thread_fk') THEN
        ALTER TABLE mkt_dm_report ADD CONSTRAINT mkt_dm_report_thread_fk
            FOREIGN KEY (thread_id) REFERENCES mkt_dm_thread(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mkt_dm_report_message_fk') THEN
        ALTER TABLE mkt_dm_report ADD CONSTRAINT mkt_dm_report_message_fk
            FOREIGN KEY (message_id) REFERENCES mkt_dm_message(id) ON DELETE SET NULL;
    END IF;
END $$;
