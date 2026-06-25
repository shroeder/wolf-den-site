import "server-only";

import { hashPassword, verifyPassword } from "@/lib/consignment/password";
import { db } from "@/lib/db";
import { createServerLogger } from "@/lib/server-logger";
import {
    isValidPermission,
    isValidRole,
    resolveEffectivePermissions,
} from "@/lib/admin-app/permissions";

const usersLogger = createServerLogger({ source: "api", subsystem: "admin-app-users" });

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function toIso(value) {
    return value ? new Date(value).toISOString() : null;
}

export function isValidEmail(value) {
    return EMAIL_PATTERN.test(normalizeEmail(value));
}

export function isValidPassword(value) {
    return typeof value === "string" && value.length >= MIN_PASSWORD_LENGTH;
}

async function getOverridesForUser(userId) {
    return db.query(
        `SELECT permission_key, granted
         FROM admin_app_user_permissions
         WHERE user_id = $1`,
        [userId]
    );
}

function mapUser(row, effectivePermissions, overrides = []) {
    return {
        id: row.id,
        storeId: row.store_id,
        email: row.email,
        displayName: row.display_name,
        role: row.role,
        active: Boolean(row.active),
        mustChangePassword: Boolean(row.must_change_password),
        lastLoginAt: toIso(row.last_login_at),
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
        permissionOverrides: overrides.map((o) => ({
            key: o.permission_key,
            granted: Boolean(o.granted),
        })),
        effectivePermissions,
    };
}

async function hydrateUser(row) {
    const overrides = await getOverridesForUser(row.id);
    const effective = resolveEffectivePermissions(row.role, overrides);

    return mapUser(row, effective, overrides);
}

export async function getAdminAppUserById(storeId, id) {
    const row = await db.queryOne(
        "SELECT * FROM admin_app_users WHERE id = $1 AND store_id = $2",
        [id, storeId]
    );

    if (!row) {
        return null;
    }

    return hydrateUser(row);
}

export async function listAdminAppUsers(storeId) {
    const rows = await db.query(
        "SELECT * FROM admin_app_users WHERE store_id = $1 ORDER BY created_at ASC",
        [storeId]
    );

    return Promise.all(rows.map(hydrateUser));
}

export async function createAdminAppUser({ storeId, email, displayName, role, password, mustChangePassword = true }) {
    const normalizedEmail = normalizeEmail(email);

    if (!storeId) {
        return { error: "missing_store", status: 400 };
    }

    if (!isValidEmail(normalizedEmail)) {
        return { error: "invalid_email", status: 400 };
    }

    if (!displayName || typeof displayName !== "string") {
        return { error: "invalid_display_name", status: 400 };
    }

    if (!isValidRole(role)) {
        return { error: "invalid_role", status: 400 };
    }

    if (!isValidPassword(password)) {
        return { error: "weak_password", status: 400 };
    }

    const existing = await db.queryOne(
        "SELECT id FROM admin_app_users WHERE email_normalized = $1",
        [normalizedEmail]
    );

    if (existing) {
        return { error: "email_already_exists", status: 409 };
    }

    const passwordHash = await hashPassword(password);

    const row = await db.queryOne(
        `INSERT INTO admin_app_users (store_id, email, email_normalized, display_name, password_hash, role, must_change_password)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [storeId, String(email).trim(), normalizedEmail, displayName.trim(), passwordHash, role, Boolean(mustChangePassword)]
    );

    usersLogger.info("admin_app.users.created", { userId: row.id, role });

    return { user: await hydrateUser(row) };
}

/**
 * Verify email + password. Returns the raw row (incl. id) on success, or null.
 * Inactive accounts never authenticate.
 */
export async function authenticateAdminAppUser(email, password) {
    const normalizedEmail = normalizeEmail(email);
    const row = await db.queryOne(
        "SELECT * FROM admin_app_users WHERE email_normalized = $1",
        [normalizedEmail]
    );

    if (!row || !row.active) {
        return null;
    }

    const ok = await verifyPassword(password, row.password_hash);

    if (!ok) {
        return null;
    }

    return row;
}

export async function touchAdminAppUserLogin(id) {
    await db.query(
        "UPDATE admin_app_users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1",
        [id]
    );
}

export async function updateAdminAppUser(storeId, id, updates) {
    const assignments = [];
    const values = [];

    if (updates.displayName !== undefined) {
        if (!updates.displayName || typeof updates.displayName !== "string") {
            return { error: "invalid_display_name", status: 400 };
        }
        assignments.push(`display_name = $${assignments.length + 1}`);
        values.push(updates.displayName.trim());
    }

    if (updates.role !== undefined) {
        if (!isValidRole(updates.role)) {
            return { error: "invalid_role", status: 400 };
        }
        assignments.push(`role = $${assignments.length + 1}`);
        values.push(updates.role);
    }

    if (updates.active !== undefined) {
        if (typeof updates.active !== "boolean") {
            return { error: "invalid_active", status: 400 };
        }
        assignments.push(`active = $${assignments.length + 1}`);
        values.push(updates.active);
    }

    if (!assignments.length) {
        return { error: "no_valid_fields", status: 400 };
    }

    values.push(id);
    values.push(storeId);

    const rows = await db.query(
        `UPDATE admin_app_users
         SET ${assignments.join(", ")}, updated_at = NOW()
         WHERE id = $${values.length - 1} AND store_id = $${values.length}
         RETURNING id`,
        values
    );

    if (!rows.length) {
        return { error: "user_not_found", status: 404 };
    }

    usersLogger.info("admin_app.users.updated", { storeId, userId: id, fields: Object.keys(updates) });

    return { user: await getAdminAppUserById(storeId, id) };
}

/**
 * Replace a user's permission overrides wholesale.
 * @param {Array<{key: string, granted: boolean}>} overrides
 */
export async function setAdminAppUserPermissionOverrides(storeId, id, overrides) {
    if (!Array.isArray(overrides)) {
        return { error: "invalid_overrides", status: 400 };
    }

    for (const override of overrides) {
        if (!isValidPermission(override?.key) || typeof override?.granted !== "boolean") {
            return { error: "invalid_override", status: 400 };
        }
    }

    const user = await db.queryOne(
        "SELECT id FROM admin_app_users WHERE id = $1 AND store_id = $2",
        [id, storeId]
    );

    if (!user) {
        return { error: "user_not_found", status: 404 };
    }

    await db.query("DELETE FROM admin_app_user_permissions WHERE user_id = $1", [id]);

    for (const override of overrides) {
        await db.query(
            `INSERT INTO admin_app_user_permissions (user_id, permission_key, granted)
             VALUES ($1, $2, $3)`,
            [id, override.key, override.granted]
        );
    }

    usersLogger.info("admin_app.users.permissions_set", { storeId, userId: id, count: overrides.length });

    return { user: await getAdminAppUserById(storeId, id) };
}

export async function setAdminAppUserPassword(storeId, id, password, { mustChangePassword = false } = {}) {
    if (!isValidPassword(password)) {
        return { error: "weak_password", status: 400 };
    }

    const passwordHash = await hashPassword(password);

    const rows = await db.query(
        `UPDATE admin_app_users
         SET password_hash = $1, must_change_password = $2, updated_at = NOW()
         WHERE id = $3 AND store_id = $4
         RETURNING id`,
        [passwordHash, Boolean(mustChangePassword), id, storeId]
    );

    if (!rows.length) {
        return { error: "user_not_found", status: 404 };
    }

    usersLogger.info("admin_app.users.password_set", { storeId, userId: id });

    return { user: await getAdminAppUserById(storeId, id) };
}
