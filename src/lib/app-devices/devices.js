import "server-only";

import { db } from "@/lib/db";

// Employee-app device registry backing the soft kill-switch. Each install check-ins via heartbeat;
// the owner lists devices and flips `revoked` to lock one without affecting others.

function toIso(value) {
    return value ? new Date(value).toISOString() : null;
}

function mapDevice(row) {
    return {
        id: row.id,
        channel: row.channel,
        label: row.label || null,
        revoked: Boolean(row.revoked),
        authorized: Boolean(row.authorized),
        appVersion: row.app_version || null,
        firstSeenAt: toIso(row.first_seen_at),
        lastSeenAt: toIso(row.last_seen_at),
    };
}

// Runtime secret hydration. Registers/updates the device (like heartbeat), then returns the server-held
// secrets ONLY if the device is explicitly authorized and not revoked. Unauthorized devices register
// as pending (authorized=false) and get NOTHING — the owner authorizes them out-of-band. This is how
// the apps carry no baked secrets: the APK is clean, secrets are delivered to confirmed devices only.
export async function hydrateDeviceSecrets({ deviceId, channel = "full", label = null, appVersion = null }) {
    if (!deviceId) {
        throw new Error("deviceId is required.");
    }
    const row = await db.queryOne(
        `INSERT INTO app_device (id, channel, label, app_version)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET
            last_seen_at = NOW(),
            app_version = EXCLUDED.app_version,
            channel = EXCLUDED.channel,
            label = COALESCE(app_device.label, EXCLUDED.label)
         RETURNING revoked, authorized`,
        [deviceId, channel, label, appVersion]
    );

    const authorized = Boolean(row?.authorized) && !row?.revoked;
    if (!authorized) {
        return { authorized: false };
    }

    return {
        authorized: true,
        secrets: {
            openAiApiKey: process.env.OPENAI_API_KEY || "",
            adminApiKey: process.env.ADMIN_API_KEY || "",
            plaidClientId: process.env.PLAID_CLIENT_ID || "",
            plaidSecret: process.env.PLAID_SECRET || "",
            plaidEnv: process.env.PLAID_ENV || "production",
            plaidInstitutionId: process.env.PLAID_INSTITUTION_ID || "",
        },
    };
}

// Owner action: authorize / de-authorize a device for secret hydration (by device id).
export async function setDeviceAuthorized(id, authorized) {
    const row = await db.queryOne(
        `UPDATE app_device SET authorized = $2 WHERE id = $1 RETURNING *`,
        [id, Boolean(authorized)]
    );
    return row ? mapDevice(row) : null;
}

// Upsert a device on check-in and report whether it's revoked. Keeps an owner-set label (COALESCE on
// the existing label) so a rename isn't overwritten by the model the app keeps sending.
export async function heartbeat({ deviceId, channel = "employee", label = null, appVersion = null, fcmToken = null }) {
    if (!deviceId) {
        throw new Error("deviceId is required.");
    }

    // Only overwrite fcm_token when the app actually sends one, so a heartbeat without a token
    // (token not ready yet) doesn't wipe a previously-registered token.
    const token = typeof fcmToken === "string" && fcmToken.trim() ? fcmToken.trim() : null;

    const row = await db.queryOne(
        `INSERT INTO app_device (id, channel, label, app_version, fcm_token)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
            last_seen_at = NOW(),
            app_version = EXCLUDED.app_version,
            channel = EXCLUDED.channel,
            label = COALESCE(app_device.label, EXCLUDED.label),
            fcm_token = COALESCE(EXCLUDED.fcm_token, app_device.fcm_token)
         RETURNING revoked`,
        [deviceId, channel, label, appVersion, token]
    );

    return { revoked: Boolean(row?.revoked) };
}

export async function listDevices(channel = null) {
    const rows = channel
        ? await db.query(
              `SELECT * FROM app_device WHERE channel = $1 ORDER BY last_seen_at DESC`,
              [channel]
          )
        : await db.query(`SELECT * FROM app_device ORDER BY last_seen_at DESC`);
    return rows.map(mapDevice);
}

// Owner actions: revoke/allow and rename. Returns the updated device, or null if not found.
export async function updateDevice(id, { revoked, label, authorized } = {}) {
    const sets = [];
    const params = [id];

    if (revoked !== undefined) {
        params.push(Boolean(revoked));
        sets.push(`revoked = $${params.length}`);
    }
    if (authorized !== undefined) {
        params.push(Boolean(authorized));
        sets.push(`authorized = $${params.length}`);
    }
    if (label !== undefined) {
        params.push(label ? String(label).slice(0, 120) : null);
        sets.push(`label = $${params.length}`);
    }

    if (sets.length === 0) {
        const row = await db.queryOne(`SELECT * FROM app_device WHERE id = $1`, [id]);
        return row ? mapDevice(row) : null;
    }

    const row = await db.queryOne(
        `UPDATE app_device SET ${sets.join(", ")} WHERE id = $1 RETURNING *`,
        params
    );
    return row ? mapDevice(row) : null;
}
