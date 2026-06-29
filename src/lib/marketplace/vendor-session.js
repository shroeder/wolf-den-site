import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { cookies } from "next/headers";

import { db } from "@/lib/db";

// Vendor web sessions on the mkt_vendor_session table — same shape as admin_app_sessions
// (revocable, only the token hash stored), surfaced to the browser via an httpOnly cookie.

export const MKT_VENDOR_COOKIE = "wolfden-mkt-vendor-session";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const TOKEN_BYTES = 32;

function generateToken() {
    return randomBytes(TOKEN_BYTES).toString("hex");
}

function hashToken(token) {
    return createHash("sha256").update(token).digest("hex");
}

export async function createVendorSession(vendorId, { deviceLabel = "web" } = {}) {
    const token = generateToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await db.query(
        `INSERT INTO mkt_vendor_session (vendor_id, token_hash, device_label, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [vendorId, tokenHash, deviceLabel, expiresAt]
    );

    return { token, expiresAt: expiresAt.toISOString() };
}

// Resolve a raw token to its (active) vendor, or null. Updates last_used_at.
export async function resolveVendorSession(token) {
    if (!token || typeof token !== "string") {
        return null;
    }

    const row = await db.queryOne(
        `SELECT s.id AS session_id, s.expires_at, s.revoked_at,
                v.id, v.display_name, v.email, v.status, v.location_label
         FROM mkt_vendor_session s
         JOIN mkt_vendor v ON v.id = s.vendor_id
         WHERE s.token_hash = $1`,
        [hashToken(token)]
    );

    if (!row || row.revoked_at || row.status !== "active") {
        return null;
    }

    if (new Date(row.expires_at) <= new Date()) {
        return null;
    }

    await db.query("UPDATE mkt_vendor_session SET last_used_at = NOW() WHERE id = $1", [row.session_id]);

    return {
        sessionId: row.session_id,
        vendor: {
            id: row.id,
            displayName: row.display_name,
            email: row.email,
            status: row.status,
            locationLabel: row.location_label,
        },
    };
}

export async function revokeVendorSession(token) {
    if (!token) {
        return;
    }

    await db.query(
        "UPDATE mkt_vendor_session SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL",
        [hashToken(token)]
    );
}

export async function setVendorSessionCookie(token) {
    const cookieStore = await cookies();

    cookieStore.set(MKT_VENDOR_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: COOKIE_MAX_AGE_SECONDS,
    });
}

export async function clearVendorSessionCookie() {
    const cookieStore = await cookies();

    cookieStore.delete(MKT_VENDOR_COOKIE);
}

export async function getVendorSessionToken() {
    const cookieStore = await cookies();

    return cookieStore.get(MKT_VENDOR_COOKIE)?.value || null;
}

// The authenticated vendor for the current request (server components + route handlers), or null.
export async function getAuthenticatedVendor() {
    const token = await getVendorSessionToken();

    if (!token) {
        return null;
    }

    const session = await resolveVendorSession(token);

    return session ? session.vendor : null;
}
