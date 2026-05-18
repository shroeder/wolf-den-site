import "server-only";

import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/consignment/password";

export async function getConsignorBySlug(slug) {
    if (!slug) {
        return null;
    }

    const normalizedSlug = slug.trim().toLowerCase();
    const consignor = await db.queryOne(
        "SELECT * FROM consignors WHERE slug = $1",
        [normalizedSlug]
    );

    return consignor || null;
}

export async function getConsignorById(id) {
    if (!id) {
        return null;
    }

    const consignor = await db.queryOne(
        "SELECT * FROM consignors WHERE id = $1",
        [id]
    );

    return consignor || null;
}

export async function getActiveConsignorBySlug(slug) {
    const consignor = await getConsignorBySlug(slug);

    if (!consignor || !consignor.active) {
        return null;
    }

    return consignor;
}

export async function getPublicConsignorBySlug(slug) {
    const consignor = await getConsignorBySlug(slug);

    if (!consignor) {
        return null;
    }

    return {
        slug: consignor.slug,
        displayName: consignor.display_name,
        consignmentRate: Number(consignor.payout_rate),
        mustChangePassword: consignor.must_change_password,
        nightlyReportsEnabled: Boolean(consignor.nightly_reports_enabled),
    };
}

export async function validateConsignorPassword(slug, password) {
    const consignor = await getActiveConsignorBySlug(slug);

    if (!consignor || !consignor.password_hash) {
        return false;
    }

    return verifyPassword(password, consignor.password_hash);
}

export async function updateConsignorPassword(slug, newPassword) {
    const consignor = await getConsignorBySlug(slug);

    if (!consignor) {
        return false;
    }

    const { hashPassword } = await import("@/lib/consignment/password");
    const newHash = await hashPassword(newPassword);

    await db.query(
        "UPDATE consignors SET password_hash = $1, must_change_password = FALSE, updated_at = NOW() WHERE slug = $2",
        [newHash, slug]
    );

    return true;
}

export async function setConsignorPasswordFromSetup(consignorId, newPassword) {
    const { hashPassword } = await import("@/lib/consignment/password");
    const newHash = await hashPassword(newPassword);

    const result = await db.query(
        "UPDATE consignors SET password_hash = $1, must_change_password = FALSE, updated_at = NOW() WHERE id = $2 RETURNING slug",
        [newHash, consignorId]
    );

    return result[0]?.slug || null;
}

export async function setConsignorNightlyReportsEnabled(consignorId, enabled) {
    const rows = await db.query(
        "UPDATE consignors SET nightly_reports_enabled = $1, updated_at = NOW() WHERE id = $2 RETURNING id, nightly_reports_enabled",
        [Boolean(enabled), consignorId]
    );

    return rows[0] || null;
}