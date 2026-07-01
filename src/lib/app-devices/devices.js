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
        appVersion: row.app_version || null,
        firstSeenAt: toIso(row.first_seen_at),
        lastSeenAt: toIso(row.last_seen_at),
    };
}

// Upsert a device on check-in and report whether it's revoked. Keeps an owner-set label (COALESCE on
// the existing label) so a rename isn't overwritten by the model the app keeps sending.
export async function heartbeat({ deviceId, channel = "employee", label = null, appVersion = null }) {
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
         RETURNING revoked`,
        [deviceId, channel, label, appVersion]
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
export async function updateDevice(id, { revoked, label } = {}) {
    const sets = [];
    const params = [id];

    if (revoked !== undefined) {
        params.push(Boolean(revoked));
        sets.push(`revoked = $${params.length}`);
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
