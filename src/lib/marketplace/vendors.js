import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { hashPassword, verifyPassword } from "@/lib/consignment/password";
import { db } from "@/lib/db";
import { createServerLogger } from "@/lib/server-logger";

// Marketplace vendors: hand-vetted by Luke, invited by email, self-onboard (set password + address),
// then upload inventory. A vendor row IS the login account. Mirrors the consignor / admin-app auth
// conventions: bcrypt passwords, only the sha256 hash of the invite token is stored.

const vendorsLogger = createServerLogger({ source: "api", subsystem: "marketplace-vendors" });

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const INVITE_TOKEN_BYTES = 32;
const INVITE_EXPIRY_DAYS = 14;

const VENDOR_COLUMNS = `id, email, display_name, status, password_hash,
    address_line1, address_line2, city, region, postal_code, country,
    location_label, latitude, longitude, logo_url,
    invited_at, accepted_at, last_login_at, created_at, updated_at`;

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function toIso(value) {
    return value ? new Date(value).toISOString() : null;
}

function toNumber(value) {
    return value !== null && value !== undefined ? Number(value) : null;
}

export function isValidEmail(value) {
    return EMAIL_PATTERN.test(normalizeEmail(value));
}

export function isValidPassword(value) {
    return typeof value === "string" && value.length >= MIN_PASSWORD_LENGTH;
}

function generateToken() {
    return randomBytes(INVITE_TOKEN_BYTES).toString("hex");
}

function hashToken(token) {
    return createHash("sha256").update(token).digest("hex");
}

function mapVendor(row) {
    if (!row) {
        return null;
    }

    return {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        logoUrl: row.logo_url || null,
        status: row.status,
        hasPassword: Boolean(row.password_hash),
        address: {
            line1: row.address_line1,
            line2: row.address_line2,
            city: row.city,
            region: row.region,
            postalCode: row.postal_code,
            country: row.country,
        },
        locationLabel: row.location_label,
        latitude: toNumber(row.latitude),
        longitude: toNumber(row.longitude),
        invitedAt: toIso(row.invited_at),
        acceptedAt: toIso(row.accepted_at),
        lastLoginAt: toIso(row.last_login_at),
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
    };
}

export async function getVendorById(id) {
    const row = await db.queryOne(
        `SELECT ${VENDOR_COLUMNS} FROM mkt_vendor WHERE id = $1`,
        [id]
    );

    return mapVendor(row);
}

export async function getVendorByEmail(email) {
    const row = await db.queryOne(
        `SELECT ${VENDOR_COLUMNS} FROM mkt_vendor WHERE email_normalized = $1`,
        [normalizeEmail(email)]
    );

    return mapVendor(row);
}

export async function listVendors({ status } = {}) {
    const rows = status
        ? await db.query(
              `SELECT ${VENDOR_COLUMNS} FROM mkt_vendor WHERE status = $1 ORDER BY created_at DESC`,
              [status]
          )
        : await db.query(`SELECT ${VENDOR_COLUMNS} FROM mkt_vendor ORDER BY created_at DESC`);

    return rows.map(mapVendor);
}

// Luke creates the vendor record (status 'invited'). Address is optional here — the vendor usually
// fills it in when they accept the invite.
export async function createVendor({ email, displayName, address = {}, logoUrl = null }) {
    const normalized = normalizeEmail(email);

    const row = await db.queryOne(
        `INSERT INTO mkt_vendor
            (email, email_normalized, display_name,
             address_line1, address_line2, city, region, postal_code, country, location_label, logo_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 'US'), $10, $11)
         RETURNING ${VENDOR_COLUMNS}`,
        [
            String(email || "").trim(),
            normalized,
            String(displayName || "").trim(),
            address.line1 || null,
            address.line2 || null,
            address.city || null,
            address.region || null,
            address.postalCode || null,
            address.country || null,
            address.locationLabel || null,
            logoUrl || null,
        ]
    );

    vendorsLogger.info("marketplace.vendor.created", { step: "vendor_created", vendorId: row.id });

    return mapVendor(row);
}

// Set (or clear) a vendor's logo URL. Used by the vendor portal.
export async function setVendorLogo(id, logoUrl) {
    const row = await db.queryOne(
        `UPDATE mkt_vendor SET logo_url = $2, updated_at = NOW() WHERE id = $1 RETURNING ${VENDOR_COLUMNS}`,
        [id, logoUrl || null]
    );

    return mapVendor(row);
}

// Generate (or regenerate) an invite token for a vendor. Returns the RAW token to embed in the
// emailed link; only its hash is stored.
export async function createVendorInvite(vendorId) {
    const token = generateToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await db.query(
        `UPDATE mkt_vendor
         SET invite_token_hash = $2, invite_expires_at = $3, invited_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [vendorId, tokenHash, expiresAt]
    );

    return token;
}

// Look up the vendor an invite token belongs to, with validity flags (for the accept-invite page).
export async function getVendorInviteState(rawToken) {
    if (!rawToken) {
        return null;
    }

    const row = await db.queryOne(
        `SELECT ${VENDOR_COLUMNS}, invite_expires_at FROM mkt_vendor WHERE invite_token_hash = $1`,
        [hashToken(rawToken)]
    );

    if (!row) {
        return null;
    }

    return {
        vendor: mapVendor(row),
        expired: !row.invite_expires_at || new Date(row.invite_expires_at) < new Date(),
        alreadyAccepted: Boolean(row.accepted_at),
    };
}

// Vendor accepts their invite: sets a password, optionally fills address, goes 'active'. The invite
// token is single-use (cleared on accept).
export async function acceptVendorInvite({ token, password, displayName, address }) {
    const state = await getVendorInviteState(token);

    if (!state || state.expired || state.alreadyAccepted) {
        return null;
    }

    if (!isValidPassword(password)) {
        throw new Error("Password does not meet the minimum length requirement.");
    }

    const passwordHash = await hashPassword(password);
    const addr = address || {};

    const row = await db.queryOne(
        `UPDATE mkt_vendor
         SET password_hash = $2,
             status = 'active',
             display_name = COALESCE($3, display_name),
             address_line1 = COALESCE($4, address_line1),
             address_line2 = COALESCE($5, address_line2),
             city = COALESCE($6, city),
             region = COALESCE($7, region),
             postal_code = COALESCE($8, postal_code),
             country = COALESCE($9, country),
             location_label = COALESCE($10, location_label),
             invite_token_hash = NULL,
             invite_expires_at = NULL,
             accepted_at = NOW(),
             updated_at = NOW()
         WHERE id = $1
         RETURNING ${VENDOR_COLUMNS}`,
        [
            state.vendor.id,
            passwordHash,
            displayName ? String(displayName).trim() : null,
            addr.line1 || null,
            addr.line2 || null,
            addr.city || null,
            addr.region || null,
            addr.postalCode || null,
            addr.country || null,
            addr.locationLabel || null,
        ]
    );

    vendorsLogger.info("marketplace.vendor.accepted", { step: "vendor_accepted", vendorId: row.id });

    return mapVendor(row);
}

// Verify email + password for an ACTIVE vendor. Returns the vendor on success, null otherwise.
export async function authenticateVendor(email, password) {
    const row = await db.queryOne(
        `SELECT ${VENDOR_COLUMNS} FROM mkt_vendor WHERE email_normalized = $1`,
        [normalizeEmail(email)]
    );

    if (!row || row.status !== "active" || !row.password_hash) {
        return null;
    }

    const ok = await verifyPassword(password, row.password_hash);

    if (!ok) {
        return null;
    }

    await db.query(`UPDATE mkt_vendor SET last_login_at = NOW() WHERE id = $1`, [row.id]);

    return mapVendor(row);
}

// active | suspended | removed — Luke's control to kick a vendor out (hides their listings via the
// vendor-status filter in search) without deleting history.
export async function setVendorStatus(id, status) {
    const row = await db.queryOne(
        `UPDATE mkt_vendor SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING ${VENDOR_COLUMNS}`,
        [id, status]
    );

    return mapVendor(row);
}

// Admin view: every vendor (any status) + their active listing count, newest first.
export async function listVendorsForAdmin() {
    const rows = await db.query(
        `SELECT ${VENDOR_COLUMNS.split(",").map((c) => `v.${c.trim()}`).join(", ")},
                COUNT(l.id) FILTER (WHERE l.status = 'active') AS active_listings
         FROM mkt_vendor v
         LEFT JOIN mkt_listing l ON l.vendor_id = v.id
         GROUP BY v.id
         ORDER BY v.created_at DESC`
    );

    return rows.map((row) => ({ ...mapVendor(row), activeListings: Number(row.active_listings) || 0 }));
}

// Set a vendor's geocoded coordinates (best-effort, after onboarding address capture).
export async function setVendorCoordinates(id, latitude, longitude) {
    await db.query(
        `UPDATE mkt_vendor SET latitude = $2, longitude = $3, updated_at = NOW() WHERE id = $1`,
        [id, latitude, longitude]
    );
}
