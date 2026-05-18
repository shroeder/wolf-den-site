import "server-only";

import { sendAdminSetupEmail } from "@/lib/admin/email";
import { createAdminSetupToken } from "@/lib/admin/setup-token";
import { getConsignorDashboard, getConsignorSummary } from "@/lib/consignment/portal-data";
import { invalidateUnusedSetupTokens } from "@/lib/consignment/tokens";
import { db } from "@/lib/db";

function toIso(value) {
    return value ? new Date(value).toISOString() : null;
}

function deriveOnboardingStatus(row) {
    if (!row.active) {
        return "revoked";
    }

    if (row.password_hash) {
        return "active";
    }

    const expiresAt = row.setup_token_expires_at ? new Date(row.setup_token_expires_at) : null;
    const hasUnusedValidInvite = Boolean(expiresAt && !row.setup_token_used_at && expiresAt > new Date());

    if (hasUnusedValidInvite) {
        return "invited";
    }

    return "invite_expired";
}

function mapAdminConsignor(row) {
    return {
        id: row.id,
        slug: row.slug,
        displayName: row.display_name,
        email: row.email,
        squareCategoryId: row.square_category_id,
        payoutRate: Number(row.payout_rate || 0),
        active: Boolean(row.active),
        onboardingStatus: deriveOnboardingStatus(row),
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
        lastInviteSentAt: toIso(row.last_invite_sent_at),
        setupTokenExpiresAt: toIso(row.setup_token_expires_at),
        setupTokenUsedAt: toIso(row.setup_token_used_at),
    };
}

async function fetchAdminConsignorRowById(id) {
    return db.queryOne(
        `SELECT c.*, latest.created_at AS last_invite_sent_at, latest.expires_at AS setup_token_expires_at, latest.used_at AS setup_token_used_at
         FROM consignors c
         LEFT JOIN LATERAL (
             SELECT t.created_at, t.expires_at, t.used_at
             FROM consignor_setup_tokens t
             WHERE t.consignor_id = c.id
             ORDER BY t.created_at DESC
             LIMIT 1
         ) latest ON TRUE
         WHERE c.id = $1`,
        [id]
    );
}

export async function listAdminConsignors() {
    const rows = await db.query(
        `SELECT c.*, latest.created_at AS last_invite_sent_at, latest.expires_at AS setup_token_expires_at, latest.used_at AS setup_token_used_at
         FROM consignors c
         LEFT JOIN LATERAL (
             SELECT t.created_at, t.expires_at, t.used_at
             FROM consignor_setup_tokens t
             WHERE t.consignor_id = c.id
             ORDER BY t.created_at DESC
             LIMIT 1
         ) latest ON TRUE
         ORDER BY c.created_at DESC`
    );

    return rows.map(mapAdminConsignor);
}

export async function getAdminConsignorDetail(id, options = {}) {
    const row = await fetchAdminConsignorRowById(id);

    if (!row) {
        return null;
    }

    const summary = await getConsignorSummary(row.id, options);

    return {
        consignor: mapAdminConsignor(row),
        profile: {
            id: row.id,
            slug: row.slug,
            displayName: row.display_name,
            email: row.email,
            squareCategoryId: row.square_category_id,
            payoutRate: Number(row.payout_rate || 0),
            active: Boolean(row.active),
        },
        onboarding: {
            status: deriveOnboardingStatus(row),
            lastInviteSentAt: toIso(row.last_invite_sent_at),
            setupTokenExpiresAt: toIso(row.setup_token_expires_at),
            setupTokenUsedAt: toIso(row.setup_token_used_at),
        },
        square: {
            categoryId: row.square_category_id,
        },
        recentSummaryTotals: summary,
    };
}

export async function createAdminConsignor(payload) {
    const existingSlug = await db.queryOne("SELECT id FROM consignors WHERE slug = $1", [payload.slug]);

    if (existingSlug) {
        return { error: "slug_already_exists", status: 409 };
    }

    const existingEmail = await db.queryOne("SELECT id FROM consignors WHERE email = $1", [payload.email]);

    if (existingEmail) {
        return { error: "email_already_exists", status: 409 };
    }

    const rows = await db.query(
        `INSERT INTO consignors (slug, display_name, email, square_category_id, payout_rate, active)
         VALUES ($1, $2, $3, $4, $5, TRUE)
         RETURNING id, slug, display_name, email, square_category_id, payout_rate, active, created_at, updated_at`,
        [payload.slug, payload.displayName, payload.email, payload.squareCategoryId, payload.payoutRate]
    );

    const consignor = rows[0];

    if (!consignor?.id) {
        return { error: "consignor_create_failed", status: 500 };
    }

    const setupToken = await createAdminSetupToken(consignor.id);

    await sendAdminSetupEmail(consignor, setupToken);

    const fullRow = await fetchAdminConsignorRowById(consignor.id);

    return {
        consignor: mapAdminConsignor(fullRow || consignor),
    };
}

export async function inviteAdminConsignor(id) {
    const consignor = await db.queryOne(
        "SELECT id, slug, display_name, email, active FROM consignors WHERE id = $1",
        [id]
    );

    if (!consignor) {
        return { error: "consignor_not_found", status: 404 };
    }

    if (!consignor.active) {
        return { error: "consignor_revoked", status: 409 };
    }

    await invalidateUnusedSetupTokens(consignor.id);

    const setupToken = await createAdminSetupToken(consignor.id);

    await sendAdminSetupEmail(consignor, setupToken);

    const fullRow = await fetchAdminConsignorRowById(consignor.id);

    return {
        consignor: mapAdminConsignor(fullRow || consignor),
    };
}

export async function updateAdminConsignor(id, updates) {
    const assignments = [];
    const values = [];

    if (updates.displayName !== undefined) {
        assignments.push(`display_name = $${assignments.length + 1}`);
        values.push(updates.displayName);
    }

    if (updates.email !== undefined) {
        assignments.push(`email = $${assignments.length + 1}`);
        values.push(updates.email);
    }

    if (updates.squareCategoryId !== undefined) {
        assignments.push(`square_category_id = $${assignments.length + 1}`);
        values.push(updates.squareCategoryId);
    }

    if (updates.payoutRate !== undefined) {
        assignments.push(`payout_rate = $${assignments.length + 1}`);
        values.push(updates.payoutRate);
    }

    if (updates.active !== undefined) {
        assignments.push(`active = $${assignments.length + 1}`);
        values.push(Boolean(updates.active));
    }

    if (!assignments.length) {
        return { error: "no_valid_fields", status: 400 };
    }

    values.push(id);

    try {
        const rows = await db.query(
            `UPDATE consignors
             SET ${assignments.join(", ")}, updated_at = NOW()
             WHERE id = $${values.length}
             RETURNING id`,
            values
        );

        if (!rows.length) {
            return { error: "consignor_not_found", status: 404 };
        }
    } catch (error) {
        if (error.message.includes("duplicate key value") && error.message.includes("consignors_slug_key")) {
            return { error: "slug_already_exists", status: 409 };
        }

        if (error.message.includes("duplicate key value") && error.message.includes("consignors_email_key")) {
            return { error: "email_already_exists", status: 409 };
        }

        throw error;
    }

    const fullRow = await fetchAdminConsignorRowById(id);

    return {
        consignor: mapAdminConsignor(fullRow),
    };
}

export async function revokeAdminConsignor(id) {
    const rows = await db.query(
        `UPDATE consignors
         SET active = FALSE, updated_at = NOW()
         WHERE id = $1
         RETURNING id`,
        [id]
    );

    if (!rows.length) {
        return { error: "consignor_not_found", status: 404 };
    }

    await invalidateUnusedSetupTokens(id);

    const fullRow = await fetchAdminConsignorRowById(id);

    return {
        consignor: mapAdminConsignor(fullRow),
    };
}

export async function restoreAdminConsignor(id) {
    const rows = await db.query(
        `UPDATE consignors
         SET active = TRUE, updated_at = NOW()
         WHERE id = $1
         RETURNING id`,
        [id]
    );

    if (!rows.length) {
        return { error: "consignor_not_found", status: 404 };
    }

    const fullRow = await fetchAdminConsignorRowById(id);

    return {
        consignor: mapAdminConsignor(fullRow),
    };
}

export async function getAdminConsignorDashboard(id, options = {}) {
    const consignor = await db.queryOne("SELECT id FROM consignors WHERE id = $1", [id]);

    if (!consignor) {
        return { error: "consignor_not_found", status: 404 };
    }

    const dashboard = await getConsignorDashboard(id, options);

    return { dashboard };
 }
