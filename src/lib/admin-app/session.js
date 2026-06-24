import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { db } from "@/lib/db";
import { resolveEffectivePermissions } from "@/lib/admin-app/permissions";

// 30-day sessions for a store phone, but revocable: deactivating a user or
// resetting their password kills all their sessions immediately.
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TOKEN_BYTES = 32;

function generateToken() {
    return randomBytes(TOKEN_BYTES).toString("hex");
}

function hashToken(token) {
    return createHash("sha256").update(token).digest("hex");
}

/**
 * Create a new session for a user. Returns the RAW token (shown once to the
 * client) and its expiry. Only the hash is persisted.
 */
export async function createAdminAppSession(userId, { deviceLabel = null } = {}) {
    const token = generateToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await db.query(
        `INSERT INTO admin_app_sessions (user_id, token_hash, device_label, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [userId, tokenHash, deviceLabel, expiresAt]
    );

    return { token, expiresAt: expiresAt.toISOString() };
}

/**
 * Resolve a raw bearer token to its user + effective permissions.
 * Returns null for missing/invalid/expired/revoked tokens or inactive users.
 * Updates last_used_at on success.
 */
export async function resolveAdminAppSession(token) {
    if (!token || typeof token !== "string") {
        return null;
    }

    const tokenHash = hashToken(token);

    const row = await db.queryOne(
        `SELECT s.id AS session_id, s.expires_at, s.revoked_at,
                u.id, u.email, u.display_name, u.role, u.active, u.must_change_password,
                u.last_login_at, u.created_at, u.updated_at
         FROM admin_app_sessions s
         JOIN admin_app_users u ON u.id = s.user_id
         WHERE s.token_hash = $1`,
        [tokenHash]
    );

    if (!row || row.revoked_at || !row.active) {
        return null;
    }

    if (new Date(row.expires_at) <= new Date()) {
        return null;
    }

    await db.query(
        "UPDATE admin_app_sessions SET last_used_at = NOW() WHERE id = $1",
        [row.session_id]
    );

    const overrides = await db.query(
        "SELECT permission_key, granted FROM admin_app_user_permissions WHERE user_id = $1",
        [row.id]
    );

    const effectivePermissions = resolveEffectivePermissions(row.role, overrides);

    return {
        sessionId: row.session_id,
        user: {
            id: row.id,
            email: row.email,
            displayName: row.display_name,
            role: row.role,
            active: Boolean(row.active),
            mustChangePassword: Boolean(row.must_change_password),
        },
        effectivePermissions,
    };
}

export async function revokeAdminAppSession(token) {
    if (!token) {
        return;
    }

    await db.query(
        "UPDATE admin_app_sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL",
        [hashToken(token)]
    );
}

/** Revoke every active session for a user (e.g. on deactivate / password reset). */
export async function revokeAllAdminAppSessionsForUser(userId) {
    await db.query(
        "UPDATE admin_app_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL",
        [userId]
    );
}
