import "server-only";

import { db } from "@/lib/db";
import { decryptJson, encryptJson } from "@/lib/admin-app/crypto";
import { createServerLogger } from "@/lib/server-logger";

const integrationsLogger = createServerLogger({ source: "api", subsystem: "admin-app-integrations" });

const SQUARE_OAUTH_BASE = "https://connect.squareup.com";
// Refresh a Square token if it expires within this window.
const SQUARE_REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

export async function getIntegration(storeId, provider) {
    return db.queryOne(
        "SELECT * FROM store_integrations WHERE store_id = $1 AND provider = $2",
        [storeId, provider]
    );
}

/**
 * Returns { credential, metadata, status, expiresAt } for a store+provider, or
 * null if no integration row exists. `credential` is the decrypted JSON object
 * (e.g. { access_token, refresh_token }) or null when not connected.
 */
export async function getDecryptedCredential(storeId, provider) {
    const row = await getIntegration(storeId, provider);

    if (!row) {
        return null;
    }

    let credential = null;

    if (row.credential_encrypted) {
        try {
            credential = decryptJson(row.credential_encrypted);
        } catch (error) {
            integrationsLogger.error("admin_app.integrations.decrypt_failed", error, { storeId, provider });
            credential = null;
        }
    }

    return {
        credential,
        metadata: row.metadata || {},
        status: row.status,
        expiresAt: row.expires_at,
    };
}

export async function upsertIntegration(storeId, provider, { credentialObject, metadata = {}, status = "connected", expiresAt = null }) {
    const encrypted = credentialObject ? encryptJson(credentialObject) : null;

    await db.query(
        `INSERT INTO store_integrations (store_id, provider, status, credential_encrypted, metadata, expires_at, last_refreshed_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW())
         ON CONFLICT (store_id, provider) DO UPDATE
            SET status = EXCLUDED.status,
                credential_encrypted = EXCLUDED.credential_encrypted,
                metadata = EXCLUDED.metadata,
                expires_at = EXCLUDED.expires_at,
                last_refreshed_at = NOW(),
                updated_at = NOW()`,
        [storeId, provider, status, encrypted, JSON.stringify(metadata), expiresAt]
    );

    integrationsLogger.info("admin_app.integrations.upserted", { storeId, provider, status });
}

export async function setIntegrationStatus(storeId, provider, status) {
    await db.query(
        "UPDATE store_integrations SET status = $3, updated_at = NOW() WHERE store_id = $1 AND provider = $2",
        [storeId, provider, status]
    );
}

/**
 * Ensure a usable Square access token for a store: refresh via the OAuth refresh
 * token if the stored access token is near expiry. Returns the access token or null.
 */
export async function ensureSquareAccessToken(storeId) {
    const integration = await getDecryptedCredential(storeId, "square");

    if (!integration?.credential?.access_token) {
        return null;
    }

    const expiresAt = integration.expiresAt ? new Date(integration.expiresAt).getTime() : null;
    const needsRefresh = expiresAt !== null && expiresAt - Date.now() <= SQUARE_REFRESH_THRESHOLD_MS;

    if (!needsRefresh || !integration.credential.refresh_token) {
        return integration.credential.access_token;
    }

    const refreshed = await refreshSquareToken(storeId, integration.credential.refresh_token);

    return refreshed || integration.credential.access_token;
}

/**
 * Resolve the Square access token to use for a store. Returns the store's OWN
 * connected token, or — ONLY for a store explicitly flagged `uses_env_credentials`
 * (the flagship) — the global env token. Any other store with no connected Square
 * gets null, so it can never borrow the flagship's credentials.
 */
export async function resolveSquareAccessToken(storeId) {
    const ownToken = await ensureSquareAccessToken(storeId);

    if (ownToken) {
        return ownToken;
    }

    const store = await db.queryOne(
        "SELECT uses_env_credentials FROM stores WHERE id = $1",
        [storeId]
    );

    if (store?.uses_env_credentials && process.env.SQUARE_ACCESS_TOKEN) {
        return process.env.SQUARE_ACCESS_TOKEN;
    }

    return null;
}

export async function refreshSquareToken(storeId, refreshToken) {
    const clientId = process.env.SQUARE_OAUTH_CLIENT_ID || "";
    const clientSecret = process.env.SQUARE_OAUTH_CLIENT_SECRET || "";

    if (!clientId || !clientSecret) {
        integrationsLogger.error("admin_app.integrations.square.refresh.misconfigured", new Error("missing_square_oauth_env"), { storeId });
        return null;
    }

    try {
        const response = await fetch(`${SQUARE_OAUTH_BASE}/oauth2/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: "refresh_token",
                refresh_token: refreshToken,
            }),
        });

        const data = await response.json();

        if (!response.ok || !data.access_token) {
            integrationsLogger.error("admin_app.integrations.square.refresh.failed", new Error(data?.errors?.[0]?.code || "refresh_failed"), { storeId });
            await setIntegrationStatus(storeId, "square", "reauth_required");
            return null;
        }

        const existing = await getDecryptedCredential(storeId, "square");

        await upsertIntegration(storeId, "square", {
            credentialObject: {
                access_token: data.access_token,
                refresh_token: data.refresh_token || refreshToken,
            },
            metadata: existing?.metadata || {},
            status: "connected",
            expiresAt: data.expires_at || null,
        });

        integrationsLogger.info("admin_app.integrations.square.refreshed", { storeId });

        return data.access_token;
    } catch (error) {
        integrationsLogger.error("admin_app.integrations.square.refresh.error", error, { storeId });
        return null;
    }
}
