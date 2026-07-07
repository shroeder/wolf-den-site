import "server-only";

import { createHash, randomBytes, randomInt } from "node:crypto";

import { headers } from "next/headers";

import { hashPassword, verifyPassword } from "@/lib/consignment/password";
import { db } from "@/lib/db";

// Buyer accounts + token sessions for the marketplace phone app. Mirrors the vendor-session shape
// (revocable, only the token hash stored) but delivered as a bearer token (no cookie — the app is
// a native client).

const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const TOKEN_BYTES = 32;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generateToken() {
    return randomBytes(TOKEN_BYTES).toString("hex");
}

function hashToken(token) {
    return createHash("sha256").update(token).digest("hex");
}

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

export function isValidBuyerEmail(email) {
    return EMAIL_PATTERN.test(String(email || "").trim());
}

export function isValidBuyerPassword(password) {
    return typeof password === "string" && password.length >= 8;
}

function mapBuyer(row) {
    return {
        id: row.id,
        email: row.email,
        displayName: row.display_name || null,
    };
}

// Register a new buyer. Throws on duplicate email / invalid input.
export async function createBuyer({ email, password, displayName = null }) {
    const normalized = normalizeEmail(email);
    if (!isValidBuyerEmail(email)) {
        throw new Error("Enter a valid email address.");
    }
    if (!isValidBuyerPassword(password)) {
        throw new Error("Password must be at least 8 characters.");
    }
    const existing = await db.queryOne(`SELECT id FROM mkt_buyer WHERE email_normalized = $1`, [normalized]);
    if (existing) {
        throw new Error("An account with that email already exists.");
    }
    const passwordHash = await hashPassword(password);
    const row = await db.queryOne(
        `INSERT INTO mkt_buyer (email, email_normalized, password_hash, display_name)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, display_name`,
        [String(email).trim(), normalized, passwordHash, displayName ? String(displayName).trim().slice(0, 120) : null]
    );
    return mapBuyer(row);
}

// Verify email + password, returning the buyer (with emailVerified) or null.
export async function authenticateBuyer(email, password) {
    const normalized = normalizeEmail(email);
    const row = await db.queryOne(
        `SELECT id, email, display_name, password_hash, email_verified FROM mkt_buyer WHERE email_normalized = $1`,
        [normalized]
    );
    if (!row || !row.password_hash) {
        return null;
    }
    const ok = await verifyPassword(password, row.password_hash);
    return ok ? { ...mapBuyer(row), emailVerified: !!row.email_verified } : null;
}

// --- Email verification (6-digit code) ---

const VERIFY_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_VERIFY_ATTEMPTS = 6;

// Generate + store a hashed 6-digit code for the account, returning the raw code + email to send.
// Returns null if no account exists for the email.
export async function createEmailVerification(email) {
    const normalized = normalizeEmail(email);
    const account = await db.queryOne(`SELECT id, email FROM mkt_buyer WHERE email_normalized = $1`, [normalized]);
    if (!account) return null;
    const code = String(randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + VERIFY_TTL_MS);
    await db.query(
        `UPDATE mkt_buyer
            SET email_verify_code_hash = $2, email_verify_expires = $3, email_verify_attempts = 0, updated_at = NOW()
          WHERE id = $1`,
        [account.id, hashToken(code), expiresAt]
    );
    return { email: account.email, code };
}

// Check a code. On success marks the account verified and returns { ok: true, buyer }. Otherwise
// { ok: false, reason }. Increments an attempt counter to throttle brute force.
export async function verifyEmailCode(email, code) {
    const normalized = normalizeEmail(email);
    const row = await db.queryOne(
        `SELECT id, email, display_name, email_verified, email_verify_code_hash, email_verify_expires, email_verify_attempts
           FROM mkt_buyer WHERE email_normalized = $1`,
        [normalized]
    );
    if (!row) return { ok: false, reason: "not_found" };
    if (row.email_verified) return { ok: true, buyer: mapBuyer(row) };
    if (!row.email_verify_code_hash || !row.email_verify_expires) return { ok: false, reason: "no_code" };
    if (new Date(row.email_verify_expires) <= new Date()) return { ok: false, reason: "expired" };
    if (row.email_verify_attempts >= MAX_VERIFY_ATTEMPTS) return { ok: false, reason: "too_many_attempts" };

    const matches = hashToken(String(code || "").trim()) === row.email_verify_code_hash;
    if (!matches) {
        await db.query(`UPDATE mkt_buyer SET email_verify_attempts = email_verify_attempts + 1 WHERE id = $1`, [row.id]);
        return { ok: false, reason: "invalid_code" };
    }
    await db.query(
        `UPDATE mkt_buyer
            SET email_verified = TRUE, email_verify_code_hash = NULL, email_verify_expires = NULL,
                email_verify_attempts = 0, updated_at = NOW()
          WHERE id = $1`,
        [row.id]
    );
    return { ok: true, buyer: mapBuyer(row) };
}

export async function createBuyerSession(buyerId, { deviceLabel = "app" } = {}) {
    const token = generateToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await db.query(
        `INSERT INTO mkt_buyer_session (buyer_id, token_hash, device_label, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [buyerId, hashToken(token), deviceLabel, expiresAt]
    );
    return { token, expiresAt: expiresAt.toISOString() };
}

export async function resolveBuyerSession(token) {
    if (!token || typeof token !== "string") {
        return null;
    }
    const row = await db.queryOne(
        `SELECT s.id AS session_id, s.expires_at, s.revoked_at, b.id, b.email, b.display_name
         FROM mkt_buyer_session s
         JOIN mkt_buyer b ON b.id = s.buyer_id
         WHERE s.token_hash = $1`,
        [hashToken(token)]
    );
    if (!row || row.revoked_at || new Date(row.expires_at) <= new Date()) {
        return null;
    }
    await db.query(`UPDATE mkt_buyer_session SET last_used_at = NOW() WHERE id = $1`, [row.session_id]);
    return { sessionId: row.session_id, buyer: mapBuyer(row) };
}

export async function revokeBuyerSession(token) {
    if (!token) return;
    await db.query(
        `UPDATE mkt_buyer_session SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL`,
        [hashToken(token)]
    );
}

// --- Password reset ---

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

// Start a reset: if an account exists for the email, store a hashed reset token + expiry and return
// the raw token + email to send. Returns null if no account (caller still responds "ok" to avoid
// leaking which emails are registered).
export async function createPasswordReset(email) {
    const normalized = normalizeEmail(email);
    const account = await db.queryOne(`SELECT id, email FROM mkt_buyer WHERE email_normalized = $1`, [normalized]);
    if (!account) {
        return null;
    }
    const token = generateToken();
    const expiresAt = new Date(Date.now() + RESET_TTL_MS);
    await db.query(
        `UPDATE mkt_buyer SET reset_token_hash = $2, reset_expires_at = $3, updated_at = NOW() WHERE id = $1`,
        [account.id, hashToken(token), expiresAt]
    );
    return { token, email: account.email };
}

// Complete a reset: set the new password on the account, keep any linked vendor's (web-portal)
// password in sync, revoke existing app sessions, and clear the token.
export async function resetPassword(token, newPassword) {
    if (!token || typeof token !== "string") {
        throw new Error("This reset link is invalid or has expired.");
    }
    if (!isValidBuyerPassword(newPassword)) {
        throw new Error("Password must be at least 8 characters.");
    }
    const account = await db.queryOne(
        `SELECT id, email_normalized, reset_expires_at FROM mkt_buyer WHERE reset_token_hash = $1`,
        [hashToken(token)]
    );
    if (!account || !account.reset_expires_at || new Date(account.reset_expires_at) <= new Date()) {
        throw new Error("This reset link is invalid or has expired.");
    }
    const passwordHash = await hashPassword(newPassword);
    await db.query(
        `UPDATE mkt_buyer SET password_hash = $2, reset_token_hash = NULL, reset_expires_at = NULL, updated_at = NOW()
         WHERE id = $1`,
        [account.id, passwordHash]
    );
    // Keep the linked vendor's web-portal password matching the account password.
    await db.query(
        `UPDATE mkt_vendor SET password_hash = $2, updated_at = NOW()
         WHERE account_id = $1 OR email_normalized = $3`,
        [account.id, passwordHash, account.email_normalized]
    );
    // Invalidate existing app sessions after a password change.
    await db.query(`UPDATE mkt_buyer_session SET revoked_at = NOW() WHERE buyer_id = $1 AND revoked_at IS NULL`, [
        account.id,
    ]);
    return true;
}

// Bearer token from the Authorization header (the app's only auth transport).
export async function getBearerToken() {
    try {
        const h = await headers();
        const auth = h.get("authorization");
        if (auth && auth.toLowerCase().startsWith("bearer ")) {
            return auth.slice(7).trim() || null;
        }
    } catch {
        /* not in a request scope */
    }
    return null;
}

// The authenticated buyer for the current request (bearer token), or null.
export async function getAuthenticatedBuyer() {
    const token = await getBearerToken();
    if (!token) return null;
    const session = await resolveBuyerSession(token);
    return session ? session.buyer : null;
}

// The active vendor (seller) profile linked to an account, or null. Drives the derived role: an
// account with a linked active vendor is a seller, otherwise a buyer.
export async function getAccountLinkedVendorId(accountId) {
    if (!accountId) return null;
    const row = await db.queryOne(
        `SELECT id FROM mkt_vendor WHERE account_id = $1 AND status = 'active' ORDER BY created_at ASC LIMIT 1`,
        [accountId]
    );
    return row?.id || null;
}
