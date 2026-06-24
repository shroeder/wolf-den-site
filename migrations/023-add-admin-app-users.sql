-- Admin app (accounting_app) multi-user auth + permissions.
-- Deliberately separate from `consignors` and `shop_customer_accounts`:
-- this is the staff-login system for the internal Android admin app.

CREATE TABLE IF NOT EXISTS admin_app_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    email_normalized TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_app_users_email ON admin_app_users(email_normalized);

-- Per-person permission overrides on top of the role defaults.
-- granted = TRUE adds a permission the role doesn't have; granted = FALSE removes one it does.
CREATE TABLE IF NOT EXISTS admin_app_user_permissions (
    user_id UUID NOT NULL REFERENCES admin_app_users(id) ON DELETE CASCADE,
    permission_key TEXT NOT NULL,
    granted BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, permission_key)
);

-- DB-backed sessions so an owner can instantly revoke a fired employee's access.
-- The raw token never lands in the DB — only its sha256 hash.
CREATE TABLE IF NOT EXISTS admin_app_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES admin_app_users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    device_label TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_app_sessions_user_id ON admin_app_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_app_sessions_token_hash ON admin_app_sessions(token_hash);
