-- ROLLBACK for migrations 027 + 028 (multi-tenant pivot).
--
-- This is NOT a numbered migration, so it never runs automatically. Run it
-- manually (psql / Neon SQL console) ONLY if you need to undo tenancy after a
-- deploy:  it drops the per-tenant schema and removes the migration records so
-- 027/028 can re-run cleanly later.
--
-- Safe because 027/028 are additive: the columns/tables below were added by them
-- and are used only by the admin app. The public storefront / Square POS never
-- referenced them. After running this, roll the code back too (Vercel Instant
-- Rollback, or git revert the multi-tenant commit).
--
-- ⚠️ If real tenant stores were created after deploy, this destroys their
-- store_integrations + store_id links. For a same-week revert (only the flagship
-- exists) that's fine.

BEGIN;

DROP TABLE IF EXISTS store_integrations;

ALTER TABLE admin_app_sessions DROP COLUMN IF EXISTS store_id;
ALTER TABLE admin_app_users DROP COLUMN IF EXISTS store_id;

DROP TABLE IF EXISTS stores;

DELETE FROM pgmigrations
 WHERE name IN ('027-add-store-tenancy.sql', '028-add-store-integrations.sql');

COMMIT;
