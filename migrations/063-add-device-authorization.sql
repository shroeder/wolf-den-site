-- Secret hydration: the admin/employee apps will ship with NO baked secrets and fetch them at runtime,
-- but ONLY authorized devices (the owner's + trusted staff) get them. `authorized` is an explicit
-- allowlist (default FALSE) on top of the existing revoke kill-switch.

ALTER TABLE app_device ADD COLUMN IF NOT EXISTS authorized BOOLEAN NOT NULL DEFAULT FALSE;
