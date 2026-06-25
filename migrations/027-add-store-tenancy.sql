-- Multi-tenancy for the admin app: a `stores` (tenant) table, with admin_app_users
-- and admin_app_sessions scoped to a store. The existing (flagship) rows are
-- backfilled into a "wolf-den" store. Email stays GLOBALLY unique (one email =
-- one account = one store), so login remains email + password with no store slug.

BEGIN;

CREATE TABLE IF NOT EXISTS stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',   -- active | trialing | suspended | closed
    plan TEXT NOT NULL DEFAULT 'trial',      -- trial | standard | owner | ...
    -- ONLY the flagship may fall back to the global env Square token. Every other
    -- store must connect its own Square, so it can never use the flagship's creds.
    uses_env_credentials BOOLEAN NOT NULL DEFAULT FALSE,
    trial_ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Flagship tenant for any pre-existing admin_app_users / sessions.
INSERT INTO stores (slug, name, status, plan, uses_env_credentials)
VALUES ('wolf-den', 'The Wolf Den', 'active', 'owner', TRUE)
ON CONFLICT (slug) DO NOTHING;

-- Users gain a store_id (backfilled to flagship, then enforced).
ALTER TABLE admin_app_users
    ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE CASCADE;

UPDATE admin_app_users
   SET store_id = (SELECT id FROM stores WHERE slug = 'wolf-den')
 WHERE store_id IS NULL;

ALTER TABLE admin_app_users ALTER COLUMN store_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_app_users_store ON admin_app_users (store_id);

-- Sessions denormalize store_id (backfilled from the user) for cheap scoping
-- and defense in depth.
ALTER TABLE admin_app_sessions
    ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE CASCADE;

UPDATE admin_app_sessions s
   SET store_id = u.store_id
  FROM admin_app_users u
 WHERE u.id = s.user_id AND s.store_id IS NULL;

ALTER TABLE admin_app_sessions ALTER COLUMN store_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_app_sessions_store ON admin_app_sessions (store_id);

COMMIT;
